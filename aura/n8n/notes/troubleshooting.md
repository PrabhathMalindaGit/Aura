# n8n Troubleshooting (Aura)

## Quick diagnostic commands
```bash
docker ps
docker logs aura_n8n
lsof -i :5678
```

## Checklist
- n8n is running and reachable at `http://localhost:5678`.
- Workflow `01 - Alert Created Webhook` is active.
- Webhook path is exactly `alert-created`.
- Request method is `POST`.
- Backend env uses production URL:
  - `N8N_WEBHOOK_ALERT=http://localhost:5678/webhook/alert-created`
- Direct curl test works before backend testing:

```bash
curl -X POST http://localhost:5678/webhook/alert-created \
  -H "Content-Type: application/json" \
  -d '{"type":"ALERT_CREATED","patientId":"p1","alertId":"65f0aa11bb22cc33dd44ee55","risk":"high","reason":["PAIN_GE_THRESHOLD"],"timestamp":"2026-02-18T12:00:00.000Z"}'
```

## Common issues
- No executions in n8n:
  - Workflow inactive, or test URL used without `Listen for Test Event`.
- 404 from webhook:
  - Wrong URL path. Use `/webhook/alert-created` for production.
- 405 from webhook:
  - Wrong HTTP method; must be `POST`.
- Backend reports `n8nDelivered: false`:
  - n8n down, wrong webhook URL, or workflow inactive.
