import logging
import os
import re
import secrets
import time
import uuid

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from src.config import ConfigurationError, get_settings
from src.logging_conf import setup_logging
from src.routers.classify import router as classify_router
from src.routers.health import router as health_router
from src.routers.rag import router as rag_router

settings = None
startup_config_error: ConfigurationError | None = None

try:
    settings = get_settings()
    setup_logging(settings.log_level)
except ConfigurationError as exc:
    startup_config_error = exc
    setup_logging(os.getenv("LOG_LEVEL", "INFO").strip().upper() or "INFO")

logger = logging.getLogger(__name__)
REQUEST_ID_HEADER = "x-request-id"
REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9._:-]+$")
REQUEST_ID_MAX_LENGTH = 128

app = FastAPI(title="Aura AI Service")

if startup_config_error is not None:
    logger.error(
        "ai.startup.config_invalid",
        extra={
            "reason": "CONFIG_INVALID",
            "errorType": type(startup_config_error).__name__,
        },
    )

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


def _sanitize_request_id(value: str | None) -> str | None:
    if value is None:
        return None

    normalized = value.strip()
    if (
        not normalized
        or len(normalized) > REQUEST_ID_MAX_LENGTH
        or REQUEST_ID_PATTERN.match(normalized) is None
    ):
        return None

    return normalized


def _get_or_create_request_id(request: Request) -> str:
    existing = getattr(request.state, "request_id", None)
    if isinstance(existing, str) and existing:
        return existing

    request_id = _sanitize_request_id(request.headers.get(REQUEST_ID_HEADER)) or str(
        uuid.uuid4()
    )
    request.state.request_id = request_id
    return request_id


def _should_skip_request_log(request: Request) -> bool:
    return request.method.upper() == "OPTIONS" or _is_health_path(request.url.path)


@app.middleware("http")
async def request_context(request: Request, call_next):
    request_id = _get_or_create_request_id(request)
    started_at = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception as exc:
        logger.error(
            "ai.request.unhandled_exception",
            extra={
                "requestId": request_id,
                "method": request.method,
                "route": request.url.path,
                "errorType": type(exc).__name__,
            },
        )
        response = JSONResponse(
            status_code=500,
            content={"ok": False, "error": "INTERNAL_ERROR"},
        )
    response.headers[REQUEST_ID_HEADER] = request_id

    if not _should_skip_request_log(request):
        logger.info(
            "http.request.completed",
            extra={
                "requestId": request_id,
                "method": request.method,
                "route": request.url.path,
                "statusCode": response.status_code,
                "durationMs": round((time.perf_counter() - started_at) * 1000, 2),
            },
        )

    return response


@app.middleware("http")
async def require_service_auth(request: Request, call_next):
    request_id = _get_or_create_request_id(request)
    if _is_health_path(request.url.path):
        return await call_next(request)

    try:
        current_settings = get_settings()
    except ConfigurationError as exc:
        logger.error(
            "ai.request.unready",
            extra={
                "requestId": request_id,
                "route": request.url.path,
                "reason": "CONFIG_INVALID",
                "errorType": type(exc).__name__,
            },
        )
        response = JSONResponse(
            status_code=503,
            content={"ok": False, "error": "SERVICE_UNREADY"},
        )
        response.headers[REQUEST_ID_HEADER] = request_id
        return response

    provided_key = request.headers.get("x-aura-ai-key", "")
    expected_key = current_settings.aura_ai_service_key

    if not expected_key or not provided_key or not secrets.compare_digest(
        provided_key, expected_key
    ):
        logger.warning(
            "ai.auth.failed",
            extra={
                "requestId": request_id,
                "route": request.url.path,
                "statusCode": 401,
            },
        )
        response = JSONResponse(
            status_code=401,
            content={"ok": False, "error": "UNAUTHORIZED"},
        )
        response.headers[REQUEST_ID_HEADER] = request_id
        return response

    return await call_next(request)

app.include_router(health_router, prefix="/health", tags=["health"])
app.include_router(classify_router, tags=["classify"])
app.include_router(rag_router, tags=["rag"])


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    request_id = _get_or_create_request_id(request)
    logger.error(
        "ai.request.unhandled_exception",
        extra={
            "requestId": request_id,
            "method": request.method,
            "route": request.url.path,
            "errorType": type(exc).__name__,
        },
    )
    response = JSONResponse(
        status_code=500,
        content={"ok": False, "error": "INTERNAL_ERROR"},
    )
    response.headers[REQUEST_ID_HEADER] = request_id
    return response
