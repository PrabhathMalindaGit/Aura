# n8n Telegram Setup (Aura)

This guide sets up Telegram notifications for the workflow:
`01 - Alert Created Webhook (Telegram)`

## 1) Create Telegram bot and get TELEGRAM_BOT_TOKEN
1. Open Telegram and chat with `@BotFather`.
2. Run `/newbot` and follow prompts.
3. BotFather returns a token like:
   `123456789:AA...`
4. Save this as `TELEGRAM_BOT_TOKEN`.

## 2) Get TELEGRAM_CLINICIAN_CHAT_ID
You can use either a group or a direct chat.

### Option A: Group chat (recommended)
1. Create a Telegram group for clinician alerts.
2. Add your bot to that group.
3. Send one message in the group (for example: `test`).
4. Open this URL in browser (replace token):
   `https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getUpdates`
5. Find `chat.id` from the latest update.
6. Save it as `TELEGRAM_CLINICIAN_CHAT_ID`.

## 3) Set environment variables for n8n
Use `/Users/University/Final Project/aura/n8n/.env.example` as a template.

Minimum variables:
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CLINICIAN_CHAT_ID`
- `AURA_API_BASE` (for future n8n -> backend calls)

Optional security variable for webhook:
- `N8N_WEBHOOK_API_KEY`

## 4) Docker on macOS note
If n8n runs in Docker and your Node API runs on host Mac, use:

`AURA_API_BASE=http://host.docker.internal:3000`

## 5) Acceptance tests

### Test 1: Telegram env vars NOT set
- Send POST to `/webhook/alert-created` with a new `alertId`.
- Expected behavior:
  - Inserts into Alerts table.
  - Responds with JSON:
    - `ok: true`
    - `saved: true`
    - `duplicate: false`
    - `rowId: <id>`
    - `telegramSent: false`
    - `telegramSkipped: true`

### Test 2: Telegram env vars set
- Set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CLINICIAN_CHAT_ID`.
- Send a new `alertId`.
- Expected behavior:
  - Inserts into Alerts table.
  - Attempts Telegram send.
  - Response includes `telegramSent` as `true` or `false` (if Telegram API fails).

### Test 3: Duplicate alertId
- Re-send same `alertId`.
- Expected behavior:
  - No new row insert.
  - No Telegram send.
  - JSON response:
    - `ok: true`
    - `saved: false`
    - `duplicate: true`
    - `rowId: <existingId>`
