# Aura Server (Node.js + TypeScript)

## 1) Prerequisites
- MongoDB running (from repo root run `docker compose up -d`)
- AI Safety Router running on `http://localhost:8001`
- n8n running on `http://localhost:5678`

## 2) Install
```bash
cd "/Users/University/Final Project/aura/server"
npm install
```

## 3) Run
```bash
npm run dev
```

## 4) Test commands (copy/paste)
- Health:
```bash
curl -s http://localhost:3000/health
```

- Checkin low risk:
```bash
curl -X POST http://localhost:3000/checkins \
  -H "Content-Type: application/json" \
  -d '{"patientId":"p1","date":"2026-02-18","mood":3,"pain":3,"adherence":{"exercises":0.5,"medication":true},"notes":"Doing okay today"}'
```

- Checkin high risk (pain 8):
```bash
curl -X POST http://localhost:3000/checkins \
  -H "Content-Type: application/json" \
  -d '{"patientId":"p1","date":"2026-02-19","mood":2,"pain":8,"adherence":{"exercises":0.2,"medication":false},"notes":"Pain is much worse"}'
```

- Chat high risk (crisis keyword):
```bash
curl -X POST http://localhost:3000/chat/send \
  -H "Content-Type: application/json" \
  -d '{"patientId":"p1","text":"I cant breathe"}'
```

- Get clinician alerts:
```bash
curl -s "http://localhost:3000/clinician/alerts?status=open"
```

- Acknowledge an alert:
```bash
curl -X PATCH http://localhost:3000/clinician/alerts/<ALERT_ID> \
  -H "Content-Type: application/json" \
  -d '{"status":"acknowledged"}'
```

## 5) n8n verification
- Open `http://localhost:5678`
- Confirm workflow `alert-created` executed

## 6) Troubleshooting
- Port conflicts: `lsof -i :3000`
- Mongo not connected: `docker ps` and `docker logs aura_mongo`
- AI not reachable: `curl http://localhost:8001/health`
