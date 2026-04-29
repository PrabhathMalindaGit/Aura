from src.services.rag_store import RetrievalResult, source_to_grounding


SAFE_FALLBACK_REPLY = (
    "Thanks for sharing this update. I can help you log what changed today. "
    "Keep following the plan from your care team, and contact your care team "
    "if symptoms are new, worsening, unusual, or worrying."
)


def build_grounded_reply(
    message: str,
    retrieval_results: list[RetrievalResult],
) -> dict[str, object]:
    if not retrieval_results:
        return {
            "reply": SAFE_FALLBACK_REPLY,
            "citations": [],
            "grounding": {
                "fallbackUsed": True,
                "sources": [],
            },
        }

    primary = retrieval_results[0].chunk
    sources = [source_to_grounding(result) for result in retrieval_results]
    citations = [
        f"static-rehab:{result.chunk.id}@{result.chunk.source_version}"
        for result in retrieval_results
    ]

    reply = (
        "Thanks for sharing this update. "
        f"{primary.safe_response_snippet} "
        "If symptoms are new, worsening, unusual, or worrying, contact your care team."
    )

    return {
        "reply": reply[:500],
        "citations": citations,
        "grounding": {
            "fallbackUsed": False,
            "sources": sources,
        },
    }
