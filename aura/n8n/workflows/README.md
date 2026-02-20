# n8n Workflows

## Workflow Files
- `01 - Alert Created Webhook (POST → Dedupe → Table → Telegram → Respond).json`
  Receives `POST /webhook/alert-created`, deduplicates by `alertId`, writes new alerts to the Alerts Data Table, optionally sends Telegram, and responds with JSON.
- `02 - List Alerts Proxy (GET → Aura API → Respond).json`
  Exposes `GET /webhook/alerts`, validates request context/auth rules, proxies to Aura backend clinician alerts endpoint, and returns JSON.
- `05 - Error Trigger → Telegram (throttled).json`
  Listens for n8n workflow errors, applies guard/throttling logic, and optionally sends compact error notifications to dev Telegram chat.
- `07 - Daily Digest (Cron 09:00 → Open alerts → Telegram).json`
  Runs daily at 09:00 Asia/Colombo, fetches open alerts, builds digest text, and optionally sends to clinician Telegram chat.
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
