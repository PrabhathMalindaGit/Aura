# STRUCTURE REPORT

Generated for: `/Users/University/Final Project`

Included: folders and files

Excluded: `node_modules`, `.venv`, `__pycache__`, `dist`, `build`, `.git`

```text
.
- .DS_Store
- aura
  - .DS_Store
  - server
    - .DS_Store
    - README.md
    - .gitignore
    - package-lock.json
    - package.json
    - tsconfig.json
    - index.ts
    - .env.example
    - src
      - middleware
        - errorHandler.ts
        - validate.ts
      - .DS_Store
      - app.ts
      - utils
        - ids.ts
        - redact.ts
        - logger.ts
      - models
        - Alert.ts
        - ChatMessage.ts
        - CareEvent.ts
        - CheckIn.ts
      - db
        - mongo.ts
      - env.ts
      - routes
        - checkins.routes.ts
        - health.routes.ts
        - clinician.routes.ts
        - chat.routes.ts
        - index.ts
      - services
        - n8n.ts
        - ai.ts
  - README.md
  - dashboard
    - README.md
  - n8n
    - .DS_Store
    - workflows
      - 07 - Daily Digest (Cron 09:00 → Open alerts → Telegram).json
      - .DS_Store
      - 05 - Error Trigger → Telegram (throttled).json
      - README.md
      - 11 - Telegram Commands (／open ／ack ／resolve).json
      - 01 - Alert Created Webhook (POST → Dedupe → Table → Telegram → Respond).json
      - 02 - List Alerts Proxy (GET → Aura API → Respond).json
    - README.md
    - notes
      - test_payloads.json
      - troubleshooting.md
      - README.md
      - webhook_urls.md
    - SETUP_TELEGRAM.md
    - .env.example
  - mobile
    - README.md
  - ai
    - .DS_Store
    - requirements.txt
    - README.md
    - .gitignore
    - .env.example
    - src
      - routers
        - health.py
        - classify.py
      - config.py
      - utils
        - text_utils.py
      - logging_conf.py
      - models
        - schemas.py
      - main.py
      - services
        - router_service_test_examples.md
        - router_service.py
  - docker-compose.yml
  - .env.example
  - n8n_workflows
    - 11-telegram-ack-resolve.json
    - 01-alert-created-telegram.json
    - 05-error-to-telegram.json
    - 07-daily-digest.json
    - 02-list-alerts.json
```
