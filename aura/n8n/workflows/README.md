# n8n Workflows

## Source of truth
- Canonical workflow exports for Aura are in `/Users/University/Final Project/aura/n8n/workflows/`.
- Legacy snapshots under `/Users/University/Final Project/aura/n8n_workflows/` are not the import target for active environments.

## Workflow Files
- `01 - Alert Created Webhook (POST → Dedupe → Table → Telegram → Respond).json`
  Receives `POST /webhook/alert-created`, deduplicates by `alertId`, writes new alerts to the Alerts Data Table, optionally sends Telegram, posts delivery status callback to Aura backend (`POST /events/notification-status`), and responds with JSON.
- `02 - List Alerts Proxy (GET → Aura API → Respond).json`
  Exposes `GET /webhook/alerts`, validates request context/auth rules, proxies to Aura backend clinician alerts endpoint, and returns JSON.
- `03 - Missed Check-in Follow-through (Cron → Aura Process → Telegram → Callback).json`
  Runs on a daily schedule, calls Aura internal missed-checkin processing, upserts follow-through tasks in backend, optionally sends Telegram follow-up summaries, and posts truthful automation status callbacks to Aura backend.
- `04 - Task Reminder Timing (Cron → Aura Process → Telegram → Callback).json`
  Runs several times per day, fetches patient-action task reminder candidates from Aura backend, optionally sends Telegram follow-up notices, and posts truthful automation status callbacks.
- `05 - Error Trigger → Telegram (throttled).json`
  Listens for n8n workflow errors, applies guard/throttling logic, and optionally sends compact error notifications to dev Telegram chat.
- `06 - Appointment Reminder and Status Follow-up (Cron → Aura Process → Telegram → Callback).json`
  Runs several times per day, fetches appointment reminder/follow-up candidates from Aura backend, upserts appointment follow-up tasks where needed, optionally sends Telegram notices, and posts truthful automation status callbacks.
- `07 - Daily Digest (Cron 09:00 → Aura Digest → Telegram → Callback).json`
  Runs daily at 09:00 Asia/Colombo, fetches a backend-built operational digest, optionally sends it to clinician Telegram chat, and posts truthful automation status callbacks.
- `08 - Communication No-Response Escalation (Cron → Aura Process → Telegram → Callback).json`
  Runs on a daily schedule, fetches unresolved communication escalation candidates from Aura backend, upserts follow-up tasks where needed, optionally sends Telegram notices, and posts truthful automation status callbacks.
- `09 - Alert Notification Processor (Cron every minute → Aura Internal Process).json`
  Runs every minute, calls Aura's internal alert-notification processing route (`POST /internal/n8n/alert-notifications/process`) with a bounded `{ "limit": 25 }` body, and relies on the backend `AlertNotificationJob` durable path for actual delivery work.
- `10 - Alert Notification Reconcile (Cron every 5 minutes → Aura Internal Reconcile).json`
  Runs every 5 minutes, calls Aura's internal alert-notification reconcile route (`POST /internal/n8n/alert-notifications/reconcile`) with a bounded `{ "limit": 25 }` body, and relies on the backend `AlertNotificationJob` durable path for stale callback recovery.
- `11 - Telegram Commands (／open ／ack ／resolve).json`
  Handles Telegram bot commands for clinician operations (`/open`, `/ack <alertId>`, `/resolve <alertId>`) with auth checks and backend API calls.

## Import Steps (n8n UI)
1. Open n8n in browser.
2. Go to **Workflows**.
3. Click **Import from File**.
4. Select one of the JSON files from `/Users/University/Final Project/aura/n8n/workflows/`.
5. After import, review credentials and environment variables, then activate the workflow.

## Local demo baseline
- Active for the current local demo workspace:
  - `01 - Alert Created Webhook (POST → Dedupe → Table → Telegram → Respond)`
  - `07 - Daily Digest (Cron 09:00 → Aura Digest → Telegram → Callback)`
- Imported as canonical follow-through drafts, but intentionally left inactive to avoid cron side effects until they are explicitly demoed:
  - `03 - Missed Check-in Follow-through (Cron → Aura Process → Telegram → Callback)`
  - `04 - Task Reminder Timing (Cron → Aura Process → Telegram → Callback)`
  - `06 - Appointment Reminder and Status Follow-up (Cron → Aura Process → Telegram → Callback)`
  - `08 - Communication No-Response Escalation (Cron → Aura Process → Telegram → Callback)`
- Imported as canonical alert-durability cadence workflows, but intentionally left inactive until this environment is explicitly chosen as the scheduler owner:
  - `09 - Alert Notification Processor (Cron every minute → Aura Internal Process)`
  - `10 - Alert Notification Reconcile (Cron every 5 minutes → Aura Internal Reconcile)`
- Legacy workflows that may still exist in a local workspace must remain inactive and should not be used for demos:
  - `LEGACY - 01 - Alert Created Webhook (old)`
  - `07 - Daily Digest (Cron 09:00 → Open alerts → Telegram)`

