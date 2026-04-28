# Aura – Local Development Setup

## Current demo/proof entry points

For the current demo-ready product state, use these repo sources as truth:

- Final proof pack: `/Users/University/Final Project/aura/FINAL_PROOF_PACK.md`
- Canonical n8n workflow exports: `/Users/University/Final Project/aura/n8n/workflows/README.md`
- Dashboard routes and auth bootstrap: `/Users/University/Final Project/aura/dashboard/README.md`
- Mobile workflow surfaces: `/Users/University/Final Project/aura/mobile/README.md`

This README remains useful for local service startup, but it is no longer the full product walkthrough on its own.

## Current implementation truth note

- Current AI safety routing is live and used by check-ins and chat through the FastAPI `/classify` endpoint.
- The supportive `/rag/reply` path is still a stub response and should not be presented as retrieval-backed AI.
- `aura_pgvector` is provisioned in Docker for future retrieval work, but the current demo flows do not depend on vector storage or retrieval.
- Canonical n8n workflow exports live in `/Users/University/Final Project/aura/n8n/workflows/`.
- Legacy reference folders such as `/Users/University/Final Project/aura/n8n_workflows/` and `/Users/University/Final Project/aura/mobile_backup_20260223_123515/` are not active runtime sources.

## Prerequisites
- Docker Desktop
- VSCode
- Terminal

## Run Everything Locally (Start-to-Finish)
### Fast Path (experienced users)
1. `cd "/Users/University/Final Project/aura" && docker compose up -d`
2. Start the AI service from `/Users/University/Final Project/aura/ai`:
   - `source .venv/bin/activate`
   - `uvicorn src.main:app --reload --host 127.0.0.1 --port 8001`
3. Start the Node backend from `/Users/University/Final Project/aura/server`:
   - `npm run dev`
4. Start the dashboard from `/Users/University/Final Project/aura/dashboard`:
   - `npm run dev`
5. Optional for full patient-flow demos: start the mobile app from `/Users/University/Final Project/aura/mobile`:
   - `npm run start`
6. Seed the base demo data from `/Users/University/Final Project/aura/server`:
   - `npm run seed`
7. Import/activate the canonical n8n exports described in `/Users/University/Final Project/aura/n8n/workflows/README.md`.
8. Sign in at `http://localhost:5173/login` and open the dashboard routes you need.
9. Run the deeper verification flow in `/Users/University/Final Project/aura/FINAL_PROOF_PACK.md`.

Mobile is optional for clinician-dashboard-only demos. Keep the detailed runbooks in:
- `/Users/University/Final Project/aura/ai/README.md`
- `/Users/University/Final Project/aura/mobile/README.md`
- `/Users/University/Final Project/aura/n8n/README.md`
- `/Users/University/Final Project/aura/n8n/workflows/README.md`

### 0) Before you start (one-time checks)
1. Confirm Docker Desktop is running.
2. Confirm you are in the correct folder:
```bash
cd "/Users/University/Final Project/aura"
pwd
```
3. Terminal naming:
- `Terminal 1` means Docker infrastructure.
- `Terminal 2` means the AI service.
- `Terminal 3` means the Node backend.
- `Terminal 4` means the dashboard dev server.
- `Terminal 5` means the optional mobile app.

### 1) Start Docker services (Mongo + pgvector + n8n) in Terminal 1
1. Run:
```bash
cd "/Users/University/Final Project/aura"
docker compose up -d
```
2. Verify containers:
```bash
docker ps
```
3. Expected in `docker ps`:
- `aura_mongo` is `Up`
- `aura_pgvector` is `Up`
- `aura_n8n` is `Up`
4. Note:
- `aura_pgvector` is included for future retrieval experiments. The current local demo does not require it to be populated with vectors.
5. Quick checks:
- Open n8n in browser: `http://localhost:5678`
- Check port:
```bash
lsof -i :5678
```
6. If not running, inspect logs:
```bash
docker logs aura_n8n --tail 50
docker logs aura_mongo --tail 50
docker logs aura_pgvector --tail 50
```

