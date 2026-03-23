import logging
import secrets

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from src.config import get_settings
from src.logging_conf import setup_logging
from src.routers.classify import router as classify_router
from src.routers.health import router as health_router
from src.routers.rag import router as rag_router

settings = get_settings()
setup_logging(settings.log_level)

logger = logging.getLogger(__name__)

app = FastAPI(title="Aura AI Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:19006",
        "http://localhost:5173",
        "http://localhost:8081",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:19006",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:8081",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _is_health_path(path: str) -> bool:
    return path == "/health" or path.startswith("/health/")


@app.middleware("http")
async def require_service_auth(request: Request, call_next):
    if _is_health_path(request.url.path):
        return await call_next(request)

    current_settings = get_settings()
    provided_key = request.headers.get("x-aura-ai-key", "")
    expected_key = current_settings.aura_ai_service_key

    if not expected_key or not provided_key or not secrets.compare_digest(
        provided_key, expected_key
    ):
        return JSONResponse(
            status_code=401,
            content={"ok": False, "error": "UNAUTHORIZED"},
        )

    return await call_next(request)

app.include_router(health_router, prefix="/health", tags=["health"])
app.include_router(classify_router, tags=["classify"])
app.include_router(rag_router, tags=["rag"])


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("unhandled exception on path=%s", request.url.path)
    return JSONResponse(status_code=500, content={"ok": False, "error": "INTERNAL_ERROR"})
