# n8n Workflow Runtime Suite - 2026-05-13

## Purpose

This evidence records local/demo runtime verification for the Aura n8n workflow suite. It uses synthetic/demo data only and is intended for final report evidence.

This is local/demo runtime verification only. It is not production readiness evidence, production notification reliability evidence, clinical validation, real patient validation, or proof that a clinician read or acted on a message.

## Run Metadata

- Status: PASS
- Timestamp: 2026-05-13T18:21:13.066Z
- Run ID: 071ab3fd-f0c9-4eaa-9bb0-557d9f915c1d
- Synthetic marker: `aura-n8n-workflow-suite:071ab3fd-f0c9-4eaa-9bb0-557d9f915c1d`
- Command used: `npm run verify:n8n:workflows`
- Mode: safe-runtime
- Required services: MongoDB, Aura backend, and local n8n. Telegram/provider sending remains disabled.
- Provider-send gate status: disabled

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

## Workflow-by-Workflow Runtime Checklist

- [x] Workflow 02 n8n proxy unauthorized request fails closed: HTTP 401
- [x] Workflow 02 n8n proxy authorized request returns alert-list response: HTTP 200; hasAlertsArray=true
- [x] Workflow 03 missed check-in backend process and internal-demo callback: items=7; writtenEvents=7
- [x] Workflow 04 task reminder backend process and internal-demo callback: items=13; writtenEvents=13
- [x] Workflow 06 appointment backend process and internal-demo callback: items=5; writtenEvents=5
- [x] Workflow 08 communication backend process and internal-demo callback: items=25; writtenEvents=25
- [x] Workflow 07 digest backend process and internal-demo callback: items=1; writtenEvents=1
- [x] Workflow 01 provider-send path: Skipped because provider-send gate is disabled.

## IDs Captured

- syntheticMarker: aura-n8n-workflow-suite:071ab3fd-f0c9-4eaa-9bb0-557d9f915c1d
- syntheticPatientId: verify-071ab3fd
- syntheticAlertId: 6a04c11942add01783efe837
- syntheticTaskId: 6a04c11942add01783efe839
- syntheticAppointmentRequestId: 6a04c11942add01783efe83d
- syntheticCommunicationReviewId: 6a04c11942add01783efe840
- workflow03FirstDedupeKey: missed-checkin:p1:1:2026-05-13
- workflow03AutomationEvents: automation:missed_checkin_reminder:skipped:missed-checkin:p1:1:2026-05-13, automation:missed_checkin_reminder:skipped:missed-checkin:verify-071ab3fd:9:2026-05-13, automation:missed_checkin_reminder:skipped:missed-checkin:presentation-maria-gonzalez:1:2026-05-13, automation:missed_checkin_reminder:skipped:missed-checkin:presentation-robert-jackson:1:2026-05-13, automation:missed_checkin_reminder:skipped:missed-checkin:presentation-emily-lee:1:2026-05-13, automation:missed_checkin_reminder:skipped:missed-checkin:p2:2:2026-05-13, automation:missed_checkin_reminder:skipped:missed-checkin:verify-1d62267a:9:2026-05-13
- workflow04FirstDedupeKey: task-reminder:6a04c11942add01783efe839:overdue:1
- workflow04AutomationEvents: automation:task_reminder_timing:skipped:task-reminder:6a04c11942add01783efe839:overdue:1, automation:task_reminder_timing:skipped:task-reminder:6a03e2442754567934b5d3a7:overdue:1, automation:task_reminder_timing:skipped:task-reminder:6a03e2442754567934b5d3a1:overdue:1, automation:task_reminder_timing:skipped:task-reminder:6a03e2442754567934b5d3a4:overdue:1, automation:task_reminder_timing:skipped:task-reminder:6a03e2442754567934b5d39b:overdue:1, automation:task_reminder_timing:skipped:task-reminder:6a03e2442754567934b5d39e:overdue:1, automation:task_reminder_timing:skipped:task-reminder:6a04c1196ff934a2210aecab:overdue:1, automation:task_reminder_timing:skipped:task-reminder:6a03c9de6846058d3413be82:overdue:1, automation:task_reminder_timing:skipped:task-reminder:6a03c9de6846058d3413be7c:overdue:1, automation:task_reminder_timing:skipped:task-reminder:6a03c9de6846058d3413be76:overdue:1, automation:task_reminder_timing:skipped:task-reminder:6a03c9de6846058d3413be70:overdue:1, automation:task_reminder_timing:skipped:task-reminder:6a04c1196ff934a2210aec95:overdue:1, automation:task_reminder_timing:skipped:task-reminder:6a03c9de6846058d3413be6a:overdue:1
- workflow06FirstDedupeKey: appointment:6a01dcf1fcb3dcbe2ea3885d:missed:2026-05-13
- workflow06AutomationEvents: automation:appointment_follow_through:skipped:appointment:6a01dcf1fcb3dcbe2ea3885d:missed:2026-05-13, automation:appointment_follow_through:skipped:appointment:6a01f5291ab921148a896bdd:missed:2026-05-13, automation:appointment_follow_through:skipped:appointment:6a04c11942add01783efe83d:missed:2026-05-13, automation:appointment_follow_through:skipped:appointment:6a01f5291ab921148a896bde:missed:2026-05-13, automation:appointment_follow_through:skipped:appointment:6a01f5291ab921148a896be0:awaiting_confirmation:2026-05-13
- workflow08FirstDedupeKey: communication:69aebfcc3414c1c995ed7fe6:6h
- workflow08AutomationEvents: automation:communication_no_response_escalation:skipped:communication:69aebfcc3414c1c995ed7fe6:6h, automation:communication_no_response_escalation:skipped:communication:69aebfe73414c1c995ed8034:6h, automation:communication_no_response_escalation:skipped:communication:69aec0223414c1c995ed8084:6h, automation:communication_no_response_escalation:skipped:communication:69aec0333414c1c995ed80d4:6h, automation:communication_no_response_escalation:skipped:communication:69afaebb0f864fde98a15292:6h, automation:communication_no_response_escalation:skipped:communication:69f19b3f2086390826cc6d86:6h, automation:communication_no_response_escalation:skipped:communication:69f19b412086390826cc6db0:6h, automation:communication_no_response_escalation:skipped:communication:69f19b422086390826cc6dee:6h, automation:communication_no_response_escalation:skipped:communication:69f19b432086390826cc6e0e:6h, automation:communication_no_response_escalation:skipped:communication:69f19b442086390826cc6e2e:6h, automation:communication_no_response_escalation:skipped:communication:69f19b792086390826cc6e62:6h, automation:communication_no_response_escalation:skipped:communication:69f19b7a2086390826cc6e8c:6h, automation:communication_no_response_escalation:skipped:communication:69f19b7c2086390826cc6f42:6h, automation:communication_no_response_escalation:skipped:communication:69f19b7d2086390826cc6f62:6h, automation:communication_no_response_escalation:skipped:communication:69f19b7e2086390826cc6f82:6h, automation:communication_no_response_escalation:skipped:communication:69f19b7f2086390826cc6fa2:6h, automation:communication_no_response_escalation:skipped:communication:69f19b802086390826cc6fc2:6h, automation:communication_no_response_escalation:skipped:communication:69f19b812086390826cc6fe2:6h, automation:communication_no_response_escalation:skipped:communication:69f19b822086390826cc7002:6h, automation:communication_no_response_escalation:skipped:communication:69f19b832086390826cc7022:6h, automation:communication_no_response_escalation:skipped:communication:69f19b842086390826cc7042:6h, automation:communication_no_response_escalation:skipped:communication:69f19b852086390826cc7062:6h, automation:communication_no_response_escalation:skipped:communication:69f19b862086390826cc7082:6h, automation:communication_no_response_escalation:skipped:communication:69f19b872086390826cc70a2:6h, automation:communication_no_response_escalation:skipped:communication:69f19b882086390826cc70c2:6h
- workflow07FirstDedupeKey: daily-digest:2026-05-13
- workflow07AutomationEvents: automation:daily_clinician_digest:skipped:daily-digest:2026-05-13

