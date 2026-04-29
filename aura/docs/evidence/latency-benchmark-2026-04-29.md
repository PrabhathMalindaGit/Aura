# Aura Local Latency Benchmark Evidence - 2026-04-29

## Purpose

This file records measured local prototype latency evidence for Aura using a synthetic benchmark against locally running services. It is intended as supporting evidence for the final report and abstract, subject to the limitations below.

This evidence does not claim production performance, clinical deployment performance, or clinical validation.

## Command Run

```bash
cd "/Users/University/Final Project/aura/server"
npm run bench:latency:local -- --samples=15 --json
```

## Required Local Services Used

The benchmark expected the following local services to be running:

```bash
cd "/Users/University/Final Project/aura"
docker compose up -d mongo
```

```bash
cd "/Users/University/Final Project/aura/ai"
source .venv/bin/activate
uvicorn src.main:app --reload --host 127.0.0.1 --port 8001
```

```bash
cd "/Users/University/Final Project/aura/server"
npm run seed:reset
npm run dev
```

Dashboard was not required for this benchmark. n8n was not required for this v1 benchmark claim.

## Run Details

| Field | Value |
| --- | --- |
| Timestamp | `2026-04-29T05:47:37.419Z` |
| Run ID | `4089ce48-abd7-4b59-aa61-827f5ff55fc1` |
| Measured samples | 15 |
| Warmups | 2 warmups per flow |
| Backend | `http://127.0.0.1:3000` |
| AI service | `http://127.0.0.1:8001` |
| Failures | 0 |
| Created alert IDs | 17 |

## Main Benchmark Metrics

All timings are in milliseconds.

| Metric | Min | Max | Mean | Median | P95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| `lowRiskChat.roundTripMs` | 8.42 | 24.72 | 11.84 | 10.30 | 24.72 |
| `highRiskChat.roundTripMs` | 904.90 | 1115.71 | 989.12 | 963.80 | 1115.71 |
| `highRisk.backendCommitUpperBoundMs` | 904.90 | 1115.71 | 989.12 | 963.80 | 1115.71 |
| `alertVisibleFromRequestStartMs` | 909.24 | 1125.58 | 995.63 | 969.88 | 1125.58 |
| `clinicianAlertRetrievalMs` | 3.33 | 10.55 | 6.47 | 6.37 | 10.55 |
| `jobVerifiedFromRequestStartMs` | 907.75 | 1123.13 | 993.03 | 967.79 | 1123.13 |

## Interpretation Against Project Targets

The relevant project targets are:

- Low-risk chat response target: <= 3.5 seconds.
- Alert visibility target: <= 60 seconds.

In this local synthetic benchmark using seeded demo data, both measured p95 values were below the stated project targets:

- Low-risk chat p95 was 24.72 ms, below 3.5 seconds.
- Alert visibility from request start p95 was 1125.58 ms, below 60 seconds.

This should be interpreted cautiously. The benchmark provides local prototype evidence only. It does not establish production-scale performance, operational reliability, or clinical deployment performance.

## Safe Wording For Report Or Abstract

The following wording may be used if the surrounding report clearly identifies this as local synthetic prototype evidence:

> In a local synthetic benchmark using seeded demo data, low-risk chat achieved 10.30 ms median and 24.72 ms p95 latency across 15 measured requests. High-risk synthetic chat produced clinician-visible alerts with 969.88 ms median and 1125.58 ms p95 visibility time from request start.

## Limitations And Cautions

- This benchmark used local synthetic data only.
- This is not production-scale performance evidence.
- This is not clinical deployment evidence.
- This is not clinical validation.
- Results may vary with local machine load, Docker state, backend startup state, AI service startup state, and warmup effects.
- Dashboard was not required for this benchmark.
- n8n was not required for this v1 benchmark claim.
- Existing backend n8n webhook behavior may affect high-risk response time.
- The benchmark writes synthetic local chat, alert, and notification job records.
- The sample size is suitable for prototype evidence, not load testing or production tail-latency claims.

## Cleanup

To reset seeded demo data after benchmark runs:

```bash
cd "/Users/University/Final Project/aura/server"
npm run seed:reset
```
