# n8n Provider-Send All Workflows - 2026-05-13

## Purpose

This evidence records local/demo runtime verification for the Aura n8n workflow suite. It uses synthetic/demo data only and is intended for final report evidence.

This is local/demo provider-send verification only. It is not production readiness evidence, production notification reliability evidence, clinical validation, real patient validation, or proof that a clinician read or acted on a message.

## Run Metadata

- Status: FAIL
- Timestamp: 2026-05-13T19:27:41.816Z
- Run ID: 9e30c460-fa45-49e7-a003-7e427a36ff2b
- Synthetic marker: `aura-n8n-provider-send-all:9e30c460-fa45-49e7-a003-7e427a36ff2b`
- Command used: `npm run verify:n8n:workflows`
- Mode: provider-send-all
- Required services: MongoDB, Aura backend, local n8n, imported/active workflows, AI/Safety Router path for Workflow 01, configured local/demo Telegram credentials/chat ID in n8n, and manual n8n Execute Workflow runs for workflows 03, 04, 06, 07, and 08.
- Provider-send gate status: enabled

- Provider-send-all gate status: enabled
- Manual wait seconds: 900
- Workflow 07 digest dedupe reset flag: enabled


## Static Workflow Validation Summary

- PASS: 01 - Alert Created Webhook (POST → Dedupe → Table → Telegram → Respond)
  - [x] Workflow export exists: n8n/workflows/01 - Alert Created Webhook (POST → Dedupe → Table → Telegram → Respond).json
  - [x] Workflow JSON parses: /Users/University/Final Project/aura/n8n/workflows/01 - Alert Created Webhook (POST → Dedupe → Table → Telegram → Respond).json
  - [x] Expected workflow name exists: 01 - Alert Created Webhook (POST → Dedupe → Table → Telegram → Respond)
  - [x] Expected POST webhook path exists: alert-created
  - [x] Expected Aura backend endpoint reference exists: /events/notification-status
  - [x] Required node exists: Webhook: Webhook
  - [x] Required node exists: Validate Inbound Webhook Key: Validate Inbound Webhook Key
  - [x] Required node exists: Authorized?: Authorized?
  - [x] Required node exists: Get existing alert: Get existing alert
  - [x] Required node exists: Insert row: Insert row
  - [x] Required node exists: Telegram Send Alert: Telegram Send Alert
  - [x] Required node exists: Post Notification Status: Post Notification Status
  - [x] Callback/internal request uses AURA_WEBHOOK_KEY: x-aura-webhook-key must be env-based
  - [x] Inbound validation references AURA_N8N_WEBHOOK_KEY: backend-to-n8n ingress must fail closed
  - [x] Unauthorized/fail-closed branch exists: unauthorized branch nodes must exist
  - [x] Telegram node or branch exists: 1 Telegram node(s)
  - [x] Telegram chat ID is env-based through TELEGRAM_CLINICIAN_CHAT_ID: Telegram chat target must not be hardcoded
  - [x] Skipped Telegram branch exists: safe no-provider path must exist
  - [x] Callback node posts to /events/notification-status: /events/notification-status
  - [x] No Telegram bot token literal is embedded: workflow export must not include bot-token-shaped values
  - [x] No api.telegram.org bot-token URL is embedded: workflow export must not include Telegram bot URLs
  - [x] No hardcoded Authorization/header secret literal is embedded: secret-like header values must come from env/credentials
