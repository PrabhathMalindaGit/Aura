# Aura – Local Development Setup

## Current demo/proof entry points

For the current demo-ready product state, use these repo sources as truth:

- Final proof pack: `/Users/University/Final Project/aura/FINAL_PROOF_PACK.md`
- Canonical n8n workflow exports: `/Users/University/Final Project/aura/n8n/workflows/README.md`
- Dashboard routes and auth bootstrap: `/Users/University/Final Project/aura/dashboard/README.md`
- Mobile workflow surfaces: `/Users/University/Final Project/aura/mobile/README.md`

This README is the top-level local startup guide. The linked files remain the deeper runbooks for product walkthroughs and service-specific details.

## Current implementation truth note

- Current AI safety routing is live and used by check-ins and chat through the FastAPI `/classify` endpoint.
- Static rehabilitation retrieval is implemented and fallback-safe for low-risk supportive replies.
- Patient living memory is stored canonically in MongoDB.
- PGVector is optional:
  - the AI service uses PGVector for curated static rehabilitation knowledge when enabled.
  - the backend can mirror sanitized patient-memory summaries to PGVector for same-patient retrieval when enabled.
- PGVector does not store raw patient messages.
- High-risk chat bypasses RAG, memory writing, memory retrieval, and PGVector patient-memory indexing.
- Canonical n8n workflow exports live in `/Users/University/Final Project/aura/n8n/workflows/`.
- Legacy reference folders such as `/Users/University/Final Project/aura/n8n_workflows/` and `/Users/University/Final Project/aura/mobile_backup_20260223_123515/` are not active runtime sources.

## Prerequisites

- Docker Desktop
- Terminal
- Node 22 recommended
- Python 3 with `venv`

## Project services overview

| Service | Local URL / port | Notes |
|---|---|---|
| MongoDB | `mongodb://localhost:27017` | Canonical app database and canonical patient-memory store. |
| PGVector/Postgres | `postgresql://aura:aura@localhost:5432/aura_vectors` | Optional static rehab knowledge and sanitized patient-memory retrieval index. |
| n8n | `http://localhost:5678` | Workflow automation for alert and follow-through demos. |
| AI service | `http://127.0.0.1:8001` | FastAPI Safety Router and low-risk static RAG reply path. |
| Server | `http://localhost:3000` | Node/Express + MongoDB backend. |
| Dashboard | `http://localhost:5173` | Vite/React clinician dashboard. |
| Mobile | usually `http://localhost:8081` | Optional Expo patient app. |

## One-time setup

Use Node 22 where possible. The mobile app has a `.nvmrc` pinned to `22`.

```bash
cd "/Users/University/Final Project/aura/server"
npm install
cp .env.example .env

cd "/Users/University/Final Project/aura/dashboard"
npm install
cp .env.local.example .env.local

cd "/Users/University/Final Project/aura/mobile"
npm install
cp .env.example .env

cd "/Users/University/Final Project/aura/ai"
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

## Startup modes

Most development uses normal mode. Use PGVector-enabled final/local mode when you want static PGVector retrieval and optional PGVector patient-memory indexing enabled. Use presentation demo mode for realistic dashboard presentation data.

### A. Normal development mode

Start Docker infrastructure:

```bash
cd "/Users/University/Final Project/aura"
docker compose up -d mongo pgvector n8n
```

Start the AI service:

```bash
cd "/Users/University/Final Project/aura/ai"
source .venv/bin/activate
uvicorn src.main:app --reload --host 127.0.0.1 --port 8001
```

Start the backend:

```bash
cd "/Users/University/Final Project/aura/server"
npm run dev
```

Start the dashboard:

```bash
cd "/Users/University/Final Project/aura/dashboard"
npm run dev
```

Optional mobile startup:

```bash
cd "/Users/University/Final Project/aura/mobile"
npm run start
```

Seed baseline demo data:

```bash
cd "/Users/University/Final Project/aura/server"
npm run seed
```

Presentation tools are not enabled in normal mode.

### B. PGVector-enabled final/local mode

Start MongoDB and PGVector:

```bash
cd "/Users/University/Final Project/aura"
docker compose up -d mongo pgvector
```

Check the vector extension:

```bash
docker exec aura_pgvector psql -U aura -d aura_vectors -c "select extname, extversion from pg_extension where extname = 'vector';"
```

Ingest static rehabilitation knowledge when needed:

```bash
cd "/Users/University/Final Project/aura/ai"
source .venv/bin/activate
RAG_PGVECTOR_DATABASE_URL="postgresql://aura:aura@localhost:5432/aura_vectors" PYTHONPATH=. .venv/bin/python scripts/ingest_static_knowledge_pgvector.py
```

Run ingestion after recreating the PGVector volume/table or after changing `ai/data/rehab_knowledge.json`; it is not required on every startup.

Start the AI service with PGVector static retrieval:

```bash
cd "/Users/University/Final Project/aura/ai"
source .venv/bin/activate
RAG_PGVECTOR_ENABLED=true \
RAG_PGVECTOR_DATABASE_URL="postgresql://aura:aura@localhost:5432/aura_vectors" \
PYTHONPATH=. uvicorn src.main:app --reload --host 127.0.0.1 --port 8001
```

Start the backend with optional PGVector patient-memory indexing:

```bash
cd "/Users/University/Final Project/aura/server"
RAG_PGVECTOR_PATIENT_MEMORY_ENABLED=true \
RAG_PGVECTOR_PATIENT_MEMORY_FALLBACK_ENABLED=true \
RAG_PGVECTOR_DATABASE_URL="postgresql://aura:aura@localhost:5432/aura_vectors" \
RAG_PGVECTOR_PATIENT_MEMORY_TOP_K=3 \
npm run dev
```

Important boundaries:
- MongoDB remains canonical for patient memory.
- PGVector indexes curated static rehabilitation knowledge and optional sanitized low-risk memory summaries.
- PGVector does not store raw patient messages.
- High-risk chat bypasses RAG, memory writing, memory retrieval, and PGVector patient-memory indexing.
- PGVector patient-memory indexing is disabled by default and fallback-safe.

Start dashboard/mobile normally if needed.

### C. Presentation demo mode

Use this for final demos/screenshots with realistic backend-seeded dashboard data.

Backend:

```bash
cd "/Users/University/Final Project/aura/server"
AURA_PRESENTATION_SEED_ENABLED=true npm run dev
```

Dashboard:

```bash
cd "/Users/University/Final Project/aura/dashboard"
VITE_AURA_PRESENTATION_TOOLS_ENABLED=true npm run dev
```

Then open `http://localhost:5173/settings` and use **Settings -> Presentation tools -> Reset presentation data** / **Load presentation data**.

