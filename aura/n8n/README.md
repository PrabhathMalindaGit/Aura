# Aura n8n Setup

This file keeps the click-by-click setup for the alert-created workflow.

For the current canonical workflow suite, use:
- `/Users/University/Final Project/aura/n8n/workflows/README.md`

Current follow-through automation exports include:
- `01 - Alert Created Webhook`
- `03 - Missed Check-in Follow-through`
- `04 - Task Reminder Timing`
- `06 - Appointment Reminder and Status Follow-up`
- `07 - Daily Digest`
- `08 - Communication No-Response Escalation`

If a local n8n workspace already contains older imported workflows, treat the JSON exports in `/Users/University/Final Project/aura/n8n/workflows/` as the source of truth and clean up legacy live imports manually before a final demo.

## Workflow 01 setup guide

## Canonical export path
- Canonical workflow JSON exports are maintained in:
  - `/Users/University/Final Project/aura/n8n/workflows/`
- Legacy snapshots in `/Users/University/Final Project/aura/n8n_workflows/` are reference-only and should not be used for active imports.

## What this workflow does
This first n8n workflow receives `ALERT_CREATED` events from your Aura Node backend, immediately returns HTTP `200` so the backend knows the webhook was received, and makes the full payload easy to inspect inside n8n Executions for debugging and verification.

## Prerequisites
- Docker is running.
- n8n UI is reachable at `http://localhost:5678`.
- Node backend is running at `http://localhost:3000`.
- Set `AURA_N8N_WEBHOOK_KEY` in both the Aura server and n8n environment for backend-to-n8n `alert-created` ingress.
- Set `AURA_WEBHOOK_KEY` in both the Aura server and n8n environment for n8n-to-backend callback/internal API calls.
- If n8n runs in Docker on a Mac and the backend runs on the host, set `AURA_API_BASE=http://host.docker.internal:3000` for n8n-to-backend calls.

## Internal n8n API endpoints (webhook-key secured)
For alert list/ack/resolve automation, workflows should call these endpoints instead of `/clinician/*`:

- `GET /internal/n8n/alerts?status=open|acknowledged|resolved&limit=50`
- `PATCH /internal/n8n/alerts/:id` with body `{ "status": "acknowledged" | "resolved" }`

Required header on every request:

- `x-aura-webhook-key: <AURA_WEBHOOK_KEY>`

Notes:
- These endpoints are intended for service-to-service automation only.
- They do not accept clinician identity parameters.

## Step-by-step: Create the workflow (click-by-click)
1. Open your browser and go to `http://localhost:5678`.
2. On the n8n home screen, click `New Workflow` (or `Create Workflow`, depending on version).
3. At the top-left title area, rename the workflow to: `01 - Alert Created Webhook`.
4. Click the `+` button to add your first node.
5. Search for `Webhook` and select it.
6. Configure the `Webhook` node:
   - `HTTP Method`: `POST`
   - `Path`: `alert-created`
   - `Response Mode`: `On Received` (or keep the equivalent default that responds immediately)
7. In the Webhook node panel, find both URLs shown by n8n:
   - `Test URL` (usually includes `/webhook-test/`)
   - `Production URL` (usually includes `/webhook/`)
8. Click `Listen for Test Event` in the Webhook node and keep that node waiting.
9. Add a second node by clicking the `+` on the Webhook node output.
10. Search for and add a `Set` node.
11. In the `Set` node, add fields for easier viewing of incoming payload:
    - `eventType` = `{{$json.type}}`
    - `patientId` = `{{$json.patientId}}`
    - `alertId` = `{{$json.alertId}}`
    - `risk` = `{{$json.risk}}`
    - `reasons` = `{{$json.reason}}`
    - `timestamp` = `{{$json.timestamp}}`
12. Add a third node from the Set node output: `Respond to Webhook`.
13. Configure `Respond to Webhook`:
    - `Response Code`: `200`
    - `Response Format`: `JSON` (if shown)
    - `Response Body`: `{ "ok": true }`
    - Add header `Content-Type: application/json` if your n8n version shows a response headers option.
14. Confirm node connections are exactly:
    - `Webhook -> Set -> Respond to Webhook`
15. Click `Save`.
16. Important Active toggle behavior:
    - If workflow is `Inactive`, test mode is commonly required and only Test URL may work.
    - If workflow is `Active`, Production URL works reliably for backend integrations.
17. Turn the workflow `Active` using the toggle in the top-right.

