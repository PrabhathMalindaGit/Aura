# n8n Published Workflow Drift Check - 2026-05-13

Scope: local Aura prototype/demo n8n workspace at `http://localhost:5678`.

This evidence is for local demo automation hardening only. It is not production notification validation.

## Published workflows checked

| Workflow | Live state after check | Result |
| --- | --- | --- |
| `01 - Alert Created Webhook (POST -> Dedupe -> Table -> Telegram -> Respond)` | Published | Fixed and verified fail-closed auth rejection |
| `02 - List Alerts Proxy (GET -> Aura API -> Respond)` | Published | Fixed and verified fail-closed auth rejection plus authorized proxy reachability |
| `03 - Missed Check-in Follow-through (Cron -> Aura Process -> Telegram -> Callback)` | Published | Re-checked structurally; no drift found |
| `07 - Daily Digest (Cron 09:00 -> Aura Digest -> Telegram -> Callback)` | Published | Drift fixed and re-checked structurally |

## Environment checks

- n8n container env was checked with redaction.
- `AURA_API_BASE` was present as `http://host.docker.internal:3000`.
- `AURA_WEBHOOK_KEY`, `AURA_N8N_WEBHOOK_KEY`, `AURA_N8N_API_KEY`, `TELEGRAM_CLINICIAN_CHAT_ID`, and `TELEGRAM_DEV_CHAT_ID` were present and non-empty.
- `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` was added for the local n8n container because the published Aura workflows use `$env` inside Code nodes for local auth and Telegram guard checks.
- Backend health check returned `{"status":"ok"}`.

## Drift and fixes

### Workflow 01

Drift found:
- Inbound webhook auth validation was missing from the active live workflow.
- Telegram notification path used a hard-coded chat ID.
- Telegram enabled guard was forced on instead of checking configured env.
- Callback URL and `x-aura-webhook-key` used stale hard-coded local values.

Fixes made:
- Restored env-based inbound validation with `$env.AURA_N8N_WEBHOOK_KEY`.
- Restored fail-closed unauthorized branch.
- Changed unauthorized response body to literal JSON so n8n returns a reliable `401`.
- Restored Telegram chat ID expression `{{$env.TELEGRAM_CLINICIAN_CHAT_ID}}`.
- Preserved the existing `Telegram account` credential.
- Restored callback URL/header expressions using `$env.AURA_API_BASE` and `$env.AURA_WEBHOOK_KEY`.

### Workflow 02

Drift found:
- API key guard could fail open in the live workflow.
- Backend call used the older `/clinician/alerts` route.

Fixes made:
- Restored fail-closed `x-api-key` validation against `$env.AURA_N8N_API_KEY`.
- Changed unauthorized response body to literal JSON so n8n returns a reliable `401`.
- Restored backend call to `/internal/n8n/alerts`.
- Restored backend callback header using `$env.AURA_WEBHOOK_KEY`.

### Workflow 03

Drift found:
- No live drift requiring workflow changes.

Verified:
- Telegram send node uses `Telegram account`.
- Telegram chat ID uses `{{$env.TELEGRAM_CLINICIAN_CHAT_ID}}`.
- Backend URL/header use env expressions.
- No hard-coded callback key or numeric Telegram chat ID was found in the active Telegram field.

### Workflow 07

Drift found:
- Telegram chat ID was hard-coded.
- Telegram configured guard was forced on.
- Backend URL/header used stale hard-coded local values.

Fixes made:
- Restored canonical Aura Digest workflow definition.
- Restored env-based backend URL/header.
- Restored env-based Telegram chat ID and configured guard.
- Preserved the existing `Telegram account` credential.

## Verification results

- Recreated n8n after workflow import/publish so active workflows reloaded.
- Re-exported live workflows after changes to `/tmp/aura-live-post-fix-final.json` inside the n8n container and `/private/tmp/aura-live-post-fix-final.json` on the host.
- Workflow 01 unauthorized probe returned `401` with `{"ok":false,"error":"UNAUTHORIZED"}`.
- Workflow 02 unauthorized probe returned `401` with `{"ok":false,"error":"UNAUTHORIZED"}`.
- Workflow 02 authorized probe returned HTTP `200`; response body was not printed because it may contain alert data.
- Workflows 03 and 07 were not manually executed because they can send Telegram messages when eligible items exist.

## Screenshots and evidence artifacts

- No UI screenshots were captured in this pass.
- Evidence used: redacted env command output, backend health output, live n8n exports, workflow structural checks, and redacted webhook probe results.
- No Telegram bot token or real chat ID is included in this file.

## Workflows intentionally not published

- `04 - Task Reminder Timing` remains unpublished pending separate validation.
- `06 - Appointment Reminder and Status Follow-up` remains unpublished pending separate validation.
- `08 - Communication No-Response Escalation` remains unpublished pending separate validation.
- `07 - Daily Digest (Cron 09:00 -> Open alerts -> Telegram)` remains unpublished as the old duplicate digest.
- `05 - Error Trigger -> Telegram (throttled)` remains unpublished as optional/test monitoring.
- `11 - Telegram Commands (/open /ack /resolve)` remains unpublished pending separate state-change safety review.

## Remaining risks and limitations

- n8n Code nodes need local env access for the current workflow design. This is acceptable for the local demo container but should be revisited before any production deployment.
- Workflow 03 and 07 were structurally verified but not executed to avoid sending Telegram messages.
- Workflow 04, 06, and 08 should be validated after this published-workflow drift fix, then published only if their runtime checks pass.
