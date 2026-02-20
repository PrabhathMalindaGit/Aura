# n8n Workflow Pack Notes

## Import workflows into n8n
1. Open n8n UI at `http://localhost:5678`.
2. Go to `Workflows`.
3. Click `Import from file`.
4. Select JSON files from `/Users/University/Final Project/aura/n8n/workflows/`.
5. After import, open each workflow and save once.
6. Activate workflows you want running.

## Required n8n container environment variables
Set these on the `n8n` service in Docker Compose:
- `AURA_API_BASE`
- `TELEGRAM_CLINICIAN_CHAT_ID`
- `TELEGRAM_DEV_CHAT_ID`

Recommended local defaults:
- `AURA_API_BASE=http://host.docker.internal:3000`
- `TELEGRAM_CLINICIAN_CHAT_ID=CHANGE_ME`
- `TELEGRAM_DEV_CHAT_ID=CHANGE_ME`

## Telegram credentials
- Configure Telegram credentials in n8n UI under `Credentials`.
- Do not store bot tokens or credential IDs in Git.
- The workflow JSON files intentionally leave Telegram credentials unbound so you can select credentials after import.

## Docker on macOS note
When n8n runs in Docker on Mac, use:
- `http://host.docker.internal:3000`
for calls from n8n container to your backend running on the host machine.