## How to find the webhook URL
- Open the `Webhook` node.
- You will see:
  - `Test URL`: used while `Listen for Test Event` is active.
  - `Production URL`: used by real app/backend calls.
- Use the `Production URL` in your backend `.env`, not the test URL.
- Backend env value should be:

```env
N8N_WEBHOOK_ALERT=http://localhost:5678/webhook/alert-created
AURA_N8N_WEBHOOK_KEY=<same value configured in the n8n container>
```

When the backend runs on the host Mac and n8n exposes port `5678`, the backend-to-n8n webhook URL can stay `http://localhost:5678/webhook/alert-created`. Inside the n8n Docker container, calls back to the host backend should use `AURA_API_BASE=http://host.docker.internal:3000`.

## Testing the workflow (3 methods)
### A) Quick curl test (recommended)
Use this from Terminal:

```bash
curl -X POST http://localhost:5678/webhook/alert-created \
  -H "Content-Type: application/json" \
  -H "x-aura-n8n-webhook-key: <AURA_N8N_WEBHOOK_KEY>" \
  -d '{
    "type": "ALERT_CREATED",
    "patientId": "p1",
    "alertId": "65f0aa11bb22cc33dd44ee55",
    "risk": "high",
    "reason": ["PAIN_GE_THRESHOLD", "CRISIS_LANGUAGE"],
    "timestamp": "2026-02-18T12:00:00.000Z"
  }'
```

Expected response:

```json
{"ok":true}
```

### B) Test from Node backend (recommended)
1. Start Node backend:

```bash
cd "/Users/University/Final Project/aura/server"
npm run dev
```

2. Send a high-risk check-in (pain 8):

```bash
curl -X POST http://localhost:3000/checkins \
  -H "Content-Type: application/json" \
  -d '{"patientId":"p1","date":"2026-02-18","mood":2,"pain":8,"adherence":{"exercises":0.3,"medication":false},"notes":"Pain is getting worse"}'
```

3. Send a high-risk chat (crisis keyword):

```bash
curl -X POST http://localhost:3000/chat/send \
  -H "Content-Type: application/json" \
  -d '{"patientId":"p1","text":"I cant breathe"}'
```

4. Backend behavior:
- It creates an alert.
- It POSTs to `N8N_WEBHOOK_ALERT` automatically.
- It returns JSON including `n8nDelivered`.

### C) Test from n8n UI (manual)
- Browser-only check (not ideal):
  - If you open `http://localhost:5678/webhook/alert-created` directly in the browser address bar, the browser sends `GET`, not `POST`.
  - You will likely see `404` or `405`, which is expected for this webhook setup.
  - Use this only as a quick reachability check, not as a real webhook test.
- You can click `Execute workflow` in some contexts, but webhook workflows still need an external HTTP request to trigger realistic input.
- For webhook testing, the reliable flow is:
  - Click `Listen for Test Event` in Webhook node.
  - Send a request from curl or your backend.

## How to confirm it worked (Executions view)
1. In n8n left sidebar, click `Executions`.
2. Open the newest successful execution.
3. Click the `Webhook` node in execution details:
   - Confirm incoming JSON payload fields (`type`, `patientId`, `alertId`, `risk`, `reason`, `timestamp`).
4. Click the `Set` node:
   - Confirm renamed/output fields (`eventType`, `patientId`, `alertId`, `risk`, `reasons`, `timestamp`).
5. Click `Respond to Webhook`:
   - Confirm status code `200` and response body `{ "ok": true }`.

## Common problems + fixes
- `404 Not Found`
  - Wrong URL path. Must be exactly `/webhook/alert-created` for production.
- `405 Method Not Allowed`
  - Request is not `POST`. Fix HTTP method.
- No execution appears
  - Workflow may be inactive, or you are using Test URL incorrectly without `Listen for Test Event` running.
- `Connection refused`
  - n8n is not running or port `5678` is unavailable.
- Backend shows `n8nDelivered: false`
  - Webhook URL is wrong, workflow is inactive, or n8n is down.
- Response body is not JSON
  - Ensure `Respond to Webhook` node is set to JSON body `{ "ok": true }`.

## Security note
Workflow `01 - Alert Created Webhook` rejects requests unless `x-aura-n8n-webhook-key` matches `AURA_N8N_WEBHOOK_KEY` configured in the n8n container. Workflow `02 - List Alerts Proxy` rejects requests unless `x-api-key` matches `AURA_N8N_API_KEY`; an unset proxy key is not an allow-all mode. Do not expose a local n8n instance publicly.

