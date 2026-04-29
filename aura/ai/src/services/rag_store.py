import json
import logging
from functools import lru_cache
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field, field_validator

from src.config import get_settings
from src.services.embedding import lexical_score
from src.services.pgvector_store import (
    PGVectorUnavailable,
    is_pgvector_configured,
    retrieve_static_knowledge_rows,
)


_KNOWLEDGE_PATH = Path(__file__).resolve().parents[2] / "data" / "rehab_knowledge.json"
_MIN_RELEVANCE_SCORE = 0.09
logger = logging.getLogger(__name__)


class KnowledgeChunk(BaseModel):
    id: str = Field(min_length=1)
    title: str = Field(min_length=1)
    category: str = Field(min_length=1)
    text: str = Field(min_length=1)
    safe_response_snippet: str = Field(min_length=1)
    source_version: str = Field(min_length=1)
    safety_tags: list[str] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)

    @field_validator("safe_response_snippet")
    @classmethod
    def validate_snippet(cls, value: str) -> str:
        normalized = " ".join(value.split()).strip()
        if len(normalized) > 280:
            raise ValueError("safe_response_snippet must be concise")
        return normalized

    def searchable_text(self) -> str:
        return " ".join(
            [
                self.id.replace("_", " "),
                self.title,
                self.category,
                self.text,
                self.safe_response_snippet,
                " ".join(self.safety_tags),
                " ".join(self.keywords),
            ]
        )


class RetrievalResult(BaseModel):
    chunk: KnowledgeChunk
    score: float


@lru_cache(maxsize=1)
def load_static_knowledge() -> tuple[KnowledgeChunk, ...]:
    raw_items = json.loads(_KNOWLEDGE_PATH.read_text(encoding="utf-8"))
    if not isinstance(raw_items, list):
        raise ValueError("rehab knowledge base must be a JSON array")

    chunks = tuple(KnowledgeChunk.model_validate(item) for item in raw_items)
    ids = [chunk.id for chunk in chunks]
    if len(set(ids)) != len(ids):
        raise ValueError("rehab knowledge chunk ids must be unique")

    return chunks


def retrieve_static_knowledge_lexical(
    query: str,
    *,
    limit: int = 2,
) -> list[RetrievalResult]:
    normalized_query = " ".join(query.split()).strip()
    if not normalized_query:
        return []

    scored: list[RetrievalResult] = []
    for chunk in load_static_knowledge():
        score = lexical_score(normalized_query, chunk.searchable_text())
        if score >= _MIN_RELEVANCE_SCORE:
            scored.append(RetrievalResult(chunk=chunk, score=score))

    scored.sort(key=lambda result: (-result.score, result.chunk.id))
    return scored[:limit]


def _retrieve_static_knowledge_pgvector(
    query: str,
    *,
    limit: int,
) -> list[RetrievalResult]:
    rows = retrieve_static_knowledge_rows(query, limit=limit)
    results: list[RetrievalResult] = []
    for row in rows:
        score = float(row["score"])
        if score < _MIN_RELEVANCE_SCORE:
            continue

        chunk = KnowledgeChunk(
            id=row["id"],
            title=row["title"],
            category=row["category"],
            text=row["chunk_text"],
            safe_response_snippet=row["safe_response_snippet"],
            source_version=row["source_version"],
            safety_tags=list(row["safety_tags"] or []),
            keywords=list(row["keywords"] or []),
        )
        if lexical_score(query, chunk.searchable_text()) < _MIN_RELEVANCE_SCORE:
            continue
        results.append(RetrievalResult(chunk=chunk, score=score))

    return results


def retrieve_static_knowledge(query: str, *, limit: int = 2) -> list[RetrievalResult]:
    settings = get_settings()
    if is_pgvector_configured(settings):
        top_k = min(limit, settings.rag_pgvector_top_k)
        try:
            pgvector_results = _retrieve_static_knowledge_pgvector(
                query,
                limit=top_k,
            )
            if pgvector_results or not settings.rag_pgvector_fallback_enabled:
                return pgvector_results
        except PGVectorUnavailable as exc:
            if not settings.rag_pgvector_fallback_enabled:
                raise
            logger.warning(
                "ai.rag.pgvector_fallback_used",
                extra={"reason": type(exc).__name__},
            )

    return retrieve_static_knowledge_lexical(query, limit=limit)


def source_to_grounding(result: RetrievalResult) -> dict[str, Any]:
    chunk = result.chunk
    return {
        "id": chunk.id,
        "title": chunk.title,
        "category": chunk.category,
        "sourceVersion": chunk.source_version,
        "score": round(result.score, 4),
        "type": "static_rehab_knowledge",
    }