## Failure Diagnostics

- No failure recorded.

## Redaction Statement

This file was generated with secret redaction. JWTs, passwords, webhook keys, API keys, Telegram bot-token-shaped values, Authorization headers, HTTP auth credentials, secret-like fields, and long token-like strings are redacted before printing or writing evidence. Raw .env contents are not read or written by this verifier.

## Manual Screenshot Checklist

- n8n workflows list showing the seven Aura workflows imported/published for the local demo.
- Workflow 02 n8n execution or response screenshot if the proxy check was run through n8n.
- Backend terminal or this evidence file with secrets hidden.
- For workflows 03, 04, 06, 07, and 08, manual Execute Workflow screenshots when full n8n execution is needed: process node, Telegram or skipped branch, callback node, and success output.
- In provider-send mode only: Telegram chat/group showing the synthetic Aura alert, n8n Workflow 01 execution success view, and clinician dashboard alert visibility.
- Crop or redact personal names, unrelated chats, and any secrets.

## Limitations

- This verifies local/demo workflow integration only.
- It does not prove production notification reliability.
- It does not prove clinical safety or clinical deployment readiness.
- It does not use real patient data.
- It does not prove that a clinician read, understood, or acted on a message.
- Safe runtime mode verifies cron workflows through Aura backend internal process endpoints instead of forcing n8n cron execution.
- Manual n8n and Telegram screenshots are still recommended for appendix evidence.

## Safe Final Report Wording

The Aura n8n workflow suite was verified under local/demo conditions using static workflow export validation and safe runtime checks. The verification confirmed that the canonical workflows referenced the expected Aura backend endpoints, authentication keys, Telegram configuration patterns, and callback routes. Runtime checks exercised local backend process paths and recorded redacted evidence. These results demonstrate local/demo workflow integration only and do not represent production notification assurance, clinical deployment validation, real patient validation, or proof that a clinician read or acted on a message.