## Notification status callback (required for truthful delivery state)
After Telegram send in workflow `01 - Alert Created Webhook`, post delivery status back to Aura backend:

- Endpoint: `POST <AURA_API_BASE>/events/notification-status`
- Header: `x-aura-webhook-key: <AURA_WEBHOOK_KEY>`
- Content-Type: `application/json`

Success branch payload example:
```json
{
  "alertId": "65f0aa11bb22cc33dd44ee55",
  "patientId": "p1",
  "channel": "telegram",
  "status": "sent",
  "timestamp": "2026-02-23T10:00:00.000Z",
  "providerMessageId": "123456",
  "target": "telegram:clinician-group"
}
```

Failure branch payload example:
```json
{
  "alertId": "65f0aa11bb22cc33dd44ee55",
  "patientId": "p1",
  "channel": "telegram",
  "status": "failed",
  "timestamp": "2026-02-23T10:00:05.000Z",
  "error": "TELEGRAM_DELIVERY_FAILED"
}
```

Notes:
- Backend accepts `messageId` and `providerMessageId` (either is fine).
- Backend accepts `timestamp` (preferred) and `attemptedAt` as timestamp fallback.
- Do not send chat text/check-in notes in callback payloads.

## Final local Telegram runtime evidence

The server package includes a final-evidence verifier for the local/demo high-risk alert chain. It is not a CI command because it can send a real Telegram message through the configured n8n bot credential.

Required local services and setup:
- MongoDB, Aura backend, AI/Safety Router path, local n8n, imported/active workflow `01`, seeded demo data, and Telegram credentials/chat ID configured in n8n.
- Required verifier environment variables: `AURA_VERIFY_API_BASE_URL`, `AURA_VERIFY_N8N_BASE_URL`, `MONGO_URL`, `AURA_VERIFY_PATIENT_ACCESS_CODE`, `AURA_VERIFY_CLINICIAN_EMAIL`, and `AURA_VERIFY_CLINICIAN_PASSWORD`.

Run from `/Users/University/Final Project/aura/server`:

```bash
AURA_VERIFY_API_BASE_URL=http://127.0.0.1:3000 \
AURA_VERIFY_N8N_BASE_URL=http://127.0.0.1:5678 \
MONGO_URL=mongodb://127.0.0.1:27017/aura \
AURA_VERIFY_PATIENT_ACCESS_CODE=P1-DEMO \
AURA_VERIFY_CLINICIAN_EMAIL=clinician1@example.com \
AURA_VERIFY_CLINICIAN_PASSWORD=devpass123 \
npm run verify:n8n:telegram-runtime
```

The command writes redacted markdown evidence under `docs/evidence/`. A manual Telegram chat screenshot is still recommended for appendix evidence.

## Final local workflow-suite evidence

The server package also includes local/demo final-evidence tooling for the seven canonical Aura n8n workflows. It is not a CI command because safe runtime mode touches local workflow/backend state, and provider-send mode can send Telegram messages when explicitly enabled.

Static-only mode requires no Docker/services:

```bash
cd "/Users/University/Final Project/aura/server"
AURA_VERIFY_N8N_STATIC_ONLY=true npm run verify:n8n:workflows
```

Safe runtime mode requires MongoDB, Aura backend, and n8n:

```bash
cd "/Users/University/Final Project/aura/server"
AURA_VERIFY_API_BASE_URL=http://127.0.0.1:3000 \
AURA_VERIFY_N8N_BASE_URL=http://127.0.0.1:5678 \
MONGO_URL=mongodb://127.0.0.1:27017/aura \
AURA_WEBHOOK_KEY=<local backend callback key> \
AURA_N8N_API_KEY=<local n8n list proxy key> \
npm run verify:n8n:workflows
```

Provider-send mode must be explicitly enabled and requires imported/active workflows plus local/demo Telegram credentials in n8n:

```bash
AURA_VERIFY_ALLOW_PROVIDER_SEND=true npm run verify:n8n:workflows
```

The workflow-suite verifier writes redacted markdown evidence under `docs/evidence/`. Manual n8n, dashboard, and Telegram screenshots are still recommended for appendix evidence.

## Next steps (do not implement now)
- Finish Telegram runtime/provider proof after credentials and chat IDs are configured across required workflows.
- Configure the existing `AURA Rehab alerts` bot in n8n Credentials and set the required Telegram chat ID environment variables.
- Add conditional paths based on reason (`PAIN_GE_THRESHOLD` vs `CRISIS_LANGUAGE`).
