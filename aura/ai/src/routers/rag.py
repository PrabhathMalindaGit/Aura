import logging

from fastapi import APIRouter, Request

from src.models.schemas import RagReplyRequest, RagReplyResponse

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/rag/reply", response_model=RagReplyResponse, summary="Stub RAG reply")
def rag_reply(req: RagReplyRequest, request: Request) -> RagReplyResponse:
    request_id = getattr(request.state, "request_id", None)
    normalized = " ".join(req.message.split()).strip()
    excerpt = normalized[:120] if normalized else "your update"

    logger.info(
        "ai.rag.request",
        extra={
            "requestId": request_id,
            "route": request.url.path,
            "patientId": req.patientId,
        },
    )

    response = RagReplyResponse(
        reply=(
            f"Thanks for the update. I noted '{excerpt}'. "
            "Keep your rehab plan steady and log another check-in tomorrow."
        ),
        citations=[],
    )

    logger.info(
        "ai.rag.completed",
        extra={
            "requestId": request_id,
            "route": request.url.path,
            "patientId": req.patientId,
        },
    )

    return response
