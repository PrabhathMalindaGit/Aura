import logging

from fastapi import APIRouter, Request

from src.models.schemas import RagReplyRequest, RagReplyResponse
from src.services.rag_response import build_grounded_reply
from src.services.rag_store import retrieve_static_knowledge

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/rag/reply", response_model=RagReplyResponse, summary="Grounded RAG reply")
def rag_reply(req: RagReplyRequest, request: Request) -> RagReplyResponse:
    request_id = getattr(request.state, "request_id", None)

    logger.info(
        "ai.rag.request",
        extra={
            "requestId": request_id,
            "route": request.url.path,
            "patientId": req.patientId,
        },
    )

    retrieval_results = retrieve_static_knowledge(req.message)
    response = RagReplyResponse.model_validate(
        build_grounded_reply(req.message, retrieval_results)
    )

    logger.info(
        "ai.rag.completed",
        extra={
            "requestId": request_id,
            "route": request.url.path,
            "patientId": req.patientId,
            "retrievedSourceCount": len(retrieval_results),
            "fallbackUsed": response.grounding.fallbackUsed
            if response.grounding is not None
            else None,
        },
    )

    return response
