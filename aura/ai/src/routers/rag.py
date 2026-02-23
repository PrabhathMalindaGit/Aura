from fastapi import APIRouter

from src.models.schemas import RagReplyRequest, RagReplyResponse

router = APIRouter()


@router.post("/rag/reply", response_model=RagReplyResponse, summary="Stub RAG reply")
def rag_reply(req: RagReplyRequest) -> RagReplyResponse:
    normalized = " ".join(req.message.split()).strip()
    excerpt = normalized[:120] if normalized else "your update"

    return RagReplyResponse(
        reply=(
            f"Thanks for the update. I noted '{excerpt}'. "
            "Keep your rehab plan steady and log another check-in tomorrow."
        ),
        citations=[],
    )