Local/demo only. Never enable presentation seed in production. `npm run seed:reset` and **Reset presentation data** target different datasets.

## Demo access and URLs

| Item | Value |
|---|---|
| Dashboard login | `http://localhost:5173/login` |
| Backend health | `http://localhost:3000/health` |
| AI health | `http://localhost:8001/health` |
| n8n UI | `http://localhost:5678` |
| Mobile/Expo | usually `http://localhost:8081` or the Expo URL printed in the terminal |
| Dashboard clinician | `clinician1@example.com` / `devpass123` |
| Mobile patient codes | `P1-DEMO`, `P2-DEMO`, `P3-DEMO` |

For the secondary clinician login and the full demo access list, see `/Users/University/Final Project/aura/FINAL_PROOF_PACK.md`.

## Verification commands

For documentation-only changes, `git diff --check` is the minimum formatting check. Run the service commands when code changes or when you need fresh proof before submission.

AI:

```bash
cd "/Users/University/Final Project/aura/ai"
PYTHONPATH=. .venv/bin/python -m pytest -q
```

Server:

```bash
cd "/Users/University/Final Project/aura/server"
npm test
npm run build
```

Dashboard:

```bash
cd "/Users/University/Final Project/aura/dashboard"
npm run verify
npm run e2e
```

Mobile:

```bash
cd "/Users/University/Final Project/aura/mobile"
npm test
npm run qa:web
```

Root formatting check:

```bash
cd "/Users/University/Final Project/aura"
git diff --check
```

## Evidence snapshot

The concise final evidence summary lives at `docs/evidence/final-evaluation-summary-2026-04-29.md`.

Current final-project evidence snapshot:
- Safety Router: 144 author-labelled synthetic examples, TP=76, FP=0, TN=68, FN=0, precision=1.0000, recall=1.0000, F1=1.0000, reason-code agreement=1.0000.
- Server: 336 tests passed.
- AI: 50 tests passed.
- Static PGVector regression: 12 tests passed.
- Dashboard: 505 unit tests and 19 E2E tests passed.
- Mobile: 125 tests passed.
- Final local latency benchmark with PGVector static retrieval and optional PGVector patient-memory indexing enabled: 64.85 ms p95 low-risk chat, 50.72 ms p95 alert visibility, failures 0.
- Clinical validation remains future work.

## Safety and privacy boundaries

Aura is a local final-project prototype. The evaluation evidence is local and synthetic unless explicitly stated otherwise, and it is not clinical validation or proof of safe unsupervised clinical deployment. PGVector retrieval uses deterministic hashing vectors as prototype retrieval vectors, not clinically validated semantic embeddings. MongoDB remains canonical for patient memory. The optional PGVector patient-memory index stores only sanitized low-risk summaries for same-patient retrieval. Do not store raw patient messages, crisis text, medication dosage details, contact details, secrets, or real patient data in PGVector. High-risk chat bypasses RAG, memory writing, memory retrieval, and PGVector patient-memory indexing.