### 2) Start the AI service (FastAPI) in Terminal 2
1. Run:
```bash
cd "/Users/University/Final Project/aura/ai"
source .venv/bin/activate
uvicorn src.main:app --reload --host 127.0.0.1 --port 8001
```
2. In another terminal tab, verify:
```bash
curl -s http://localhost:8001/health
```
3. Expected:
```json
{"status":"ok"}
```
4. Troubleshooting:
- If `address already in use`:
```bash
lsof -i :8001
```
- If this is your first local AI setup, use `/Users/University/Final Project/aura/ai/README.md` for venv creation and dependency installation.
- If import errors persist: confirm you are in `/Users/University/Final Project/aura/ai` and filenames match exactly.

### 3) Start the Node backend (Express + Mongo) in Terminal 3
1. Run:
```bash
cd "/Users/University/Final Project/aura/server"
npm install
npm run dev
```
2. Verify API health:
```bash
curl -s http://localhost:3000/health
```
3. Expected:
```json
{"status":"ok"}
```
4. Also verify Mongo connection in server console:
- Expected log line includes: `✅ Mongo connected`
5. Troubleshooting:
- If Mongo connection fails:
```bash
docker ps
docker logs aura_mongo --tail 50
```
- If port in use:
```bash
lsof -i :3000
```

### 4) Start the dashboard in Terminal 4
1. Run:
```bash
cd "/Users/University/Final Project/aura/dashboard"
npm install
npm run dev
```
2. Open:
```text
http://localhost:5173/login
```
3. The dashboard README remains the deeper source of truth for routes, auth bootstrap, and workflow demos:
- `/Users/University/Final Project/aura/dashboard/README.md`

### 5) Optional: start the mobile app in Terminal 5
Use this only when you need the patient-facing demo flows.

1. Run:
```bash
cd "/Users/University/Final Project/aura/mobile"
npm run start
```
2. Typical web/dev URLs:
- `http://localhost:8081`
- or the Expo URL printed in the terminal
3. Full mobile setup and env notes remain in:
- `/Users/University/Final Project/aura/mobile/README.md`

### 6) Seed the base demo data
Run the server seed from `/Users/University/Final Project/aura/server`:

```bash
npm run seed
npm run seed:reset
```

Notes:
- `npm run seed` creates or refreshes the baseline deterministic demo data, including the standard demo users and patient access codes.
- `npm run seed:reset` clears the base demo dataset before reseeding it.
- This base seed is different from the presentation seed workflow described below.
- Full seeded-data details live in `/Users/University/Final Project/aura/server/scripts/seed/README.md`.

### 7) Demo access
- Dashboard clinician: `clinician1@example.com` / `devpass123`
- Mobile patient codes:
  - `P1-DEMO`
  - `P2-DEMO`
  - `P3-DEMO`

For the secondary clinician login and the full demo access list, see `/Users/University/Final Project/aura/FINAL_PROOF_PACK.md`.

### 8) Key local URLs
- Backend health: `http://localhost:3000/health`
- AI health: `http://localhost:8001/health`
- Dashboard login: `http://localhost:5173/login`
- n8n UI: `http://localhost:5678`
- Mobile web: usually `http://localhost:8081` or the Expo URL printed in the terminal

### 9) Dashboard presentation demo mode
Use this local-only workflow when you want the realistic full-dashboard presentation dataset, the Settings -> Presentation tools controls, and the backend presentation seed routes.

Backend (Terminal 3):
```bash
cd "/Users/University/Final Project/aura/server"
AURA_PRESENTATION_SEED_ENABLED=true npm run dev
```

Dashboard (Terminal 4):
```bash
cd "/Users/University/Final Project/aura/dashboard"
VITE_AURA_PRESENTATION_TOOLS_ENABLED=true npm run dev
```

Then:
1. Open `http://localhost:5173/settings`
2. Sign in as clinician if needed
3. Open `Settings -> Presentation tools`
4. Click `Reset presentation data` if needed
5. Click `Load presentation data`
6. Visit:
   - `/dashboard`
   - `/worklist`
   - `/patients`
   - `/communication`
   - `/alerts`
   - `/insights`
   - `/appointments`

