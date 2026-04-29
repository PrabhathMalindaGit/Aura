# PGVector-Enabled Fallback-Safe Latency Benchmark Evidence - 2026-04-29

## Purpose

This evidence file records a successful local synthetic latency benchmark run while the Aura AI service was started with PGVector enabled for optional static rehabilitation knowledge retrieval.

This file does not write the abstract.

## What Was Enabled Before This Benchmark

Before this benchmark, Phase 2C-A PGVector static retrieval was implemented. PGVector is optional and enabled through environment variables.

- PGVector is used only for curated static rehabilitation knowledge.
- JSON static rehabilitation knowledge remains the source of truth.
- Patient living memory remains MongoDB-backed.
- No patient memory, patient messages, check-ins, alerts, care events, or real patient data are stored in PGVector.
- No external embedding API or external LLM API is used for this retrieval path.

## Important Interpretation Boundary

The benchmark was run with PGVector enabled in the AI service. However, the latency benchmark messages are artificial messages containing `AURA_LATENCY_BENCH` identifiers. AI logs from the benchmark showed low-risk RAG requests with:

- `retrievedSourceCount: 0`
- `memorySourceCount: 0`
- `fallbackUsed: true`

Therefore this benchmark is PGVector-enabled fallback-safe runtime evidence. It should not be described as proof that every benchmark request retrieved PGVector sources.

## Command Run

Run from the server directory:

```bash
cd "/Users/University/Final Project/aura/server"
npm run bench:latency:local -- --samples=15 --json
```

## AI Service Startup Evidence

The AI service was started with PGVector enabled:

```bash
cd "/Users/University/Final Project/aura/ai"
source .venv/bin/activate
RAG_PGVECTOR_ENABLED=true \
RAG_PGVECTOR_DATABASE_URL="postgresql://aura:aura@localhost:5432/aura_vectors" \
PYTHONPATH=. uvicorn src.main:app --reload --host 127.0.0.1 --port 8001
```

## Run Details

| Field | Value |
| --- | --- |
| Timestamp | `2026-04-29T12:24:37.482Z` |
| Run ID | `51d48699-1cb3-41f7-ad6c-b4e0481d3fc6` |
| Samples | 15 measured samples |
| Warmups | 2 warmups per flow |
| Backend | `http://127.0.0.1:3000` |
| AI service | `http://127.0.0.1:8001` |
| Failures | 0 |
| Created alert IDs | 17 |

## Main Benchmark Metrics

| Metric | Min | Max | Mean | Median | P95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| `lowRiskChat.roundTripMs` | 20.40 ms | 318.39 ms | 49.34 ms | 22.67 ms | 318.39 ms |
| `highRiskChat.roundTripMs` | 919.97 ms | 1082.07 ms | 987.66 ms | 975.30 ms | 1082.07 ms |
| `highRisk.backendCommitUpperBoundMs` | 919.97 ms | 1082.07 ms | 987.66 ms | 975.30 ms | 1082.07 ms |
| `alertVisibleFromRequestStartMs` | 923.75 ms | 1086.29 ms | 993.16 ms | 982.34 ms | 1086.29 ms |
| `clinicianAlertRetrievalMs` | 2.91 ms | 16.69 ms | 5.47 ms | 4.22 ms | 16.69 ms |
| `jobVerifiedFromRequestStartMs` | 921.79 ms | 1084.11 ms | 990.65 ms | 978.87 ms | 1084.11 ms |

## Interpretation Against Project Targets

Project targets:

- Low-risk chat target: `<= 3.5 seconds`.
- Alert visibility target: `<= 60 seconds`.

In this local synthetic benchmark using seeded demo data, both measured p95 values were below the stated project targets:

- Low-risk chat p95 was 318.39 ms, below 3.5 seconds.
- Alert visibility from request start p95 was 1086.29 ms, below 60 seconds.

## Fallback Behavior Observed In Logs

AI logs from the benchmark showed `/rag/reply` requests with:

- `retrievedSourceCount: 0`
- `memorySourceCount: 0`
- `fallbackUsed: true`

The first low-risk RAG request timed out during warmup/cold-start behavior and used backend fallback. The benchmark still completed with `Failures: 0`, so this should be treated as a caution rather than a benchmark failure.

## Optional Direct Retrieval Smoke

After the benchmark, a direct `/rag/reply` smoke request was run against the local AI service:

```bash
curl -s -X POST http://127.0.0.1:8001/rag/reply \
  -H "Content-Type: application/json" \
  -H "x-aura-ai-key: dev_aura_ai_key" \
  -d '{"patientId":"p1","message":"I missed my exercises and feel discouraged about restarting."}'
```

Result:

- Response included `static-rehab:missed_exercises@static-rehab-v1`.
- Response grounding reported `fallbackUsed:false`.

This direct smoke confirms that relevant static-source retrieval was available after the benchmark. It is separate from the benchmark result and should not be used to claim that the artificial benchmark messages retrieved PGVector sources.

## Safe Report Or Abstract Wording

The following wording may be used if the surrounding report clearly identifies this as local synthetic prototype evidence:

> In a local synthetic benchmark with PGVector enabled and fallback-safe retrieval configured, low-risk chat achieved 22.67 ms median and 318.39 ms p95 latency across 15 measured requests. High-risk synthetic chat produced clinician-visible alerts with 982.34 ms median and 1086.29 ms p95 visibility time from request start. The benchmark messages used fallback rather than successful static-source retrieval, so this result demonstrates PGVector-enabled runtime and fallback performance, not per-message PGVector retrieval success.

## Limitations And Cautions

- This benchmark used local synthetic seeded demo data only.
- This is prototype evidence, not production-scale evidence.
- This is not clinical deployment evidence.
- This is not clinical validation.
- Benchmark messages were artificial latency messages and did not retrieve static rehab sources.
- PGVector was enabled, but low-risk benchmark RAG calls used fallback.
- Results may vary with local machine load, Docker state, backend startup, AI service startup, warmup effects, and existing backend n8n webhook behavior.
- Dashboard was not required.
- n8n was not required for this v1 benchmark claim.
- Patient living memory remains MongoDB-backed.
- PGVector stores only curated static rehabilitation knowledge.
- The benchmark writes synthetic local chat, alert, and notification job records.

## Cleanup

To reset seeded demo data after benchmark runs:

```bash
cd "/Users/University/Final Project/aura/server"
npm run seed:reset
```
