import logging

from fastapi import APIRouter

from src.config import get_settings
from src.logging_conf import redact_text
from src.models.schemas import ClassifyRequest, ClassifyResponse
from src.services.router_service import classify_risk

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/classify", response_model=ClassifyResponse, summary="Classify risk")
def classify(req: ClassifyRequest) -> ClassifyResponse:
    settings = get_settings()

    logger.info(
        "classify request: type=%s pain=%s text_preview=%s",
        req.type,
        req.pain,
        redact_text(req.text),
    )

    result = classify_risk(req, settings.pain_high_threshold)
    logger.info("classify result: risk=%s reasons=%s", result.risk, result.reasons)
    return result
