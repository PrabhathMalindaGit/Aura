# Aura Operator Guide

Use this file as the fast operator and agent handoff guide for the Aura stack. It is intentionally concise: use it to boot the system, run the right commands, and find the canonical workflow sources without re-reading every README.

## Source of truth docs

- Repo stack startup: `/Users/University/Final Project/aura/README.md`
- AI safety router: `/Users/University/Final Project/aura/ai/README.md`
- Server API and seed runbook: `/Users/University/Final Project/aura/server/README.md`
- Seed details: `/Users/University/Final Project/aura/server/scripts/seed/README.md`
- Dashboard routes and demo flows: `/Users/University/Final Project/aura/dashboard/README.md`
- Mobile routes and demo flows: `/Users/University/Final Project/aura/mobile/README.md`
- Canonical n8n imports: `/Users/University/Final Project/aura/n8n/workflows/README.md`

## Canonical vs legacy

- Canonical workflow import path: `/Users/University/Final Project/aura/n8n/workflows/`
- Reference-only legacy workflow snapshots: `/Users/University/Final Project/aura/n8n_workflows/`
- Reference-only mobile backup: `/Users/University/Final Project/aura/mobile_backup_20260223_123515/`
- Do not use the legacy folders above as active runtime or demo sources.

## Core boot

Start Docker services from the Aura root:

```bash
cd "/Users/University/Final Project/aura"
docker compose up -d
docker ps
```

Expected containers:

- `aura_mongo`
- `aura_pgvector`
- `aura_n8n`

Start the AI service:

```bash
cd "/Users/University/Final Project/aura/ai"
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn src.main:app --reload --host 127.0.0.1 --port 8001
```

Verify AI health:

```bash
curl -s http://localhost:8001/health
```

Start the Node backend:

```bash
cd "/Users/University/Final Project/aura/server"
npm install
npm run dev
```

Verify backend health:

```bash
curl -s http://localhost:3000/health
```

## Demo data and reset

Use the deterministic demo seed from the server package:

```bash
cd "/Users/University/Final Project/aura/server"
npm run seed
npm run seed:reset
```

Notes:

- `npm run seed` is safe and deterministic for repeat runs.
- `npm run seed:reset` clears `demo-v1` data and reseeds the demo identities.
- Demo access codes include `P1-DEMO`, `P2-DEMO`, and `P3-DEMO`.
- Demo clinician credentials include `clinician1@example.com` / `devpass123`.

## Dashboard commands

Use the dashboard package for clinician UI work:

```bash
cd "/Users/University/Final Project/aura/dashboard"
npm install
npm run dev
npm run verify
npm run e2e:live
```

Useful validations:

- `npm run verify` runs lint, typecheck, unit tests, and build.
- `npm run e2e:live` runs Playwright against the live local backend.
- `npm run verify:ui` is available when you want build plus mocked E2E validation.

## Mobile commands

Use the safe Expo entrypoints in the mobile package. Node `>=20 <23` is required; Node 22 LTS is the recommended local version.

```bash
cd "/Users/University/Final Project/aura/mobile"
npm install
npm run start
npm run web
npm run qa:web
npm run dev:web
npm run dev:device
npm run dev:device:lan
```

Command intent:

- `npm run start`: recommended safe Expo start
- `npm run web`: safe Expo web start
- `npm run qa:web`: TypeScript no-emit check plus web guardrails plus accessibility smoke
- `npm run dev:web`: switches to `.env.web` and boots web
- `npm run dev:device`: switches to `.env.device` and starts Expo tunnel on `8082`
- `npm run dev:device:lan`: switches to `.env.device` and starts LAN mode on `8082`

Prefer these commands over `npm run start:raw` unless you explicitly need raw Expo behavior.

## n8n workflows

Canonical workflow exports live in:

- `/Users/University/Final Project/aura/n8n/workflows/`

Workflow catalog:

- `01 - Alert Created Webhook (POST → Dedupe → Table → Telegram → Respond)`: receives `POST /webhook/alert-created`, deduplicates by `alertId`, stores the alert, optionally sends Telegram, and posts truthful delivery callback status to Aura.
- `02 - List Alerts Proxy (GET → Aura API → Respond)`: exposes `GET /webhook/alerts` for alert listing via Aura backend.
- `03 - Missed Check-in Follow-through (Cron → Aura Process → Telegram → Callback)`: daily missed-checkin follow-through processing and callback reporting.
- `04 - Task Reminder Timing (Cron → Aura Process → Telegram → Callback)`: periodic patient-action task reminder processing and callback reporting.
- `05 - Error Trigger → Telegram (throttled)`: throttled dev error notifications for n8n workflow failures.
- `06 - Appointment Reminder and Status Follow-up (Cron → Aura Process → Telegram → Callback)`: appointment reminder and follow-up processing.
- `07 - Daily Digest (Cron 09:00 → Aura Digest → Telegram → Callback)`: backend-built daily digest at `09:00` Asia/Colombo with truthful automation callbacks.
- `08 - Communication No-Response Escalation (Cron → Aura Process → Telegram → Callback)`: daily unresolved communication escalation processing.
- `09 - Alert Notification Processor (Cron every minute → Aura Internal Process)`: every-minute alert notification processing via Aura internal endpoint.
- `10 - Alert Notification Reconcile (Cron every 5 minutes → Aura Internal Reconcile)`: every-5-minute alert notification reconciliation via Aura internal endpoint.
- `11 - Telegram Commands (／open ／ack ／resolve)`: Telegram bot command handling for alert operations.

### Recommended local demo baseline

Active in the current local demo workspace:

- `01 - Alert Created Webhook (POST → Dedupe → Table → Telegram → Respond)`
- `07 - Daily Digest (Cron 09:00 → Aura Digest → Telegram → Callback)`

Import as canonical but keep inactive by default unless explicitly demoing or assigning scheduler ownership:

- `03 - Missed Check-in Follow-through (Cron → Aura Process → Telegram → Callback)`
- `04 - Task Reminder Timing (Cron → Aura Process → Telegram → Callback)`
- `06 - Appointment Reminder and Status Follow-up (Cron → Aura Process → Telegram → Callback)`
- `08 - Communication No-Response Escalation (Cron → Aura Process → Telegram → Callback)`
- `09 - Alert Notification Processor (Cron every minute → Aura Internal Process)`
- `10 - Alert Notification Reconcile (Cron every 5 minutes → Aura Internal Reconcile)`

Optional utilities:

- `05 - Error Trigger → Telegram (throttled)` for dev notification coverage
- `11 - Telegram Commands (／open ／ack ／resolve)` when clinician Telegram bot controls are in scope

Required local n8n environment:

```bash
AURA_API_BASE=http://host.docker.internal:3000
AURA_WEBHOOK_KEY=dev_aura_webhook_key
TELEGRAM_CLINICIAN_CHAT_ID=CHANGE_ME
```

Notes:

- Leave `TELEGRAM_CLINICIAN_CHAT_ID=CHANGE_ME` when you want to prove callback behavior without attempting a real Telegram send.
- Activate alert cadence workflows `09` and `10` in only one n8n instance per backend environment.

### Callback verification

Run these checks after workflow export updates:

```bash
cd "/Users/University/Final Project/aura"
rg -n "/events/notification-status" "n8n/workflows/01 - Alert Created Webhook (POST → Dedupe → Table → Telegram → Respond).json"
rg -n "/events/automation-status|/internal/n8n/follow-through/" n8n/workflows/*.json
rg -n "/internal/n8n/alert-notifications/process|/internal/n8n/alert-notifications/reconcile" n8n/workflows/*.json
```

## Quick pointers

- Use `/Users/University/Final Project/aura/server/README.md` for long curl examples across patient, caregiver, clinician, and reporting APIs.
- Use `/Users/University/Final Project/aura/mobile/README.md` for feature-by-feature mobile demo flows and troubleshooting.
- Use `/Users/University/Final Project/aura/dashboard/README.md` for clinician routes, auth bootstrap, and live smoke instructions.
- Use `/Users/University/Final Project/aura/n8n/README.md` for the click-by-click setup of workflow `01`.