- PASS: 02 - List Alerts Proxy (GET → Aura API → Respond)
  - [x] Workflow export exists: n8n/workflows/02 - List Alerts Proxy (GET → Aura API → Respond).json
  - [x] Workflow JSON parses: /Users/University/Final Project/aura/n8n/workflows/02 - List Alerts Proxy (GET → Aura API → Respond).json
  - [x] Expected workflow name exists: 02 - List Alerts Proxy (GET → Aura API → Respond)
  - [x] Expected GET webhook path exists: alerts
  - [x] Expected Aura backend endpoint reference exists: /internal/n8n/alerts
  - [x] Required node exists: Webhook: Webhook
  - [x] Required node exists: Normalize Request: Normalize Request
  - [x] Required node exists: Authorized?: Authorized?
  - [x] Required node exists: HTTP Request: HTTP Request
  - [x] Required node exists: Respond Success: Respond Success
  - [x] Required node exists: Respond Backend Error: Respond Backend Error
  - [x] Callback/internal request uses AURA_WEBHOOK_KEY: x-aura-webhook-key must be env-based
  - [x] Proxy validation references AURA_N8N_API_KEY: list proxy must fail closed
  - [x] Unauthorized/fail-closed branch exists: unauthorized branch nodes must exist
  - [x] No Telegram bot token literal is embedded: workflow export must not include bot-token-shaped values
  - [x] No api.telegram.org bot-token URL is embedded: workflow export must not include Telegram bot URLs
  - [x] No hardcoded Authorization/header secret literal is embedded: secret-like header values must come from env/credentials
- PASS: 03 - Missed Check-in Follow-through (Cron → Aura Process → Telegram → Callback)
  - [x] Workflow export exists: n8n/workflows/03 - Missed Check-in Follow-through (Cron → Aura Process → Telegram → Callback).json
  - [x] Workflow JSON parses: /Users/University/Final Project/aura/n8n/workflows/03 - Missed Check-in Follow-through (Cron → Aura Process → Telegram → Callback).json
  - [x] Expected workflow name exists: 03 - Missed Check-in Follow-through (Cron → Aura Process → Telegram → Callback)
  - [x] Expected cron trigger exists: n8n-nodes-base.cron
  - [x] Cron trigger includes 08:00: [{"hour":8,"minute":0}]
  - [x] Expected Aura backend endpoint reference exists: /internal/n8n/follow-through/missed-checkins/process
  - [x] Required node exists: Cron: Cron
  - [x] Required node exists: HTTP Process: HTTP Process
  - [x] Required node exists: Build Batch Message: Build Batch Message
  - [x] Required node exists: Telegram configured?: Telegram configured?
  - [x] Required node exists: Telegram Send Message: Telegram Send Message
  - [x] Required node exists: Build Skipped Callback Payload: Build Skipped Callback Payload
  - [x] Required node exists: Post Automation Status: Post Automation Status
  - [x] Required node exists: Post Skipped Automation Status: Post Skipped Automation Status
  - [x] Callback/internal request uses AURA_WEBHOOK_KEY: x-aura-webhook-key must be env-based
  - [x] Telegram node or branch exists: 1 Telegram node(s)
  - [x] Telegram chat ID is env-based through TELEGRAM_CLINICIAN_CHAT_ID: Telegram chat target must not be hardcoded
  - [x] Skipped Telegram branch exists: safe no-provider path must exist
  - [x] Callback node posts to /events/automation-status: /events/automation-status
  - [x] No Telegram bot token literal is embedded: workflow export must not include bot-token-shaped values
  - [x] No api.telegram.org bot-token URL is embedded: workflow export must not include Telegram bot URLs
  - [x] No hardcoded Authorization/header secret literal is embedded: secret-like header values must come from env/credentials
