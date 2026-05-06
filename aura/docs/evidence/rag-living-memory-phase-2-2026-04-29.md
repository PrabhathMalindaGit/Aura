# Living Memory Phase 2 Evidence - 2026-04-29

## Purpose

This evidence file records implementation and verification for Aura's Phase 2A + 2B prototype patient-specific living memory path.

This file does not write the abstract.

## Implementation Status

- Implemented Phase 2A: MongoDB-backed patient-scoped deterministic memory records.
- Implemented Phase 2B: same-patient active memory retrieval for low-risk RAG chat.
- Implemented: deterministic allowlisted extraction for short summaries from low-risk chat text.
- Implemented: memory grounding metadata with `patient_memory` source type.
- Not implemented in Phase 2A + 2B: PGVector-backed memory storage or retrieval.
- Not implemented in Phase 2A + 2B: semantic vector persistence.
- Not implemented: external LLM/API memory extraction.
- Not implemented: dashboard, mobile, or clinician editing UI for memory.

## Storage

Patient memory is stored in MongoDB through the backend. Each memory record is scoped by `patientId` and stores a short sanitized summary, memory type, source kind, source quality, status, timestamps, optional expiry, and small metadata.

PGVector was provisioned in Docker infrastructure, but this phase did not use PGVector. Later optional PGVector prototype retrieval evidence is recorded separately.

## Safety Boundary

Memory is used only after chat has already been classified as low risk.

High-risk chat continues through the existing alert/escalation path and bypasses:

- memory retrieval;
- RAG reply generation;
- memory writing.

This implementation does not change Safety Router logic, pain threshold behavior, crisis-language behavior, alert creation, high-risk escalation, or n8n workflows.

## Privacy Boundary

- No real patient data was used.
- Memory extraction is deterministic and allowlisted.
- Memory stores short sanitized summaries, not raw full chat transcripts.
- The memory service skips high-risk/crisis text, medication dosage details, contact details, secrets, third-party personal details, and likely identifiers.
- Retrieval queries require an exact `patientId` and return at most three active records.
- AI grounding exposes memory id, memory type, source kind, score, and source type only. It does not expose memory summary text in grounding metadata.

## Verification Commands And Results

AI tests:

```bash
cd "/Users/University/Final Project/aura/ai"
PYTHONPATH=. .venv/bin/python -m pytest -q
```

Result:

- `40 passed`
- One existing Starlette multipart deprecation warning was emitted.

Focused server tests:

```bash
cd "/Users/University/Final Project/aura/server"
npm test -- tests/chatFlow.integrity.test.ts tests/ai.service.test.ts tests/patientMemoryService.test.ts
```

Result:

- `3 passed` test files
- `27 passed` tests

Full server tests:

```bash
cd "/Users/University/Final Project/aura/server"
npm test
```

Result:

- `52 passed` test files
- `321 passed` tests
- Mongoose emitted an existing duplicate patientId index warning during some unrelated model-loading test processes.

Server build:

```bash
cd "/Users/University/Final Project/aura/server"
npm run build
```

Result:

- TypeScript build completed successfully.

Project whitespace check:

```bash
cd "/Users/University/Final Project/aura"
git diff --check
```

Result:

- No whitespace errors reported.

## Prototype Interpretation

Aura now includes a prototype patient-scoped living memory path for messages that have already been classified as low risk. The implementation retrieves short sanitized same-patient memory summaries and combines their grounding metadata with static rehabilitation knowledge for bounded supportive replies.

This is prototype evidence only. It is not clinical validation, real patient validation, production validation, or evidence that the system is safe for unsupervised clinical deployment.

## Limitations

- Retrieval is deterministic lexical retrieval, not semantic vector retrieval.
- Memory extraction is intentionally narrow and will skip many messages.
- Stored memory summaries are synthetic/prototype data only.
- Clinical-grade semantic vector retrieval remains future work; later optional PGVector prototype retrieval evidence is recorded separately.
- The system does not diagnose symptoms, change treatment plans, advise medication changes, or replace emergency care.