## Required environment
- `AURA_API_BASE=http://host.docker.internal:3000`
- `AURA_WEBHOOK_KEY` matching the Aura backend callback/internal route key
- `AURA_N8N_WEBHOOK_KEY` for backend-to-n8n `01 - Alert Created Webhook` ingress
- `AURA_N8N_API_KEY` for `02 - List Alerts Proxy`; this proxy fails closed when the key is unset or wrong
- `TELEGRAM_CLINICIAN_CHAT_ID`
  - Leave this as `CHANGE_ME` if you want the workflow to prove the callback path without attempting a real Telegram send
  - Set a real value only when you want to prove Telegram delivery

Direction of shared keys:
- Backend to n8n alert-created webhook: `x-aura-n8n-webhook-key: <AURA_N8N_WEBHOOK_KEY>`
- n8n to Aura backend callbacks/internal routes: `x-aura-webhook-key: <AURA_WEBHOOK_KEY>`
- External/manual callers to List Alerts Proxy: `x-api-key: <AURA_N8N_API_KEY>`

For self-hosted/free n8n, provide these as Docker Compose environment variables on the `n8n` service. Do not use paid n8n `$vars` for this local stack. When n8n runs in Docker on Mac and the backend runs on the host, use `AURA_API_BASE=http://host.docker.internal:3000`; the host backend can still call n8n at `N8N_WEBHOOK_ALERT=http://localhost:5678/webhook/alert-created`.

## Alert cadence activation
- Manual by default:
  - `09 - Alert Notification Processor (Cron every minute → Aura Internal Process)`
  - `10 - Alert Notification Reconcile (Cron every 5 minutes → Aura Internal Reconcile)`
- Activate these only in environments that should automatically own alert-notification processing and reconciliation.
- One active scheduler owner per environment:
  - do not activate these workflows in multiple n8n instances against the same Aura backend environment
  - the backend durable job model already protects individual job claims, but the safest operational model is still one active scheduler owner
- Required environment for the cadence workflows:
  - `AURA_API_BASE`
  - `AURA_WEBHOOK_KEY`
- Scheduled request bodies stay intentionally minimal:
  - processor sends `{ "limit": 25 }`
  - reconciler sends `{ "limit": 25 }`
  - neither scheduled workflow sends `force: true` or `now`
- If n8n is down:
  - alert delivery and reconciliation cadence pauses
  - `AlertNotificationJob` state remains durable in Mongo
  - jobs resume when the scheduler owner comes back, and legacy alerts can still recover through the manual retry path

## Recommended local demo workflow
- Use `07 - Daily Digest (Cron 09:00 → Aura Digest → Telegram → Callback)` for the cleanest local follow-through demo.
- Why this one:
  - it is backend-driven
  - it has a clear success/fallback path
  - it can prove truthful callback behavior even when Telegram is intentionally not configured

### Daily digest demo runbook
1. Confirm the backend is running on `http://localhost:3000`.
2. Confirm the n8n container has:
   - `AURA_API_BASE=http://host.docker.internal:3000`
   - `AURA_WEBHOOK_KEY` set
   - Telegram credentials/chat IDs configured only if this is a later provider-proof run
3. Open the workflow named `07 - Daily Digest (Cron 09:00 → Aura Digest → Telegram → Callback)` in the n8n UI.
4. Use **Execute workflow** from the n8n UI.
   - Do not rely on `docker exec aura_n8n n8n execute ...` for this workflow in the local demo container; one-off CLI execution can fail because the task-broker port is already bound.
5. Expected result when Telegram is still `CHANGE_ME`:
   - the workflow reaches `HTTP Process`
   - `Build Batch Message` receives at least one digest item when seeded demo data is present
   - `Telegram configured?` routes to the skipped branch
   - `Post Skipped Automation Status` succeeds
6. Expected result when Telegram is configured:
   - the workflow reaches `Telegram Send Message`
   - `Post Automation Status` records `sent` or `failed` truthfully
7. Backend proof:
   - `POST /internal/n8n/follow-through/digest/process` should return digest items
   - `POST /events/automation-status` should write an `AUTOMATION_STATUS` `CareEvent`
   - if Telegram is not configured, the callback status should be `skipped` with `TELEGRAM_NOT_CONFIGURED`

## Note
Filenames are for git organization; n8n uses the internal workflow name after import.

## Callback verification
Run this check after workflow export updates:

```bash
cd "/Users/University/Final Project/aura"
rg -n "/events/notification-status" "n8n/workflows/01 - Alert Created Webhook (POST → Dedupe → Table → Telegram → Respond).json"
rg -n "/events/automation-status|/internal/n8n/follow-through/" n8n/workflows/*.json
rg -n "/internal/n8n/alert-notifications/process|/internal/n8n/alert-notifications/reconcile" n8n/workflows/*.json
```