- PASS: 04 - Task Reminder Timing (Cron → Aura Process → Telegram → Callback)
  - [x] Workflow export exists: n8n/workflows/04 - Task Reminder Timing (Cron → Aura Process → Telegram → Callback).json
  - [x] Workflow JSON parses: /Users/University/Final Project/aura/n8n/workflows/04 - Task Reminder Timing (Cron → Aura Process → Telegram → Callback).json
  - [x] Expected workflow name exists: 04 - Task Reminder Timing (Cron → Aura Process → Telegram → Callback)
  - [x] Expected cron trigger exists: n8n-nodes-base.cron
  - [x] Cron trigger includes 08:30: [{"hour":8,"minute":30},{"hour":12,"minute":30},{"hour":16,"minute":30},{"hour":20,"minute":30}]
  - [x] Cron trigger includes 12:30: [{"hour":8,"minute":30},{"hour":12,"minute":30},{"hour":16,"minute":30},{"hour":20,"minute":30}]
  - [x] Cron trigger includes 16:30: [{"hour":8,"minute":30},{"hour":12,"minute":30},{"hour":16,"minute":30},{"hour":20,"minute":30}]
  - [x] Cron trigger includes 20:30: [{"hour":8,"minute":30},{"hour":12,"minute":30},{"hour":16,"minute":30},{"hour":20,"minute":30}]
  - [x] Expected Aura backend endpoint reference exists: /internal/n8n/follow-through/tasks/process
  - [x] Required node exists: Cron: Cron
  - [x] Required node exists: HTTP Process: HTTP Process
  - [x] Required node exists: Build Batch Message: Build Batch Message
  - [x] Required node exists: Telegram configured?: Telegram configured?
  - [x] Required node exists: Telegram Send Message: Telegram Send Message
  - [x] Required node exists: Build Skipped Callback Payload: Build Skipped Callback Payload
  - [x] Required node exists: Post Automation Status: Post Automation Status
  - [x] Required node exists: Post Skipped Automation Status: Post Skipped Automation Status
  - [x] Callback/internal request uses AURA_WEBHOOK_KEY: x-aura-webhook-key must be env-based
  - [x] Telegram node or branch exists: 1 Telegram node(s)
  - [x] Telegram chat ID is env-based through TELEGRAM_CLINICIAN_CHAT_ID: Telegram chat target must not be hardcoded
  - [x] Skipped Telegram branch exists: safe no-provider path must exist
  - [x] Callback node posts to /events/automation-status: /events/automation-status
  - [x] No Telegram bot token literal is embedded: workflow export must not include bot-token-shaped values
  - [x] No api.telegram.org bot-token URL is embedded: workflow export must not include Telegram bot URLs
  - [x] No hardcoded Authorization/header secret literal is embedded: secret-like header values must come from env/credentials
- PASS: 06 - Appointment Reminder and Status Follow-up (Cron → Aura Process → Telegram → Callback)
  - [x] Workflow export exists: n8n/workflows/06 - Appointment Reminder and Status Follow-up (Cron → Aura Process → Telegram → Callback).json
  - [x] Workflow JSON parses: /Users/University/Final Project/aura/n8n/workflows/06 - Appointment Reminder and Status Follow-up (Cron → Aura Process → Telegram → Callback).json
  - [x] Expected workflow name exists: 06 - Appointment Reminder and Status Follow-up (Cron → Aura Process → Telegram → Callback)
  - [x] Expected cron trigger exists: n8n-nodes-base.cron
  - [x] Cron trigger includes 06:00: [{"hour":6,"minute":0},{"hour":12,"minute":0},{"hour":18,"minute":0}]
  - [x] Cron trigger includes 12:00: [{"hour":6,"minute":0},{"hour":12,"minute":0},{"hour":18,"minute":0}]
  - [x] Cron trigger includes 18:00: [{"hour":6,"minute":0},{"hour":12,"minute":0},{"hour":18,"minute":0}]
  - [x] Expected Aura backend endpoint reference exists: /internal/n8n/follow-through/appointments/process
  - [x] Required node exists: Cron: Cron
  - [x] Required node exists: HTTP Process: HTTP Process
  - [x] Required node exists: Build Batch Message: Build Batch Message
  - [x] Required node exists: Telegram configured?: Telegram configured?
  - [x] Required node exists: Telegram Send Message: Telegram Send Message
  - [x] Required node exists: Build Skipped Callback Payload: Build Skipped Callback Payload
  - [x] Required node exists: Post Automation Status: Post Automation Status
  - [x] Required node exists: Post Skipped Automation Status: Post Skipped Automation Status
  - [x] Callback/internal request uses AURA_WEBHOOK_KEY: x-aura-webhook-key must be env-based
  - [x] Telegram node or branch exists: 1 Telegram node(s)
  - [x] Telegram chat ID is env-based through TELEGRAM_CLINICIAN_CHAT_ID: Telegram chat target must not be hardcoded
  - [x] Skipped Telegram branch exists: safe no-provider path must exist
  - [x] Callback node posts to /events/automation-status: /events/automation-status
  - [x] No Telegram bot token literal is embedded: workflow export must not include bot-token-shaped values
  - [x] No api.telegram.org bot-token URL is embedded: workflow export must not include Telegram bot URLs
  - [x] No hardcoded Authorization/header secret literal is embedded: secret-like header values must come from env/credentials
