# Static Knowledge Retrieval Evidence - 2026-04-29

## Purpose

This evidence note records Phase 1 implementation of Aura's retrieval-backed low-risk support path using a curated static rehabilitation knowledge base.

This file does not write the abstract.

## Implementation Status

- Implemented: `/rag/reply` retrieves from a curated static rehabilitation knowledge file.
- Implemented: deterministic local lexical scoring for static retrieval.
- Implemented: grounded supportive replies with citations when static retrieval succeeds.
- Implemented: safe fallback response when no relevant static chunk is retrieved.
- Not implemented: patient-specific living memory.
- Not implemented: patient memory storage or retrieval.
- Not implemented: PGVector-backed persistence. `aura_pgvector` remains provisioned for later retrieval persistence work, but Phase 1 does not use it.
- Not used: external LLMs, external embedding APIs, or external network APIs.

## Safety Boundary

The existing backend chat flow calls RAG only after the Safety Router and risk decision classify a chat message as low risk. High-risk messages continue through the alert/escalation path and do not call RAG.

This implementation does not change Safety Router logic, high-risk escalation behavior, alert creation, or n8n workflows.

## Prototype Evidence

The focused AI tests cover:

- relevant low-risk queries return non-empty citations;
- missed-exercise queries retrieve the `missed_exercises` static chunk;
- soreness/fatigue queries retrieve the `normal_soreness_and_fatigue` static chunk;
- irrelevant queries use a safe fallback with fallback metadata;
- response text remains bounded;
- `/rag/reply` does not require external network calls.

The focused backend tests cover:

- low-risk chat in RAG mode calls `ragReply`;
- high-risk chat in RAG mode never calls `ragReply`;
- backend AI client remains compatible when `/rag/reply` includes optional grounding metadata.

## Safe Report Wording

Aura includes a Phase 1 prototype retrieval-backed support path for messages that have already been classified as low risk by the deterministic Safety Router. The implementation retrieves from a small curated static rehabilitation knowledge base and returns bounded supportive replies with source citations when a relevant static chunk is found. Patient-specific living memory and PGVector-backed persistence were not implemented in this phase. This is prototype support functionality only and is not clinical validation, real patient validation, or deployment validation.

## Limitations

- The knowledge base is small and curated for prototype demonstration.
- Retrieval uses deterministic lexical scoring, not semantic embeddings.
- No real patient data was used.
- The system does not diagnose symptoms, change treatment plans, advise medication changes, or replace emergency care.
