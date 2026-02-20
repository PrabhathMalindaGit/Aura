# Aura – Local Development Setup

## Prerequisites
- Docker Desktop
- VSCode
- Terminal

## Run Everything Locally (Start-to-Finish)
### Fast Path (experienced users)
1. `cd "/Users/University/Final Project/aura" && docker compose up -d`
2. Start AI service (`uvicorn src.main:app --reload --host 127.0.0.1 --port 8001`) from `/Users/University/Final Project/aura/ai`.
3. Start Node backend (`npm run dev`) from `/Users/University/Final Project/aura/server`.
4. Ensure n8n workflow `01 - Alert Created Webhook` is active.
5. Run a high-risk check-in (`pain: 8`) to `/checkins`.
6. Verify alert via `/clinician/alerts?status=open`.

### 0) Before you start (one-time checks)
1. Confirm Docker Desktop is running.
2. Confirm you are in the correct folder:
```bash
cd "/Users/University/Final Project/aura"
pwd
```
3. Terminal naming:
- `Terminal 1` means one VSCode terminal tab/window dedicated to AI service.
- `Terminal 2` means a separate VSCode terminal tab/window dedicated to Node backend.

### 1) Start Docker services (Mongo + Postgres + n8n)
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
4. Quick checks:
- Open n8n in browser: `http://localhost:5678`
- Check port:
```bash
lsof -i :5678
```
5. If not running, inspect logs:
```bash
docker logs aura_n8n --tail 50
docker logs aura_mongo --tail 50
docker logs aura_pgvector --tail 50
```

### 2) Start the AI service (FastAPI) in Terminal 1
1. Run:
```bash
cd "/Users/University/Final Project/aura/ai"
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
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
- If import errors: confirm you are in `/Users/University/Final Project/aura/ai` and filenames match exactly.

### 3) Start the Node backend (Express + Mongo) in Terminal 2
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

### 4) Set up n8n Workflow 01 (Alert Created Webhook)
This is a one-time setup step.

Full guide: `/Users/University/Final Project/aura/n8n/README.md`

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

### 5) Run the end-to-end test (THIS proves the Safety Spine works)
This proves the full chain: check-in -> AI classify -> alert in Mongo -> n8n webhook -> clinician fetches alert.

#### 5A) Send a HIGH-RISK check-in (pain 8)
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

#### 5B) Confirm n8n executed
1. Open n8n UI.
2. Go to `Executions`.
3. Open latest execution.
4. Confirm Webhook node output includes the incoming alert payload.

#### 5C) Confirm alert exists in Mongo via clinician endpoint
```bash
curl -s "http://localhost:3000/clinician/alerts?status=open"
```

Expected:
- Returned alerts list contains the `alertId` from step 5A.

#### 5D) Acknowledge the alert
```bash
curl -X PATCH http://localhost:3000/clinician/alerts/<ALERT_ID> \
  -H "Content-Type: application/json" \
  -d '{"status":"acknowledged"}'
```

Expected:
- `status` becomes `"acknowledged"`
- `acknowledgedAt` is set

### 6) Run the chat high-risk test (crisis phrase)
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

### 7) What “working” looks like (final checklist)
- [ ] Docker containers running (`aura_mongo`, `aura_pgvector`, `aura_n8n`)
- [ ] AI health OK on port `8001`
- [ ] API health OK on port `3000` and Mongo connected
- [ ] n8n workflow active and webhook returns `{"ok":true}`
- [ ] High-risk check-in creates alert and triggers n8n
- [ ] Clinician alerts endpoint returns created alert
- [ ] Alert can be acknowledged via PATCH
- [ ] High-risk chat creates alert and triggers n8n

### 8) Stop everything (when done)
1. Stop Node backend: `Ctrl+C` in `Terminal 2`.
2. Stop AI service: `Ctrl+C` in `Terminal 1`.
3. Stop Docker services:
```bash
cd "/Users/University/Final Project/aura"
docker compose down
```
4. Optional clean reset (deletes all DB data):
```bash
docker compose down -v
```

### 9) Quick Debug Matrix (very useful)
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
- If Docker is not running, open Docker Desktop and wait until it's fully started.
- If n8n keeps restarting, inspect logs:
  - `docker logs aura_n8n`
