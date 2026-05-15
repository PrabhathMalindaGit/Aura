# Final PGVector Memory-Enabled Latency Benchmark Evidence - 2026-04-29

## 1. Purpose

This evidence file records the final local synthetic Aura latency benchmark after enabling PGVector static rehabilitation retrieval and backend optional PGVector patient-memory indexing.

This file does not write or change the abstract.

This is local synthetic prototype evidence only. It is not production-scale evidence, clinical deployment evidence, or clinical validation.

## 2. Runtime Configuration Used

Docker services were started with MongoDB and PGVector:

```bash
cd "/Users/University/Final Project/aura"
docker compose up -d mongo pgvector
```

The AI service was started with PGVector static retrieval enabled:

```bash
cd "/Users/University/Final Project/aura/ai"
source .venv/bin/activate
RAG_PGVECTOR_ENABLED=true \
RAG_PGVECTOR_DATABASE_URL="postgresql://aura:aura@localhost:5432/aura_vectors" \
PYTHONPATH=. uvicorn src.main:app --reload --host 127.0.0.1 --port 8001
```

The backend was reset and started with optional PGVector patient-memory indexing enabled:

```bash
cd "/Users/University/Final Project/aura/server"
npm run seed:reset

RAG_PGVECTOR_PATIENT_MEMORY_ENABLED=true \
RAG_PGVECTOR_PATIENT_MEMORY_FALLBACK_ENABLED=true \
RAG_PGVECTOR_DATABASE_URL="postgresql://aura:aura@localhost:5432/aura_vectors" \
RAG_PGVECTOR_PATIENT_MEMORY_TOP_K=3 \
npm run dev
```

Important runtime boundary:

- PGVector static retrieval was enabled in the AI service.
- Optional PGVector patient-memory indexing was enabled in the backend.
- PGVector patient-memory indexing stores only sanitized summaries.
- MongoDB remains canonical for patient memory.

## 3. Docker/PGVector Confirmation

PGVector extension check command:

```bash
docker exec aura_pgvector psql -U aura -d aura_vectors -c "select extname, extversion from pg_extension where extname = 'vector';"
```

Result:

- `vector` extension version: `0.8.1`

## 4. Command That Was Run

Benchmark command:

```bash
cd "/Users/University/Final Project/aura/server"
npm run bench:latency:local -- --samples=15 --json
```

The benchmark was not rerun while creating this evidence file. This document uses only the benchmark result provided for this run.

## 5. Run Details

| Field | Value |
| --- | --- |
| Timestamp | `2026-04-29T14:51:04.692Z` |
| Run ID | `845047b4-7ff6-4ab5-aec7-608a590ee1c9` |
| Samples | 15 measured samples |
| Warmups | 2 warmups per flow |
| Backend | `http://127.0.0.1:3000` |
| AI service | `http://127.0.0.1:8001` |
| Failures | 0 |
| Created alert IDs | 17 |

## 6. Metrics Table

| Metric | Min | Max | Mean | Median | P95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| `lowRiskChat.roundTripMs` | 22.01 ms | 64.85 ms | 27.79 ms | 24.78 ms | 64.85 ms |
| `highRiskChat.roundTripMs` | 14.90 ms | 39.97 ms | 20.44 ms | 18.34 ms | 39.97 ms |
| `highRisk.backendCommitUpperBoundMs` | 14.90 ms | 39.97 ms | 20.44 ms | 18.34 ms | 39.97 ms |
| `alertVisibleFromRequestStartMs` | 17.35 ms | 50.72 ms | 23.98 ms | 21.39 ms | 50.72 ms |
| `clinicianAlertRetrievalMs` | 2.37 ms | 10.72 ms | 3.52 ms | 2.90 ms | 10.72 ms |
| `jobVerifiedFromRequestStartMs` | 16.38 ms | 41.46 ms | 22.19 ms | 19.83 ms | 41.46 ms |

## 7. Interpretation Against Project Targets

Project targets:

- Low-risk chat target: `<= 3.5 seconds`
- Alert visibility target: `<= 60 seconds`

In this local synthetic benchmark using seeded demo data, both measured p95 values were below the stated project targets:

- Low-risk chat p95 was `64.85 ms`, below `3.5 seconds`.
- Alert visibility from request start p95 was `50.72 ms`, below `60 seconds`.

High-risk backend commit upper bound p95 was `39.97 ms`. The benchmark notes that this value is the high-risk response time and that the route creates `Alert` and `AlertNotificationJob` before responding.

## 8. Safe Report/Abstract Wording

The following wording is safe to use if the surrounding report clearly identifies the result as local synthetic prototype evidence:

> In a local synthetic benchmark with PGVector static retrieval and optional PGVector patient-memory indexing enabled, low-risk chat achieved 24.78 ms median and 64.85 ms p95 latency across 15 measured requests. High-risk synthetic chat produced clinician-visible alerts with 21.39 ms median and 50.72 ms p95 visibility time from request start.

Do not present this benchmark as production performance, clinical validation, or evidence that the system is safe for unsupervised clinical deployment.

## 9. Limitations/Cautions

- This benchmark used local synthetic seeded demo data only.
- This is prototype evidence, not production-scale evidence.
- This is not clinical deployment evidence.
- This is not clinical validation.
- Results may vary with local machine load, Docker state, backend startup, AI service startup, warmup effects, and existing backend n8n webhook behavior.
- Dashboard was not required.
- n8n was not required for this v1 benchmark claim.
- PGVector patient-memory indexing stores only sanitized summaries.
- MongoDB remains canonical for patient memory.
- The benchmark writes synthetic local chat, alert, and notification job records.
- This benchmark confirms the configured local runtime and measured latency for this run; it should not be overclaimed as broad scalability evidence.

## 10. Cleanup Command

To reset seeded demo data after the benchmark:

```bash
cd "/Users/University/Final Project/aura/server"
npm run seed:reset
```
