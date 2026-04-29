# Aura AI Service (Safety Router + Static RAG Retrieval)

The AI service provides:
- deterministic Safety Router classification through `/classify`
- low-risk supportive retrieval responses through `/rag/reply`
- optional PGVector-backed retrieval for curated static rehabilitation knowledge

No external LLM API or external embedding API is required for the deterministic retrieval path.

## 1) Start from repo root
```bash
cd "/Users/University/Final Project/aura"
```

## 2) Create & activate venv
```bash
cd ai
python3 -m venv .venv
source .venv/bin/activate
```

## 3) Install dependencies
```bash
pip install -r requirements.txt
```

AI requirements include FastAPI, pytest, and PGVector/Postgres support through `psycopg`.

## 4) Run the server
Normal fallback-safe startup:

```bash
uvicorn src.main:app --reload --host 127.0.0.1 --port 8001
```

PGVector static retrieval startup:

```bash
RAG_PGVECTOR_ENABLED=true \
RAG_PGVECTOR_DATABASE_URL="postgresql://aura:aura@localhost:5432/aura_vectors" \
PYTHONPATH=. uvicorn src.main:app --reload --host 127.0.0.1 --port 8001
```

## 5) PGVector static retrieval configuration
Defaults are fallback-safe and do not require Docker/Postgres:

```env
RAG_PGVECTOR_ENABLED=false
RAG_PGVECTOR_DATABASE_URL=postgresql://aura:aura@localhost:5432/aura_vectors
RAG_PGVECTOR_FALLBACK_ENABLED=true
RAG_PGVECTOR_TOP_K=2
RAG_PGVECTOR_DIMENSIONS=384
```

When PGVector is disabled, unavailable, empty, or erroring, the AI service falls back to the JSON-backed static rehabilitation retrieval path.

## 6) Static knowledge ingestion
Start PGVector first:

```bash
cd "/Users/University/Final Project/aura"
docker compose up -d pgvector
```

Check the vector extension:

```bash
docker exec aura_pgvector psql -U aura -d aura_vectors -c "select extname, extversion from pg_extension where extname = 'vector';"
```

Ingest curated static rehabilitation knowledge:

```bash
cd "/Users/University/Final Project/aura/ai"
source .venv/bin/activate
RAG_PGVECTOR_DATABASE_URL="postgresql://aura:aura@localhost:5432/aura_vectors" PYTHONPATH=. .venv/bin/python scripts/ingest_static_knowledge_pgvector.py
```

Run ingestion after recreating the PGVector volume/table or after changing `ai/data/rehab_knowledge.json`; it is not required on every startup.

## 7) Verify health
```bash
curl -s http://localhost:8001/health
```

Expected:

```json
{"status":"ok"}
```

## 8) Test classify (pain high)
```bash
curl -X POST http://localhost:8001/classify \
  -H "Content-Type: application/json" \
  -d '{"type":"checkin","pain":8,"text":"pain getting worse"}'
```

Expected: `{"risk":"high","reasons":["PAIN_GE_THRESHOLD"],"ruleVersion":"v1"}`.

## 9) Test classify (crisis keyword)
```bash
curl -X POST http://localhost:8001/classify \
  -H "Content-Type: application/json" \
  -d '{"type":"chat","text":"I cant breathe"}'
```

Expected: `{"risk":"high","reasons":["CRISIS_LANGUAGE"],"ruleVersion":"v1"}`.

## 10) Test low-risk RAG reply
```bash
curl -X POST http://localhost:8001/rag/reply \
  -H "Content-Type: application/json" \
  -d '{"patientId":"p1","message":"Knee feels better today"}'
```

`/rag/reply` is a low-risk supportive retrieval path. It can use curated static rehabilitation knowledge and bounded backend-provided patient memory context. High-risk chat should be routed by the backend to the deterministic escalation path instead of calling RAG.

## 11) Tests
```bash
PYTHONPATH=. .venv/bin/python -m pytest -q
```

## 12) Safety notes
- PGVector static retrieval stores curated rehabilitation knowledge only.
- Deterministic hashing vectors are prototype retrieval vectors, not clinically validated semantic embeddings.
- Patient living memory remains backend/MongoDB-owned; the AI service does not query PGVector patient memory directly.
- Evidence is local/synthetic prototype evidence unless explicitly stated otherwise.

## 13) Troubleshooting
- If port 8001 is in use: `lsof -i :8001`
- If venv activation fails: ensure you are using bash/zsh
- If import errors occur: confirm you are in `ai/` and use `PYTHONPATH=.` for tests/scripts that import `src`
