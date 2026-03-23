import logging

from fastapi import APIRouter, Request

from src.config import get_settings
from src.logging_conf import redact_text
from src.models.schemas import ClassifyRequest, ClassifyResponse
from src.services.router_service import classify_risk

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/classify", response_model=ClassifyResponse, summary="Classify risk")
def classify(req: ClassifyRequest, request: Request) -> ClassifyResponse:
    settings = get_settings()
    request_id = getattr(request.state, "request_id", None)

    logger.info(
        "ai.classify.request",
        extra={
            "requestId": request_id,
            "route": request.url.path,
            "type": req.type,
            "pain": req.pain,
            "textPreview": redact_text(req.text),
        },
    )

    result = classify_risk(req, settings.pain_high_threshold)
    logger.info(
        "ai.classify.completed",
        extra={
            "requestId": request_id,
            "route": request.url.path,
            "risk": result.risk,
            "reasonCount": len(result.reasons),
        },
    )
    return result
