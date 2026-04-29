# PGVector Patient Memory Index Evidence - 2026-04-29

## Purpose

This evidence file records Phase 2C-B implementation and verification for Aura's optional PGVector-backed patient-memory retrieval index.

This file does not write the abstract.

## Implementation Status

- Implemented: optional backend-owned PGVector indexing for sanitized patient memory summaries.
- Implemented: `patient_memory_vectors` schema support with `memory_id`, `patient_id`, `memory_type`, `source_kind`, `status`, `summary`, `embedding`, timestamps, optional expiry, and `index_version`.
- Implemented: deterministic local hashing vectors with 384 dimensions, tokenization, stop-word filtering, stable hashing, and L2 normalization.
- Implemented: same-patient PGVector retrieval behind `RAG_PGVECTOR_PATIENT_MEMORY_ENABLED=false` by default.
- Implemented: fallback to existing MongoDB lexical patient-memory retrieval when PGVector patient memory is disabled, unavailable, empty, or errors.
- Preserved: MongoDB `PatientMemory` remains the canonical source of truth.
- Preserved: AI `/rag/reply` receives bounded patient memory context from the backend and does not query PGVector patient memory.

## Safety And Privacy Boundary

- Only sanitized low-risk memory summaries are eligible for PGVector indexing.
- Raw patient chat messages are not stored in PGVector.
- Real patient data was not used.
- High-risk chat still bypasses RAG, patient-memory retrieval, MongoDB memory writing, and PGVector patient-memory mirroring.
- Retrieval requires exact same-patient SQL filtering by `patient_id`, active status, and non-expired rows.
- Patient A must not retrieve Patient B memory; this is covered by unit tests and the optional Docker smoke.
- The vector mirror adds a defense-in-depth filter for crisis text, medication dosage details, contact details, secrets, third-party references, and likely identifiers.
- Safety Router logic, pain threshold behavior, crisis-language behavior, alert creation, high-risk escalation, and n8n workflows were not changed.

## Configuration

Backend PGVector patient memory settings are fallback-safe by default:

```bash
RAG_PGVECTOR_PATIENT_MEMORY_ENABLED=false
RAG_PGVECTOR_PATIENT_MEMORY_FALLBACK_ENABLED=true
RAG_PGVECTOR_PATIENT_MEMORY_TOP_K=3
RAG_PGVECTOR_DATABASE_URL=
RAG_PGVECTOR_DIMENSIONS=384
```

Normal server and AI tests do not require Docker.

## Verification Commands And Results

Focused server tests, including the new vector-service test:

```bash
cd "/Users/University/Final Project/aura/server"
npm test -- tests/patientMemoryVectorService.test.ts tests/patientMemoryService.test.ts tests/chatFlow.integrity.test.ts tests/ai.service.test.ts
```

Result:

- `4 passed` test files
- `41 passed` tests

Server full tests:

```bash
cd "/Users/University/Final Project/aura/server"
npm test
```

Result:

- First full run had one transient `MongoMemoryServer.create()` hook timeout in `tests/clinician.dashboard.routes.test.ts`.
- The dashboard test then passed in isolation: `1 passed`.
- A fresh full rerun passed:
  - `53 passed` test files
  - `336 passed` tests
  - Duration: `109.72s`
- Existing Mongoose duplicate `patientId` index warnings were emitted.

Server build:

```bash
cd "/Users/University/Final Project/aura/server"
npm run build
```

Result:

- TypeScript build completed successfully.

AI tests:

```bash
cd "/Users/University/Final Project/aura/ai"
PYTHONPATH=. .venv/bin/python -m pytest -q
```

Result:

- `50 passed`
- One existing Starlette multipart deprecation warning was emitted.

Static PGVector regression:

```bash
cd "/Users/University/Final Project/aura/ai"
RAG_PGVECTOR_ENABLED=true RAG_PGVECTOR_DATABASE_URL="postgresql://aura:aura@localhost:5432/aura_vectors" PYTHONPATH=. .venv/bin/python -m pytest -q tests/test_rag_static_retrieval.py
```

Result:

- `12 passed`
- One existing Starlette multipart deprecation warning was emitted.

Optional local PGVector smoke:

```bash
cd "/Users/University/Final Project/aura"
docker compose up -d pgvector
docker exec aura_pgvector psql -U aura -d aura_vectors -c "select extname, extversion from pg_extension where extname = 'vector';"
```

Result:

- `aura_pgvector` was already running.
- `vector` extension was installed at version `0.8.1`.

Synthetic patient-memory vector smoke:

```bash
cd "/Users/University/Final Project/aura/server"
RAG_PGVECTOR_PATIENT_MEMORY_ENABLED=true RAG_PGVECTOR_DATABASE_URL="postgresql://aura:aura@localhost:5432/aura_vectors" node -e '...'
```

Result:

```json
{"sameCount":1,"sameFirst":"smoke-memory-20260429","otherCount":0}
```

Cleanup:

```bash
docker exec aura_pgvector psql -U aura -d aura_vectors -c "delete from patient_memory_vectors where memory_id = 'smoke-memory-20260429';"
```

Result:

- `DELETE 1`

## Prototype Interpretation

Aura now has an optional PGVector patient-memory retrieval index for sanitized low-risk summaries. The implementation keeps MongoDB as canonical storage and treats PGVector as a searchable copy only.

This is prototype evidence only. It is not clinical validation, real patient validation, production validation, or evidence that the system is safe for unsupervised clinical deployment.

## Limitations And Cautions

- PGVector patient-memory retrieval remains disabled by default.
- Deterministic hashing vectors are prototype retrieval vectors, not clinically validated semantic embeddings.
- The privacy filter is defense in depth and intentionally conservative, but it is not a substitute for clinical-grade de-identification.
- PGVector availability depends on local Docker/Postgres state when optional smoke tests are run.
- MongoDB remains the only source of truth for patient memory.