- PASS: 07 - Daily Digest (Cron 09:00 → Aura Digest → Telegram → Callback)
  - [x] Workflow export exists: n8n/workflows/07 - Daily Digest (Cron 09:00 → Aura Digest → Telegram → Callback).json
  - [x] Workflow JSON parses: /Users/University/Final Project/aura/n8n/workflows/07 - Daily Digest (Cron 09:00 → Aura Digest → Telegram → Callback).json
  - [x] Expected workflow name exists: 07 - Daily Digest (Cron 09:00 → Aura Digest → Telegram → Callback)
  - [x] Expected cron trigger exists: n8n-nodes-base.cron
  - [x] Cron trigger includes 09:00: [{"hour":9,"minute":0}]
  - [x] Workflow timezone is Asia/Colombo when present: Asia/Colombo
  - [x] Expected Aura backend endpoint reference exists: /internal/n8n/follow-through/digest/process
  - [x] Required node exists: Cron: Cron
  - [x] Required node exists: HTTP Process: HTTP Process
  - [x] Required node exists: Build Batch Message: Build Batch Message
  - [x] Required node exists: Telegram configured?: Telegram configured?
  - [x] Required node exists: Telegram Send Message: Telegram Send Message
  - [x] Required node exists: Build Skipped Callback Payload: Build Skipped Callback Payload
  - [x] Required node exists: Post Automation Status: Post Automation Status
  - [x] Required node exists: Post Skipped Automation Status: Post Skipped Automation Status
  - [x] Callback/internal request uses AURA_WEBHOOK_KEY: x-aura-webhook-key must be env-based
  - [x] Telegram node or branch exists: 1 Telegram node(s)
  - [x] Telegram chat ID is env-based through TELEGRAM_CLINICIAN_CHAT_ID: Telegram chat target must not be hardcoded
  - [x] Skipped Telegram branch exists: safe no-provider path must exist
  - [x] Callback node posts to /events/automation-status: /events/automation-status
  - [x] No Telegram bot token literal is embedded: workflow export must not include bot-token-shaped values
  - [x] No api.telegram.org bot-token URL is embedded: workflow export must not include Telegram bot URLs
  - [x] No hardcoded Authorization/header secret literal is embedded: secret-like header values must come from env/credentials
- PASS: 08 - Communication No-Response Escalation (Cron → Aura Process → Telegram → Callback)
  - [x] Workflow export exists: n8n/workflows/08 - Communication No-Response Escalation (Cron → Aura Process → Telegram → Callback).json
  - [x] Workflow JSON parses: /Users/University/Final Project/aura/n8n/workflows/08 - Communication No-Response Escalation (Cron → Aura Process → Telegram → Callback).json
  - [x] Expected workflow name exists: 08 - Communication No-Response Escalation (Cron → Aura Process → Telegram → Callback)
  - [x] Expected cron trigger exists: n8n-nodes-base.cron
  - [x] Cron trigger includes 10:00: [{"hour":10,"minute":0}]
  - [x] Expected Aura backend endpoint reference exists: /internal/n8n/follow-through/communications/process
  - [x] Required node exists: Cron: Cron
  - [x] Required node exists: HTTP Process: HTTP Process
  - [x] Required node exists: Build Batch Message: Build Batch Message
  - [x] Required node exists: Telegram configured?: Telegram configured?
  - [x] Required node exists: Telegram Send Message: Telegram Send Message
  - [x] Required node exists: Build Skipped Callback Payload: Build Skipped Callback Payload
  - [x] Required node exists: Post Automation Status: Post Automation Status
  - [x] Required node exists: Post Skipped Automation Status: Post Skipped Automation Status
  - [x] Callback/internal request uses AURA_WEBHOOK_KEY: x-aura-webhook-key must be env-based
  - [x] Telegram node or branch exists: 1 Telegram node(s)
  - [x] Telegram chat ID is env-based through TELEGRAM_CLINICIAN_CHAT_ID: Telegram chat target must not be hardcoded
  - [x] Skipped Telegram branch exists: safe no-provider path must exist
  - [x] Callback node posts to /events/automation-status: /events/automation-status
  - [x] No Telegram bot token literal is embedded: workflow export must not include bot-token-shaped values
  - [x] No api.telegram.org bot-token URL is embedded: workflow export must not include Telegram bot URLs
  - [x] No hardcoded Authorization/header secret literal is embedded: secret-like header values must come from env/credentials

