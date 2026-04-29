# Latency Benchmark After Static RAG Evidence - 2026-04-29

## Purpose

This evidence file records a successful local synthetic latency benchmark run after implementing Phase 1 static retrieval for Aura's `/rag/reply` low-risk support path.

This file does not write the abstract.

## What Changed Before This Benchmark

Before this benchmark, `/rag/reply` was updated from a stub response to Phase 1 static retrieval:

- Static RAG retrieves from a curated static rehabilitation knowledge base.
- Retrieval uses deterministic lexical retrieval.
- Responses remain bounded, supportive, and non-diagnostic.
- Patient-specific living memory was not implemented.
- PGVector-backed persistence was not implemented.
- No external LLMs or external APIs are used for this Phase 1 retrieval path.

## Command Run

Run from the server directory:

```bash
cd "/Users/University/Final Project/aura/server"
npm run bench:latency:local -- --samples=15 --json
```

## Required Local Services Used

- Backend: `http://127.0.0.1:3000`
- AI service: `http://127.0.0.1:8001`
- MongoDB for seeded local demo data and benchmark writes.
- Dashboard was not required.
- n8n was not required for this v1 benchmark claim.

## Run Details

| Field | Value |
| --- | --- |
| Timestamp | `2026-04-29T11:21:15.639Z` |
| Run ID | `781406be-53dc-46f8-af38-c2b5287ca418` |
| Samples | 15 measured samples |
| Warmups | 2 warmups per flow |
| Backend | `http://127.0.0.1:3000` |
| AI service | `http://127.0.0.1:8001` |
| Failures | 0 |
| Created alert IDs | 17 |

## Main Benchmark Metrics

| Metric | Min | Max | Mean | Median | P95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| `lowRiskChat.roundTripMs` | 9.69 ms | 33.55 ms | 15.58 ms | 11.64 ms | 33.55 ms |
| `highRiskChat.roundTripMs` | 937.91 ms | 1122.37 ms | 1002.88 ms | 984.92 ms | 1122.37 ms |
| `highRisk.backendCommitUpperBoundMs` | 937.91 ms | 1122.37 ms | 1002.88 ms | 984.92 ms | 1122.37 ms |
| `alertVisibleFromRequestStartMs` | 942.65 ms | 1128.52 ms | 1009.08 ms | 989.55 ms | 1128.52 ms |
| `clinicianAlertRetrievalMs` | 3.27 ms | 10.42 ms | 6.16 ms | 6.14 ms | 10.42 ms |
| `jobVerifiedFromRequestStartMs` | 940.97 ms | 1126.05 ms | 1006.56 ms | 987.49 ms | 1126.05 ms |

## Interpretation Against Project Targets

Project targets:

- Low-risk chat target: `<= 3.5 seconds`.
- Alert visibility target: `<= 60 seconds`.

In this local synthetic benchmark using seeded demo data, both measured p95 values were below the stated project targets:

- Low-risk chat p95 was 33.55 ms, below 3.5 seconds.
- Alert visibility from request start p95 was 1128.52 ms, below 60 seconds.

## Comparison Note Against Earlier Benchmark

An earlier local synthetic benchmark before Phase 1 static retrieval recorded low-risk chat p95 of 24.72 ms and alert visibility p95 of 1125.58 ms. This post-static-RAG run recorded low-risk chat p95 of 33.55 ms and alert visibility p95 of 1128.52 ms.

This comparison should be interpreted cautiously because both runs were local synthetic prototype benchmarks with small sample sizes and may vary with local machine state.

## Safe Report Or Abstract Wording

The following wording may be used if the surrounding report clearly identifies this as local synthetic prototype evidence:

> In a local synthetic benchmark after adding Phase 1 static retrieval, low-risk chat achieved 11.64 ms median and 33.55 ms p95 latency across 15 measured requests. High-risk synthetic chat produced clinician-visible alerts with 989.55 ms median and 1128.52 ms p95 visibility time from request start.

## Limitations And Cautions

- This benchmark used local synthetic seeded demo data only.
- This is prototype evidence, not production-scale evidence.
- This is not clinical deployment evidence.
- This is not clinical validation.
- Results may vary with local machine load, Docker state, backend startup, AI service startup, and warmup effects.
- Dashboard was not required.
- n8n was not required for this v1 benchmark claim.
- Static retrieval is deterministic lexical retrieval, not semantic PGVector retrieval.
- Patient-specific living memory was not implemented.
- The benchmark writes synthetic local chat, alert, and notification job records.

## Cleanup

To reset seeded demo data after benchmark runs:

```bash
cd "/Users/University/Final Project/aura/server"
npm run seed:reset
```
