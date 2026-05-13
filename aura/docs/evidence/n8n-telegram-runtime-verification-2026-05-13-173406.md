# n8n Telegram Runtime Verification - 2026-05-13

## Purpose

This evidence records local/demo runtime verification for the Aura high-risk alert notification chain. It uses synthetic data only and is intended for PUSL3190 final report evidence.

This is not production readiness evidence, clinical validation, real patient validation, and not proof that a clinician read the Telegram message.

## Run Metadata

- Status: PASS
- Timestamp: 2026-05-13T17:34:06.398Z
- Run ID: 4658f5f5-5830-4f5b-98a1-ac3934dc8835
- Command used: `npm run verify:n8n:telegram-runtime`
- Required services: MongoDB, Aura backend, AI/Safety Router path, local n8n workflow 01, and configured Telegram credentials/chat ID in n8n.
- Synthetic marker: `[AURA_N8N_TELEGRAM_RUNTIME:4658f5f5-5830-4f5b-98a1-ac3934dc8835]`

## Scenario

Synthetic high-risk patient chat through the existing patient chat API, using crisis-language wording to exercise the normal Safety Router, backend alert, n8n workflow, Telegram callback, and clinician alert visibility path.

The full patient message text is intentionally not recorded here beyond the synthetic marker and safe scenario summary.

## Pass/Fail Checklist

- [x] Required environment is present and local-safe: All required verifier env vars are set.
- [x] Canonical n8n workflow 01 export checks pass: PASS: Inbound webhook key validation references AURA_N8N_WEBHOOK_KEY; PASS: Telegram chat ID is environment-based; PASS: Notification callback posts to Aura status endpoint; PASS: Callback uses AURA_WEBHOOK_KEY; PASS: No Telegram bot-token-shaped literal is present; PASS: No api.telegram.org bot-token URL is present
- [x] Backend health endpoint succeeds: HTTP 200
- [x] n8n base URL is reachable: HTTP 200
- [x] Patient demo login succeeds: HTTP 200; patientId=p1
- [x] Clinician demo login succeeds: HTTP 200
- [x] MongoDB read connection succeeds: Connected for read-only evidence checks.
- [x] Synthetic patient chat creates a high-risk alert: HTTP 200; alertId=6a04b60e6ff934a2210aec67; risk=high
- [x] Clinician alert API contains created high-risk chat alert: alertId=6a04b60e6ff934a2210aec67; risk=high; status=open; source=chat
- [x] AlertNotificationJob reached delivered/sent Telegram state: {
  "state": "delivered",
  "channel": "telegram",
  "dispatchKind": "initial",
  "attemptCount": 1,
  "lastCallbackStatus": "sent",
  "messageId": "116",
  "currentAttemptKey": "6a04b60e6ff934a2210aec72"
}
- [x] NOTIFICATION_SENT CareEvent confirms Telegram sent callback: {
  "type": "NOTIFICATION_SENT",
  "channel": "telegram",
  "status": "sent",
  "messageId": "116",
  "workflow": "01",
  "createdAt": "2026-05-13T17:34:06.916Z"
}
- [x] Evidence file captures local/demo-only limitations: Safe wording included; no production, clinical, real-patient, or read-receipt claim is made.

## Runtime Results

- Backend health: HTTP 200
- n8n reachability: HTTP 200
- Alert ID: 6a04b60e6ff934a2210aec67
- Patient ID: p1
- Notification job status: {
  "state": "delivered",
  "channel": "telegram",
  "dispatchKind": "initial",
  "attemptCount": 1,
  "lastCallbackStatus": "sent",
  "messageId": "116",
  "currentAttemptKey": "6a04b60e6ff934a2210aec72"
}
- Care event summary: {
  "type": "NOTIFICATION_SENT",
  "channel": "telegram",
  "status": "sent",
  "messageId": "116",
  "workflow": "01",
  "createdAt": "2026-05-13T17:34:06.916Z"
}

## Workflow Export Security Checks

- [x] Inbound webhook key validation references AURA_N8N_WEBHOOK_KEY: Workflow 01 must fail closed on backend-to-n8n ingress.
- [x] Telegram chat ID is environment-based: Workflow 01 must not hard-code the clinician Telegram chat target.
- [x] Notification callback posts to Aura status endpoint: Workflow 01 must post truthful delivery status back to Aura.
- [x] Callback uses AURA_WEBHOOK_KEY: n8n-to-Aura callback must use the shared webhook key from environment.
- [x] No Telegram bot-token-shaped literal is present: Workflow exports must not contain Telegram bot tokens.
- [x] No api.telegram.org bot-token URL is present: Workflow exports must not embed Telegram bot-token URLs.

Workflow check summary: PASS: Inbound webhook key validation references AURA_N8N_WEBHOOK_KEY; PASS: Telegram chat ID is environment-based; PASS: Notification callback posts to Aura status endpoint; PASS: Callback uses AURA_WEBHOOK_KEY; PASS: No Telegram bot-token-shaped literal is present; PASS: No api.telegram.org bot-token URL is present

## Failure Diagnostics

No failure recorded.

## Redaction Statement

This file was generated with secret redaction. JWTs, passwords, webhook keys, API keys, Telegram bot-token-shaped values, Authorization headers, and secret-like fields are redacted before being written. Telegram bot tokens and raw chat IDs are not required by this verifier and should remain in n8n credentials or local secret storage only.

## Manual Screenshot Checklist

- Capture the Telegram chat/group showing the Aura Rehab alerts message for this synthetic run.
- Include the synthetic run marker or alert ID where possible.
- Crop or redact personal account names and unrelated chat content.
- Suggested path: `docs/evidence/screenshots/n8n-telegram-runtime-2026-05-13/telegram-chat-alert-4658f5f5-5830-4f5b-98a1-ac3934dc8835.png`

## Limitations

- This verifies local/demo runtime integration only.
- It does not prove production notification reliability.
- It does not prove clinical safety or clinical deployment readiness.
- It does not use real patient data.
- It does not prove that a clinician read, understood, or acted on the Telegram message.
- It depends on the currently running local backend, MongoDB, n8n import/activation state, and Telegram credential configuration.
- The generated alert/chat/job evidence is intentionally left in the local demo database for traceability.

## Safe Final Report Wording

Live Telegram notification delivery was verified in the local Aura prototype. A synthetic high-risk event triggered the backend alert path, the n8n workflow executed, a Telegram notification was delivered through the configured bot, and the alert was visible through the clinician dashboard data source. This demonstrates local/demo runtime integration only and does not represent production notification assurance, clinical deployment validation, real patient validation, or proof that a clinician read the message.