## Runtime Readiness Summary

- [x] Backend health reachable: HTTP 200
- [x] n8n base URL reachable: HTTP 200
- [x] MongoDB reachable: Connected for local/demo evidence checks.
- [x] Optional demo patient login works: HTTP 200; patientId=p1

## Workflow-by-Workflow Runtime Checklist

- [x] Workflow 02 n8n proxy unauthorized request fails closed: HTTP 401
- [x] Workflow 02 n8n proxy authorized request returns alert-list response: HTTP 200; hasAlertsArray=true

## Provider-Send-All Manual Observation Results

Workflow 01 is automatic through the synthetic high-risk alert path. Workflow 02 is automatic and is expected not to send Telegram. Workflows 03, 04, 06, 07, and 08 require manual n8n Execute Workflow runs; provider message ids for those workflows are recorded as "manual screenshot only if visible" when n8n callback payloads do not include Telegram message ids.

Workflow 07 Daily Digest uses a date-level dedupe key. If the explicit local/demo reset flag was enabled, this verifier removed only same-day Workflow 07 Daily Digest AUTOMATION_STATUS sent/skipped records before preflight and recorded that action in captured IDs.


## IDs Captured

- None captured.

## Failure Diagnostics

- Patient login failed for provider-send proof with HTTP 429

## Redaction Statement

This file was generated with secret redaction. JWTs, passwords, webhook keys, API keys, Telegram bot-token-shaped values, Authorization headers, HTTP auth credentials, secret-like fields, and long token-like strings are redacted before printing or writing evidence. Raw .env contents are not read or written by this verifier.

## Manual Screenshot Checklist

- Telegram chat/group showing synthetic messages for workflows 01, 03, 04, 06, 07, and 08.
- n8n executions list showing successful executions for workflows 01, 02, 03, 04, 06, 07, and 08.
- n8n execution detail screenshots for workflows 03, 04, 06, 07, and 08 showing process node, Telegram node, and callback node.
- Dashboard alert/worklist/digest surfaces where relevant.
- Crop or redact personal names, unrelated chats, and secrets.

## Limitations

- This verifies local/demo workflow integration only.
- It does not prove production notification reliability.
- It does not prove clinical safety or clinical deployment readiness.
- It does not use real patient data.
- It does not prove that a clinician read, understood, or acted on a message.
- Safe runtime mode verifies cron workflows through Aura backend internal process endpoints instead of forcing n8n cron execution.
- Manual n8n and Telegram screenshots are still recommended for appendix evidence.
- Provider-send-all mode still requires manual n8n execution screenshots for cron-triggered workflows 03, 04, 06, 07, and 08.

## Safe Final Report Wording

Under local/demo conditions, Aura verified each Telegram-capable n8n workflow with synthetic data. Workflow 01 was automatically exercised through the high-risk alert path and recorded Telegram delivery/callback evidence. Workflows 03, 04, 06, 07, and 08 were prepared with run-tagged eligible demo data and verified through manual n8n execution plus backend automation-status callback evidence. Workflow 02 was verified separately as an authenticated list-alerts proxy with no Telegram send expected. This evidence demonstrates local/demo provider-send integration only and does not represent production notification reliability, clinical validation, real patient validation, or proof that a clinician read or acted on a message.
