# Latency Benchmark After Living Memory Evidence - 2026-04-29

## Purpose

This evidence file records a successful local synthetic latency benchmark run after implementing Aura's Phase 2A + 2B patient-specific living memory path for low-risk support.

This file does not write the abstract.

## What Changed Before This Benchmark

Before this benchmark, Aura was updated from Phase 1 static retrieval to include Phase 2A + 2B living memory:

- Phase 1 static retrieval was already implemented.
- MongoDB-backed deterministic patient-scoped memory records were implemented.
- Same-patient memory retrieval was added for low-risk RAG chat.
- Memory is used only after low-risk classification.
- High-risk chat bypasses memory write and retrieval.
- PGVector-backed retrieval was not part of this post-living-memory benchmark run.
- No external LLM or external API extraction is used for living memory.

## Command Run

Run from the server directory:

```bash
cd "/Users/University/Final Project/aura/server"
npm run bench:latency:local -- --samples=15 --json
```

## Required Local Services Used

- Backend: `http://127.0.0.1:3000`
- AI service: `http://127.0.0.1:8001`
- MongoDB for seeded local demo data, chat writes, alert writes, notification job writes, and patient memory records.
- Dashboard was not required.
- n8n was not required for this v1 benchmark claim.

Note: existing backend n8n webhook behavior may affect high-risk response time.

## Run Details

| Field | Value |
| --- | --- |
| Timestamp | `2026-04-29T11:54:02.054Z` |
| Run ID | `92ac9550-f05a-42cf-a46d-13ad432502e2` |
| Samples | 15 measured samples |
| Warmups | 2 warmups per flow |
| Backend | `http://127.0.0.1:3000` |
| AI service | `http://127.0.0.1:8001` |
| Failures | 0 |
| Created alert IDs | 17 |

## Main Benchmark Metrics

| Metric | Min | Max | Mean | Median | P95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| `lowRiskChat.roundTripMs` | 8.72 ms | 40.19 ms | 14.78 ms | 12.34 ms | 40.19 ms |
| `highRiskChat.roundTripMs` | 934.38 ms | 2487.48 ms | 1384.51 ms | 1138.84 ms | 2487.48 ms |
| `highRisk.backendCommitUpperBoundMs` | 934.38 ms | 2487.48 ms | 1384.51 ms | 1138.84 ms | 2487.48 ms |
| `alertVisibleFromRequestStartMs` | 939.43 ms | 2491.01 ms | 1390.44 ms | 1145.42 ms | 2491.01 ms |
| `clinicianAlertRetrievalMs` | 3.50 ms | 8.19 ms | 5.90 ms | 5.97 ms | 8.19 ms |
| `jobVerifiedFromRequestStartMs` | 937.84 ms | 2489.16 ms | 1387.90 ms | 1142.41 ms | 2489.16 ms |

## Interpretation Against Project Targets

Project targets:

- Low-risk chat target: `<= 3.5 seconds`.
- Alert visibility target: `<= 60 seconds`.

In this local synthetic benchmark using seeded demo data, both measured p95 values were below the stated project targets:

- Low-risk chat p95 was 40.19 ms, below 3.5 seconds.
- Alert visibility from request start p95 was 2491.01 ms, below 60 seconds.

## Comparison Note Against Earlier Post-Static-RAG Benchmark

The previous post-static-RAG benchmark recorded low-risk chat p95 of 33.55 ms and alert visibility p95 of 1128.52 ms. This post-living-memory run recorded low-risk chat p95 of 40.19 ms and alert visibility p95 of 2491.01 ms.

This comparison should be interpreted cautiously because both runs were local synthetic prototype benchmarks with small sample sizes and may vary with local machine state and backend webhook behavior.

## Safe Report Or Abstract Wording

The following wording may be used if the surrounding report clearly identifies this as local synthetic prototype evidence:

> In a local synthetic benchmark after adding patient-scoped living memory, low-risk chat achieved 12.34 ms median and 40.19 ms p95 latency across 15 measured requests. High-risk synthetic chat produced clinician-visible alerts with 1145.42 ms median and 2491.01 ms p95 visibility time from request start.

## Limitations And Cautions

- This benchmark used local synthetic seeded demo data only.
- This is prototype evidence, not production-scale evidence.
- This is not clinical deployment evidence.
- This is not clinical validation.
- Results may vary with local machine load, Docker state, backend startup, AI service startup, warmup effects, and existing backend n8n webhook behavior.
- Dashboard was not required.
- n8n was not required for this v1 benchmark claim.
- Living memory uses MongoDB-backed deterministic patient-scoped summaries.
- PGVector-backed retrieval is not covered by this benchmark; later optional PGVector prototype retrieval evidence is recorded separately.
- The benchmark writes synthetic local chat, alert, and notification job records.

## Cleanup

To reset seeded demo data after benchmark runs:

```bash
cd "/Users/University/Final Project/aura/server"
npm run seed:reset
```
