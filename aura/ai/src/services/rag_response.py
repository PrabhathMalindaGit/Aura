from src.models.schemas import RagPatientMemoryContextItem
from src.services.rag_store import RetrievalResult, source_to_grounding


SAFE_FALLBACK_REPLY = (
    "Thanks for sharing this update. I can help you log what changed today. "
    "Keep following the plan from your care team, and contact your care team "
    "if symptoms are new, worsening, unusual, or worrying."
)


def build_grounded_reply(
    message: str,
    retrieval_results: list[RetrievalResult],
    patient_memory: list[RagPatientMemoryContextItem] | None = None,
) -> dict[str, object]:
    memory_items = (patient_memory or [])[:3]
    memory_sources = [
        {
            "id": item.id,
            "memoryType": item.memoryType,
            "sourceKind": item.sourceKind,
            "score": round(item.score if item.score is not None else 0, 4),
            "type": "patient_memory",
        }
        for item in memory_items
    ]
    memory_citations = [f"patient-memory:{item.id}" for item in memory_items]
    memory_sentence = (
        " I'll keep your saved goals and preferences in mind."
        if memory_items
        else ""
    )

    if not retrieval_results:
        return {
            "reply": f"{SAFE_FALLBACK_REPLY}{memory_sentence}"[:500],
            "citations": memory_citations,
            "grounding": {
                "fallbackUsed": len(memory_items) == 0,
                "sources": memory_sources,
            },
        }

    primary = retrieval_results[0].chunk
    sources = [
        *[source_to_grounding(result) for result in retrieval_results],
        *memory_sources,
    ]
    citations = [
        f"static-rehab:{result.chunk.id}@{result.chunk.source_version}"
        for result in retrieval_results
    ] + memory_citations

    reply = (
        "Thanks for sharing this update. "
        f"{primary.safe_response_snippet} "
        "If symptoms are new, worsening, unusual, or worrying, contact your care team."
        f"{memory_sentence}"
    )

    return {
        "reply": reply[:500],
        "citations": citations,
        "grounding": {
            "fallbackUsed": False,
            "sources": sources,
        },
    }
