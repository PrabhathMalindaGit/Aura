# Aura Final Proof Pack

## Seeded demo access

- Clinician login: `clinician1@example.com` / `devpass123`
- Secondary clinician login: `clinician2@example.com` / `devpass123`
- Patient access codes: `P1-DEMO`, `P2-DEMO`, `P3-DEMO`

## Demo-readiness truth note

### Implemented now

- Backend remains the source of truth for alerts, tasks, appointments, worklist state, communication review metadata, and automation callbacks.
- AI safety classification is implemented and in use through `/classify`.
- Low-risk `/rag/reply` support is retrieval-backed by curated static rehabilitation knowledge and can use bounded backend-provided patient memory context.
- Patient-scoped living memory is implemented for low-risk support, with MongoDB as the canonical patient-memory store.
- Optional PGVector-backed static rehabilitation knowledge retrieval exists with fallback-safe behavior.
- Optional backend-owned PGVector patient-memory indexing can mirror sanitized low-risk memory summaries for same-patient retrieval when enabled; PGVector does not store raw patient messages.
- High-risk chat bypasses RAG, memory writing, memory retrieval, and PGVector patient-memory indexing.
- Dashboard command center, worklist, alerts, patients, patient detail, appointments, insights, and settings routes are implemented.
- Mobile check-in, tasks, appointments, reminders, chat workflow prompts, and safety routing are implemented.
- Canonical n8n follow-through workflow exports live in `/Users/University/Final Project/aura/n8n/workflows/`.

### Implemented but still needs live runtime verification

- Live n8n import/activation state in the local n8n workspace.
- Provider-side delivery for Telegram or any notification channel used during demos.
- Device-specific local notification behavior on a real phone or simulator.

### Intentionally stubbed or future-facing

- Clinical validation, real patient validation, production validation, and proof of safe unsupervised clinical deployment remain future work.
- PGVector retrieval uses deterministic hashing vectors for prototype retrieval, not clinically validated semantic embeddings.
- Legacy reference folders such as `/Users/University/Final Project/aura/n8n_workflows/` and `/Users/University/Final Project/aura/mobile_backup_20260223_123515/` are not active runtime sources.

## Screenshot checklist

Capture the following against the current local build:

1. Clinician login screen: `/login`
2. Dashboard Home / command center: `/dashboard`
3. Alerts queue: `/alerts`
4. Worklist: `/worklist`
5. Patients page: `/patients`
6. Patient Detail 2.0: `/patients/p1`
7. Appointments page: `/appointments`
8. Insights page: `/insights`
9. Settings page: `/settings`
10. Mobile Check-in 2.0: `/(tabs)/checkin`
11. Mobile Tasks: `/tasks`
12. Mobile Appointments: `/appointments`
13. Mobile Reminders: `/reminders`
14. Mobile Chat with workflow-linked prompt card: `/(tabs)/chat`
15. n8n canonical workflow list: `/Users/University/Final Project/aura/n8n/workflows/`
16. n8n live workflow list or execution evidence from local n8n UI / CLI
17. Telegram or callback evidence, if available, from alert or automation callback state
18. High-risk alert visible on clinician side after a triggered check-in/chat
19. Follow-up task or reminder visible on the patient side
20. Appointment state visible on the patient side (`awaiting_confirmation` or `upcoming`)

## Demo order

### 2-minute version

1. Start at clinician `/dashboard`.
2. Show `/worklist` and open `/patients/p1`.
3. On Patient Detail, call out Current Priorities, tasks, communication, and appointments.
4. Switch to mobile and show Check-in 2.0, Tasks, and Reminders.
5. Close on n8n workflow evidence and the clinician alert/reminder continuity.

### 3–5 minute version

1. Clinician login at `/login`, landing on `/dashboard`.
2. Dashboard Home: summary modules, priority queue, and follow-up context.
3. Worklist: filter/action-oriented patient review.
4. Patient Detail 2.0: operational header, Current Priorities, Tasks, Communication, Appointments.
5. Mobile: Check-in 2.0 with body map and safety-aware support section.
6. Mobile: Tasks, Appointments, Reminders, and Chat workflow prompt.
7. n8n: show canonical workflow list and one execution/callback proof point.
8. End on the completed loop:
   clinician state -> backend task/workflow state -> n8n follow-through -> patient reminder -> backend-visible callback/audit.

## Evidence map