## n8n workflow setup

Canonical workflow guides:
- `/Users/University/Final Project/aura/n8n/README.md` for Workflow 01 click-by-click setup.
- `/Users/University/Final Project/aura/n8n/workflows/README.md` for the full canonical export list.

For local demos, import the JSON files from `/Users/University/Final Project/aura/n8n/workflows/`. Legacy snapshots in `/Users/University/Final Project/aura/n8n_workflows/` are reference-only.

Alert durability scheduler caution:
- Workflows `09 - Alert Notification Processor (Cron every minute -> Aura Internal Process)` and `10 - Alert Notification Reconcile (Cron every 5 minutes -> Aura Internal Reconcile)` should remain inactive by default.
- Activate them only when the environment is explicitly chosen as the scheduler owner.
- Use only one active scheduler owner per backend environment.
- They require `AURA_API_BASE` and `AURA_WEBHOOK_KEY` in n8n.
- If n8n is down, alert notification cadence pauses, but durable jobs remain in Mongo and resume when the scheduler owner returns.

Webhook verification:

```bash
curl -X POST http://localhost:5678/webhook/alert-created \
  -H "Content-Type: application/json" \
  -d '{"type":"ALERT_CREATED","patientId":"p1","alertId":"test123","risk":"high","reason":["PAIN_GE_THRESHOLD"],"timestamp":"2026-02-18T12:00:00.000Z"}'
```

Expected response:

```json
{"ok":true}
```

If this returns `404`, confirm the workflow is active and the path is exactly `/webhook/alert-created`.

## Safety Spine smoke tests

These checks assume Docker, AI, server, and the alert-created n8n workflow are already running.

High-risk check-in should create an alert:

```bash
curl -X POST http://localhost:3000/checkins \
  -H "Content-Type: application/json" \
  -d '{"patientId":"p1","date":"2026-02-18","mood":3,"pain":8,"adherence":{"exercises":0.4,"medication":true},"notes":"pain getting worse"}'
```

Expected response includes `ok: true`, `risk: "high"`, an `alertId`, and the fixed safety message. `n8nDelivered` may be `true` or `false` depending on local workflow state.

High-risk chat should create an alert:

```bash
curl -X POST http://localhost:3000/chat/send \
  -H "Content-Type: application/json" \
  -d '{"patientId":"p1","text":"I cant breathe"}'
```

Expected response includes `ok: true`, `risk: "high"`, a fixed safety reply, and an `alertId`.

Confirm clinician alert visibility:

```bash
curl -s "http://localhost:3000/clinician/alerts?status=open"
```

Acknowledge an alert:

```bash
curl -X PATCH http://localhost:3000/clinician/alerts/<ALERT_ID> \
  -H "Content-Type: application/json" \
  -d '{"status":"acknowledged"}'
```

Expected: `status` becomes `"acknowledged"` and `acknowledgedAt` is set.

## Stop and cleanup

Stop app services with `Ctrl+C` in the AI, server, dashboard, and mobile terminals.

Stop Docker services:

```bash
cd "/Users/University/Final Project/aura"
docker compose down
```

Dangerous full Docker data reset:

```bash
cd "/Users/University/Final Project/aura"
docker compose down -v
```

Reset seeded demo data without dropping Docker volumes:

```bash
cd "/Users/University/Final Project/aura/server"
npm run seed:reset
```

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `/checkins` or chat returns `502 AI_UNAVAILABLE` | AI service is not running or not reachable | Start AI and run `curl -s http://localhost:8001/health`. |
| Mongo connection error on backend startup | `aura_mongo` is not running | Run `docker ps` and `docker logs aura_mongo --tail 50`. |
| n8n webhook returns `404` or no execution appears | Wrong webhook path or inactive workflow | Use `http://localhost:5678/webhook/alert-created` and activate the workflow. |
| Port conflict on `3000`, `5173`, `8001`, `8081`, or `5678` | Another process is using the port | Run `lsof -i :<PORT>` and stop the conflicting process. |
| Presentation tools panel is not visible | Dashboard was started without the Vite flag | Restart dashboard with `VITE_AURA_PRESENTATION_TOOLS_ENABLED=true npm run dev`. |
| Presentation seed controls are disabled | Backend was started without the seed flag | Restart backend with `AURA_PRESENTATION_SEED_ENABLED=true npm run dev`. |
| PGVector extension check fails | `aura_pgvector` is not running or the volume is unhealthy | Run `docker compose up -d pgvector`, inspect `docker logs aura_pgvector --tail 50`, and rerun the extension check. |
| PGVector retrieval has no static results | Static knowledge table was recreated or not ingested | Rerun `ai/scripts/ingest_static_knowledge_pgvector.py` with `RAG_PGVECTOR_DATABASE_URL` set. |
