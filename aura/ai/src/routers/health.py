import logging

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from src.config import ConfigurationError, get_settings

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("", summary="Health check")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/ready", summary="Readiness check", response_model=None)
def readiness() -> JSONResponse | dict[str, str]:
    try:
        get_settings()
    except ConfigurationError as exc:
        logger.error(
            "ai.readiness.failed",
            extra={
                "reason": "CONFIG_INVALID",
                "errorType": type(exc).__name__,
            },
        )
        return JSONResponse(
            status_code=503,
            content={"status": "unready", "reason": "CONFIG_INVALID"},
        )

    return {"status": "ready"}