What this does:
- The presentation seed creates a realistic full-dashboard demo dataset.
- The dataset is marked and managed by the backend as presentation seed data.
- `Reset presentation data` removes presentation seed records only.
- This workflow is for local/dev/demo use only.

### 10) Base seed vs presentation seed
| Workflow | Command or control | Purpose | Reset path | Docs |
|---|---|---|---|---|
| Base demo seed | `npm run seed` / `npm run seed:reset` in `server` | Deterministic baseline demo users, patients, and development data | `npm run seed:reset` | `/Users/University/Final Project/aura/server/scripts/seed/README.md` |
| Presentation seed | `Settings -> Presentation tools -> Load presentation data` | Realistic full-dashboard presentation dataset | `Settings -> Presentation tools -> Reset presentation data` | This README section |

The presentation seed requires both `AURA_PRESENTATION_SEED_ENABLED=true` on the backend and `VITE_AURA_PRESENTATION_TOOLS_ENABLED=true` on the dashboard. Do not confuse `npm run seed:reset` with `Reset presentation data`; they target different datasets and workflows.

### 11) Set up n8n canonical workflows
The alert-created workflow is still required, but the current demo flow also expects the follow-through workflow exports under `/Users/University/Final Project/aura/n8n/workflows/`.

Full guides:
- `/Users/University/Final Project/aura/n8n/README.md` for Workflow 01 click-by-click setup
- `/Users/University/Final Project/aura/n8n/workflows/README.md` for the full canonical export list

Alert durability cadence note:
- To finish R2 alert durability in an environment that should automatically own notification processing, also import workflows `09 - Alert Notification Processor (Cron every minute → Aura Internal Process)` and `10 - Alert Notification Reconcile (Cron every 5 minutes → Aura Internal Reconcile)`.
- Keep those two workflows inactive by default until that environment is explicitly chosen as the scheduler owner.
- Activate them in only one n8n instance per backend environment.
- They require `AURA_API_BASE` and `AURA_WEBHOOK_KEY` in n8n.
- If n8n is down, alert notification cadence pauses, but durable jobs remain in Mongo and resume when the scheduler owner returns.

Mini-summary:
- Create `Webhook` node with method `POST` and path `alert-created`.
- Connect a `Set` node to map key fields for easier viewing.
- Connect `Respond to Webhook` node returning `{"ok":true}`.
- Save and activate the workflow.

Verification curl:
```bash
curl -X POST http://localhost:5678/webhook/alert-created \
  -H "Content-Type: application/json" \
  -d '{"type":"ALERT_CREATED","patientId":"p1","alertId":"test123","risk":"high","reason":["PAIN_GE_THRESHOLD"],"timestamp":"2026-02-18T12:00:00.000Z"}'
```

Expected response:
```json
{"ok":true}
```

Troubleshooting:
- `404`: wrong path (must be `/webhook/alert-created`)
- No execution: workflow not active

### 12) Run the end-to-end test (THIS proves the Safety Spine works)
This proves the full chain: check-in -> AI classify -> alert in Mongo -> n8n webhook -> clinician fetches alert.

#### 12A) Send a HIGH-RISK check-in (pain 8)
```bash
curl -X POST http://localhost:3000/checkins \
  -H "Content-Type: application/json" \
  -d '{
    "patientId":"p1",
    "date":"2026-02-18",
    "mood":3,
    "pain":8,
    "adherence":{"exercises":0.4,"medication":true},
    "notes":"pain getting worse"
  }'
```

Expected response includes:
- `ok: true`
- `risk: "high"`
- `alertId`
- `n8nDelivered` (`true` or `false`)
- fixed safety `message`

#### 12B) Confirm n8n executed
1. Open n8n UI.
2. Go to `Executions`.
3. Open latest execution.
4. Confirm Webhook node output includes the incoming alert payload.

#### 12C) Confirm alert exists in Mongo via clinician endpoint
```bash
curl -s "http://localhost:3000/clinician/alerts?status=open"
```

Expected:
- Returned alerts list contains the `alertId` from step 12A.

#### 12D) Acknowledge the alert
```bash
curl -X PATCH http://localhost:3000/clinician/alerts/<ALERT_ID> \
  -H "Content-Type: application/json" \
  -d '{"status":"acknowledged"}'
```