| Claim | Proof source |
|---|---|
| High-risk check-ins create alerts | `/Users/University/Final Project/aura/server/tests/patient.routes.test.ts`, local API probe, `/clinician/alerts` visibility |
| High-risk chat triggers safety routing | `/Users/University/Final Project/aura/server/tests/*chat*`, local API probe, alert context route |
| Low-risk `/rag/reply` uses static rehabilitation retrieval | `/Users/University/Final Project/aura/docs/evidence/rag-static-knowledge-retrieval-2026-04-29.md`, `/Users/University/Final Project/aura/docs/evidence/rag-pgvector-static-retrieval-2026-04-29.md`, `/Users/University/Final Project/aura/ai/tests/test_rag_static_retrieval.py` |
| Patient-scoped living memory is implemented for low-risk support | `/Users/University/Final Project/aura/docs/evidence/rag-living-memory-phase-2-2026-04-29.md`, `/Users/University/Final Project/aura/server/tests/patientMemoryService.test.ts`, `/Users/University/Final Project/aura/server/tests/chatFlow.integrity.test.ts` |
| Optional PGVector patient-memory indexing is fallback-safe and keeps MongoDB canonical | `/Users/University/Final Project/aura/docs/evidence/rag-pgvector-patient-memory-index-2026-04-29.md`, `/Users/University/Final Project/aura/server/tests/patientMemoryVectorService.test.ts` |
| Dashboard command center is implemented | `/Users/University/Final Project/aura/dashboard/src/pages/DashboardHomePage.tsx`, `/Users/University/Final Project/aura/dashboard/src/app/routes.tsx`, dashboard live smoke |
| Worklist is implemented and action-oriented | `/Users/University/Final Project/aura/dashboard/src/pages/WorklistPage.tsx`, worklist route tests, local API probe |
| Patient Detail 2.0 is operational | `/Users/University/Final Project/aura/dashboard/src/pages/PatientDetailPage.tsx`, patient detail tests/e2e |
| Patient tasks are real and actionable | `/Users/University/Final Project/aura/server/src/routes/tasks.routes.ts`, `/Users/University/Final Project/aura/mobile/app/tasks.tsx`, local API probe |
| Patient appointments reflect workflow state | `/Users/University/Final Project/aura/server/src/routes/appointments.routes.ts`, `/Users/University/Final Project/aura/mobile/app/appointments.tsx`, local API probe |
| In-app reminders are grounded in real workflow data | `/Users/University/Final Project/aura/mobile/app/reminders.tsx`, `/Users/University/Final Project/aura/mobile/src/utils/reminders.ts`, mobile QA checks |
| Alert-created automation is truthful | `/Users/University/Final Project/aura/server/src/routes/events.routes.ts`, `/Users/University/Final Project/aura/n8n/workflows/01 - Alert Created Webhook (POST → Dedupe → Table → Telegram → Respond).json`, server callback tests |
| Follow-through automation exists | `/Users/University/Final Project/aura/server/src/routes/internalN8n.routes.ts`, `/Users/University/Final Project/aura/server/src/services/followThroughAutomationService.ts`, `n8n/workflows/03/04/06/07/08`, server tests |

## Local verification notes

- The canonical n8n export set is under `/Users/University/Final Project/aura/n8n/workflows/`.
- A local n8n workspace may still contain older imported workflows. For a clean final demo, review the live workflow list and disable or remove stale entries before presenting.
- In the current local demo workspace, the canonical daily digest workflow is the intended follow-through proof path:
  - `07 - Daily Digest (Cron 09:00 → Aura Digest → Telegram → Callback)` is active
  - `03`, `04`, `06`, and `08` remain imported as inactive drafts to avoid surprise cron side effects
  - the legacy old digest workflow (`07 - Daily Digest (Cron 09:00 → Open alerts → Telegram)`) should stay inactive and should not be used for demos
- One-off `n8n execute` runs from inside the already-running n8n container may fail if the task-broker port is already bound. Prefer proving the canonical follow-through path through the n8n UI.
- The current local n8n container now expects the same webhook key as the backend for follow-through callbacks:
  - `AURA_WEBHOOK_KEY=dev_aura_webhook_key`
- If `TELEGRAM_CLINICIAN_CHAT_ID` is still `CHANGE_ME`, the canonical daily digest workflow should prove truthfulness through a `skipped` automation callback instead of claiming a send.
- Backend remains the source of truth. n8n orchestrates reminders and follow-through and writes back truthful automation status through `/events/automation-status`.
