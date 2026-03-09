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
- `11 - Telegram Commands (／open ／ack ／resolve).json`
  Handles Telegram bot commands for clinician operations (`/open`, `/ack <alertId>`, `/resolve <alertId>`) with auth checks and backend API calls.

## Import Steps (n8n UI)
1. Open n8n in browser.
2. Go to **Workflows**.
3. Click **Import from File**.
4. Select one of the JSON files from `/Users/University/Final Project/aura/n8n/workflows/`.
5. After import, review credentials and environment variables, then activate the workflow.

## Note
Filenames are for git organization; n8n uses the internal workflow name after import.

## Callback verification
Run this check after workflow export updates:

```bash
cd "/Users/University/Final Project/aura"
rg -n "/events/notification-status" "n8n/workflows/01 - Alert Created Webhook (POST → Dedupe → Table → Telegram → Respond).json"
rg -n "/events/automation-status|/internal/n8n/follow-through/" n8n/workflows/*.json
```
