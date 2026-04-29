#!/usr/bin/env python3
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.config import ConfigurationError, get_settings
from src.services.pgvector_store import (
    PGVectorUnavailable,
    upsert_static_knowledge_chunks,
)
from src.services.rag_store import load_static_knowledge


def main() -> int:
    try:
        settings = get_settings()
    except ConfigurationError as exc:
        print(f"Configuration error: {exc}", file=sys.stderr)
        return 2

    database_url = settings.rag_pgvector_database_url.strip()
    if not database_url:
        print(
            "RAG_PGVECTOR_DATABASE_URL is required for static knowledge ingestion",
            file=sys.stderr,
        )
        return 2

    chunks = list(load_static_knowledge())
    try:
        count = upsert_static_knowledge_chunks(
            chunks,
            database_url=database_url,
            dimensions=settings.rag_pgvector_dimensions,
        )
    except PGVectorUnavailable as exc:
        print(f"PGVector ingestion failed: {exc}", file=sys.stderr)
        return 1

    print(f"Upserted {count} static rehabilitation knowledge chunks into PGVector.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
