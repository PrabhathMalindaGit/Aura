from typing import Any

from src.config import Settings, get_settings
from src.services.embedding import deterministic_hashing_vector


STATIC_REHAB_TABLE = "static_rehab_knowledge_chunks"


class PGVectorUnavailable(RuntimeError):
    pass


def is_pgvector_configured(settings: Settings | None = None) -> bool:
    current_settings = settings or get_settings()
    return (
        current_settings.rag_pgvector_enabled
        and bool(current_settings.rag_pgvector_database_url.strip())
    )


def _connect(database_url: str):
    try:
        import psycopg
        from psycopg.rows import dict_row
    except ImportError as exc:
        raise PGVectorUnavailable("Postgres dependency is not installed") from exc

    try:
        connection = psycopg.connect(
            database_url,
            connect_timeout=2,
            row_factory=dict_row,
        )
        return connection
    except Exception as exc:
        raise PGVectorUnavailable("Could not connect to PGVector database") from exc


def _to_vector_literal(vector: list[float]) -> str:
    return f"[{','.join(format(component, '.12g') for component in vector)}]"


def _embedding_text(chunk: Any) -> str:
    searchable_text = getattr(chunk, "searchable_text", None)
    if callable(searchable_text):
        return searchable_text()

    return " ".join(
        [
            str(getattr(chunk, "id", "")).replace("_", " "),
            str(getattr(chunk, "title", "")),
            str(getattr(chunk, "category", "")),
            str(getattr(chunk, "text", "")),
            str(getattr(chunk, "safe_response_snippet", "")),
            " ".join(getattr(chunk, "safety_tags", []) or []),
            " ".join(getattr(chunk, "keywords", []) or []),
        ]
    )


def create_static_knowledge_schema(
    *,
    database_url: str,
    dimensions: int,
) -> None:
    if not database_url.strip():
        raise PGVectorUnavailable("RAG_PGVECTOR_DATABASE_URL is required")

    with _connect(database_url) as connection:
        with connection.cursor() as cursor:
            cursor.execute("create extension if not exists vector")
            cursor.execute(
                f"""
                create table if not exists {STATIC_REHAB_TABLE} (
                    id text primary key,
                    title text not null,
                    category text not null,
                    chunk_text text not null,
                    safe_response_snippet text not null,
                    source_version text not null,
                    safety_tags text[] not null default '{{}}',
                    keywords text[] not null default '{{}}',
                    embedding vector({dimensions}) not null,
                    created_at timestamptz not null default now(),
                    updated_at timestamptz not null default now()
                )
                """
            )
            cursor.execute(
                f"""
                create unique index if not exists
                    {STATIC_REHAB_TABLE}_source_uidx
                on {STATIC_REHAB_TABLE} (id, source_version)
                """
            )
            cursor.execute(
                f"""
                create index if not exists {STATIC_REHAB_TABLE}_embedding_idx
                on {STATIC_REHAB_TABLE}
                using ivfflat (embedding vector_cosine_ops)
                with (lists = 1)
                """
            )
        connection.commit()


def upsert_static_knowledge_chunks(
    chunks: list[Any],
    *,
    database_url: str,
    dimensions: int,
) -> int:
    create_static_knowledge_schema(database_url=database_url, dimensions=dimensions)

    with _connect(database_url) as connection:
        with connection.cursor() as cursor:
            for chunk in chunks:
                embedding = deterministic_hashing_vector(
                    _embedding_text(chunk),
                    dimensions=dimensions,
                )
                cursor.execute(
                    f"""
                    insert into {STATIC_REHAB_TABLE} (
                        id,
                        title,
                        category,
                        chunk_text,
                        safe_response_snippet,
                        source_version,
                        safety_tags,
                        keywords,
                        embedding
                    )
                    values (%s, %s, %s, %s, %s, %s, %s, %s, %s::vector)
                    on conflict (id) do update set
                        title = excluded.title,
                        category = excluded.category,
                        chunk_text = excluded.chunk_text,
                        safe_response_snippet = excluded.safe_response_snippet,
                        source_version = excluded.source_version,
                        safety_tags = excluded.safety_tags,
                        keywords = excluded.keywords,
                        embedding = excluded.embedding,
                        updated_at = now()
                    """,
                    (
                        chunk.id,
                        chunk.title,
                        chunk.category,
                        chunk.text,
                        chunk.safe_response_snippet,
                        chunk.source_version,
                        chunk.safety_tags,
                        chunk.keywords,
                        _to_vector_literal(embedding),
                    ),
                )
        connection.commit()

    return len(chunks)


def retrieve_static_knowledge_rows(
    query: str,
    *,
    settings: Settings | None = None,
    limit: int | None = None,
) -> list[dict[str, Any]]:
    current_settings = settings or get_settings()
    if not is_pgvector_configured(current_settings):
        raise PGVectorUnavailable("PGVector retrieval is not enabled or configured")

    normalized_query = " ".join(query.split()).strip()
    if not normalized_query:
        return []

    query_embedding = deterministic_hashing_vector(
        normalized_query,
        dimensions=current_settings.rag_pgvector_dimensions,
    )
    top_k = limit or current_settings.rag_pgvector_top_k

    try:
        with _connect(current_settings.rag_pgvector_database_url) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    f"""
                    select
                        id,
                        title,
                        category,
                        chunk_text,
                        safe_response_snippet,
                        source_version,
                        safety_tags,
                        keywords,
                        greatest(0, 1 - (embedding <=> %s::vector)) as score
                    from {STATIC_REHAB_TABLE}
                    order by embedding <=> %s::vector, id
                    limit %s
                    """,
                    (
                        _to_vector_literal(query_embedding),
                        _to_vector_literal(query_embedding),
                        top_k,
                    ),
                )
                return list(cursor.fetchall())
    except PGVectorUnavailable:
        raise
    except Exception as exc:
        raise PGVectorUnavailable("PGVector static retrieval failed") from exc
