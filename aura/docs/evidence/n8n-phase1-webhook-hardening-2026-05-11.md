# n8n Phase 1 Webhook Hardening Evidence - 2026-05-11

## Purpose

This evidence records Phase 1 static/local hardening work for Aura n8n webhook configuration. It is not production deployment proof, clinical validation, n8n activation proof, or live provider delivery proof.

## Findings Addressed

- AUR-002: `01 - Alert Created Webhook` now has fail-closed inbound shared-header validation before Data Table, Telegram, callback, or success-response branches.
- AUR-003: `02 - List Alerts Proxy` now requires configured `AURA_N8N_API_KEY` and a matching caller `x-api-key`; an unset key is unauthorized.
- AUR-004: Workflow 01 notification callback URL and callback key now come from n8n environment values instead of hard-coded local callback URL/key literals.
- AUR-013: Telegram provider delivery remains a later runtime/provider proof task. The `AURA Rehab alerts` bot exists, but credentials/chat IDs still need to be configured across required workflows before live delivery can be claimed.

## Files Changed

- `server/src/env.ts`
- `server/src/services/n8n.ts`
- `server/tests/env.security.test.ts`
- `server/tests/n8n.service.test.ts`
- `server/tests/n8n.workflow-security.test.ts`
- `n8n/workflows/01 - Alert Created Webhook (POST → Dedupe → Table → Telegram → Respond).json`
- `n8n/workflows/02 - List Alerts Proxy (GET → Aura API → Respond).json`
- `docker-compose.yml`
- `.env.example`
- `n8n/.env.example`
- `n8n/README.md`
- `n8n/workflows/README.md`
- `n8n/SETUP_TELEGRAM.md`
- `n8n/notes/README.md`

## Configuration Approach

- Backend-to-n8n alert-created ingress uses `AURA_N8N_WEBHOOK_KEY` sent as `x-aura-n8n-webhook-key`.
- n8n-to-backend callback/internal API calls continue to use `AURA_WEBHOOK_KEY` sent as `x-aura-webhook-key`.
- List Alerts Proxy caller access uses `AURA_N8N_API_KEY` sent as `x-api-key`.
- Self-hosted/free n8n receives these values through Docker Compose environment variables on the `n8n` service; this phase does not rely on paid n8n `$vars`.
- For local Mac Docker, n8n-to-backend calls use `AURA_API_BASE=http://host.docker.internal:3000`.
- When the backend runs on the host Mac and n8n exposes port 5678, backend-to-n8n can still use `N8N_WEBHOOK_ALERT=http://localhost:5678/webhook/alert-created`.
- No real Telegram bot token or real chat ID was added to Git.

## Verification Commands And Observed Results

From `/Users/University/Final Project/aura/server`:

```bash
npm test -- n8n.service.test.ts env.security.test.ts n8n.workflow-security.test.ts
```

Observed result:

- Exit code: 0
- `Test Files  3 passed (3)`
- `Tests  17 passed (17)`

```bash
npm run build
```

Observed result:

- Exit code: 0
- `tsc -p tsconfig.json`

From `/Users/University/Final Project/aura`:

```bash
jq empty "n8n/workflows/01 - Alert Created Webhook (POST → Dedupe → Table → Telegram → Respond).json"
jq empty "n8n/workflows/02 - List Alerts Proxy (GET → Aura API → Respond).json"
```

Observed result:

- Exit code: 0 for both commands
- No output; both workflow JSON files parsed successfully.

```bash
rg -n "dev_aura_webhook_key|http://localhost:3000/events/notification-status|http://host.docker.internal:3000/events/notification-status" \
  "n8n/workflows/01 - Alert Created Webhook (POST → Dedupe → Table → Telegram → Respond).json"
```

Observed result:

- Exit code: 1
- No matches found.

```bash
rg -n "AURA_N8N_WEBHOOK_KEY|x-aura-n8n-webhook-key|AURA_API_BASE|AURA_WEBHOOK_KEY" \
  "n8n/workflows/01 - Alert Created Webhook (POST → Dedupe → Table → Telegram → Respond).json"
```

Observed result:

- Exit code: 0
- Matches found for inbound `AURA_N8N_WEBHOOK_KEY` / `x-aura-n8n-webhook-key`, callback `AURA_API_BASE`, and callback `AURA_WEBHOOK_KEY`.

```bash
rg -n "AURA_N8N_API_KEY|x-api-key" \
  "n8n/workflows/02 - List Alerts Proxy (GET → Aura API → Respond).json"
```

Observed result:

- Exit code: 0
- Matches found in the List Alerts Proxy normalization/auth code.

```bash
rg -n "N8N_WEBHOOK_API_KEY|TELEGRAM_BOT_TOKEN|api.telegram.org/bot" n8n/workflows docker-compose.yml .env.example n8n/.env.example
```

Observed result:

- Exit code: 1
- No matches found.

## Telegram Status

- Telegram bot exists: `AURA Rehab alerts`.
- Telegram credentials and chat IDs still need later runtime setup in n8n Credentials UI / local secret storage and Docker environment.
- Phase 1 did not perform live Telegram testing.
- Final-project wording must not claim Telegram provider delivery is fully configured or verified until Phase 5 provider proof is completed.

## Limitations

- No Docker, n8n, MongoDB, backend dev server, AI service, or Telegram/provider workflow was started.
- No n8n workflow was imported or activated.
- No Telegram/provider notification was triggered.
- No production deployment proof was performed.
- No clinical validation was performed.
- This is static/local hardening evidence only.
