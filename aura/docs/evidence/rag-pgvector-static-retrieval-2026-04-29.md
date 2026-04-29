# PGVector Static Retrieval Evidence - 2026-04-29

## Purpose

This evidence file records Phase 2C-A implementation and verification for optional PGVector-backed persistence of Aura's curated static rehabilitation knowledge.

This file does not write the abstract.

## Implementation Status

- Implemented: optional PGVector retrieval for static rehabilitation knowledge chunks only.
- Implemented: deterministic local hashing vectors for static knowledge persistence and retrieval.
- Implemented: idempotent ingestion from `ai/data/rehab_knowledge.json` into `static_rehab_knowledge_chunks`.
- Implemented: fallback to existing JSON-backed lexical retrieval when PGVector is disabled, unavailable, empty, or errors.
- Preserved: JSON static rehabilitation knowledge remains the source of truth.
- Preserved: patient living memory remains MongoDB-backed.
- Not implemented: patient memory, patient chat messages, check-ins, alerts, care events, or real patient data in PGVector.
- Not used: external embedding APIs, external LLM APIs, or real patient data.

## Safety And Privacy Boundary

PGVector is used only by the AI service's static rehabilitation knowledge retrieval path. Backend chat still calls RAG only after a low-risk classification. High-risk chat continues to bypass RAG and memory.

This phase does not change Safety Router logic, pain-threshold behavior, crisis-language behavior, high-risk escalation, alert creation, or n8n workflows.

## Verification Commands And Results

AI dependency installation for the actual Python 3.12 virtualenv:

```bash
cd "/Users/University/Final Project/aura/ai"
.venv/bin/python -m pip install -r requirements.txt
```

Result:

- Installed `psycopg==3.2.13` and `psycopg-binary==3.2.13` into `.venv/lib/python3.12`.

Normal AI tests:

```bash
cd "/Users/University/Final Project/aura/ai"
PYTHONPATH=. .venv/bin/python -m pytest -q
```

Result:

- `50 passed`
- One existing Starlette multipart deprecation warning was emitted.

Optional local PGVector availability check:

```bash
cd "/Users/University/Final Project/aura"
docker compose up -d pgvector
docker exec aura_pgvector psql -U aura -d aura_vectors -c "select name, default_version from pg_available_extensions where name = 'vector';"
```

Result:

- `aura_pgvector` was running.
- `vector` extension was available with default version `0.8.1`.

Optional static knowledge ingestion smoke:

```bash
cd "/Users/University/Final Project/aura/ai"
RAG_PGVECTOR_DATABASE_URL="postgresql://aura:aura@localhost:5432/aura_vectors" .venv/bin/python scripts/ingest_static_knowledge_pgvector.py
```

Result:

- `Upserted 6 static rehabilitation knowledge chunks into PGVector.`

Optional PGVector database verification:

```bash
cd "/Users/University/Final Project/aura"
docker exec aura_pgvector psql -U aura -d aura_vectors -c "select extname, extversion from pg_extension where extname = 'vector';"
docker exec aura_pgvector psql -U aura -d aura_vectors -c "select count(*) as static_chunk_count from static_rehab_knowledge_chunks;"
```

Result:

- `vector` extension installed at version `0.8.1`.
- `static_chunk_count` was `6`.

Focused PGVector-enabled AI retrieval tests:

```bash
cd "/Users/University/Final Project/aura/ai"
RAG_PGVECTOR_ENABLED=true RAG_PGVECTOR_DATABASE_URL="postgresql://aura:aura@localhost:5432/aura_vectors" PYTHONPATH=. .venv/bin/python -m pytest -q tests/test_rag_static_retrieval.py
```

Result:

- `12 passed`
- One existing Starlette multipart deprecation warning was emitted.

Focused server tests:

```bash
cd "/Users/University/Final Project/aura/server"
npm test -- tests/chatFlow.integrity.test.ts tests/ai.service.test.ts tests/patientMemoryService.test.ts
```

Result:

- `3 passed` test files
- `27 passed` tests

Server build:

```bash
cd "/Users/University/Final Project/aura/server"
npm run build
```

Result:

- TypeScript build completed successfully.

## Prototype Interpretation

Aura now has optional PGVector-backed persistence for curated static rehabilitation knowledge. The retrieval path uses deterministic local hashing vectors and remains fallback-safe through the existing lexical JSON retrieval path.

This is prototype evidence only. It is not clinical validation, real patient validation, production validation, or evidence that the system is safe for unsupervised clinical deployment.

## Limitations

- Deterministic hashing vectors are prototype vector persistence, not clinically validated semantic embeddings.
- The static knowledge corpus remains small and curated for prototype demonstration.
- PGVector retrieval is disabled by default and requires local Postgres configuration.
- Local smoke results depend on Docker and the local `aura_pgvector` container state.
- Patient memory remains MongoDB-backed and was not migrated to PGVector.
