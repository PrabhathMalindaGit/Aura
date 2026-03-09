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
- Set `AURA_WEBHOOK_KEY` in both Aura server and n8n environment.

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
```

## Testing the workflow (3 methods)
### A) Quick curl test (recommended)
Use this from Terminal:

```bash
curl -X POST http://localhost:5678/webhook/alert-created \
  -H "Content-Type: application/json" \
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
This guide is for local development only. Later, protect n8n with authentication and do not expose your localhost n8n instance publicly.

## Notification status callback (required for truthful delivery state)
After Telegram send in workflow `01 - Alert Created Webhook`, post delivery status back to Aura backend:

- Endpoint: `POST http://localhost:3000/events/notification-status`
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

## Next steps (do not implement now)
- Add Email/Slack/Telegram notification nodes.
- Add a backend writeback call to store additional `care_events` metadata.
- Add conditional paths based on reason (`PAIN_GE_THRESHOLD` vs `CRISIS_LANGUAGE`).