Expected:
- `status` becomes `"acknowledged"`
- `acknowledgedAt` is set

### 13) Run the chat high-risk test (crisis phrase)
```bash
curl -X POST http://localhost:3000/chat/send \
  -H "Content-Type: application/json" \
  -d '{"patientId":"p1","text":"I cant breathe"}'
```

Expected:
- `ok: true`
- `risk: "high"`
- `reply` contains the fixed safety message
- `alertId` returned
- new n8n execution appears

### 14) What “working” looks like (final checklist)
- [ ] Docker containers running (`aura_mongo`, `aura_pgvector`, `aura_n8n`)
- [ ] AI health OK on port `8001`
- [ ] API health OK on port `3000` and Mongo connected
- [ ] n8n workflow active and webhook returns `{"ok":true}`
- [ ] High-risk check-in creates alert and triggers n8n
- [ ] Clinician alerts endpoint returns created alert
- [ ] Alert can be acknowledged via PATCH
- [ ] High-risk chat creates alert and triggers n8n

### 15) Stop everything (when done)
1. Stop the mobile app: `Ctrl+C` in `Terminal 5`, if running.
2. Stop the dashboard: `Ctrl+C` in `Terminal 4`.
3. Stop the Node backend: `Ctrl+C` in `Terminal 3`.
4. Stop the AI service: `Ctrl+C` in `Terminal 2`.
5. Stop Docker services:
```bash
cd "/Users/University/Final Project/aura"
docker compose down
```
6. Optional clean reset (deletes all DB data):
```bash
docker compose down -v
```

### 16) Quick Debug Matrix (very useful)
| Symptom | Likely Cause | Fix |
|---|---|---|
| `/checkins` returns `502 AI_UNAVAILABLE` | AI service not running | Start AI service and run `curl -s http://localhost:8001/health` |
| `n8nDelivered:false` in API response | Wrong webhook URL or workflow inactive | Test webhook curl directly and activate workflow in n8n |
| Mongo connection error on backend startup | `aura_mongo` not running | Run `docker ps` and `docker logs aura_mongo --tail 50` |
| `404` on webhook | Wrong webhook path | Use `http://localhost:5678/webhook/alert-created` |

## Start services
```bash
cd "/Users/University/Final Project/aura"
docker compose up -d
```

## Check services
- n8n UI: http://localhost:5678
- MongoDB: mongodb://localhost:27017
- Postgres: postgresql://aura:aura@localhost:5432/aura_vectors

## Stop services
```bash
cd "/Users/University/Final Project/aura"
docker compose down
```

## Reset all data (DANGEROUS)
This will delete all persisted database and n8n data volumes.

```bash
docker compose down -v
```

## Common Problems
- If ports are already in use, check what's using them:
  - `lsof -i :27017`
  - `lsof -i :5432`
  - `lsof -i :5678`
- If port `3000` is already in use:
  - `lsof -i :3000`
  - `kill -9 <PID>`
- If Docker is not running, open Docker Desktop and wait until it's fully started.
- If n8n keeps restarting, inspect logs:
  - `docker logs aura_n8n`
- If the presentation tools panel is not visible:
  - restart the dashboard with `VITE_AURA_PRESENTATION_TOOLS_ENABLED=true npm run dev`
- If presentation seed controls are disabled or unavailable:
  - restart the backend with `AURA_PRESENTATION_SEED_ENABLED=true npm run dev`
- If presentation data looks old or mixed:
  - use `Settings -> Presentation tools -> Reset presentation data`, then `Load presentation data` again
- If you suspect a seed conflict:
  - inspect the backend response and avoid manually deleting arbitrary database records
- If Vite shows a large chunk warning:
  - treat it as non-blocking if the build succeeds

## Safety Notes
- `AURA_PRESENTATION_SEED_ENABLED` and `VITE_AURA_PRESENTATION_TOOLS_ENABLED` are local/dev/demo-only flags.
- Do not treat the presentation seed workflow as production setup.
- Do not enable presentation seed in production.
- Do not commit real local `.env` or `.env.local` files with machine-specific values.
