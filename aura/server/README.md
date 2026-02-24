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

- Patient login (access code):
```bash
curl -sS -X POST http://localhost:3000/patient/auth/login \
  -H "Content-Type: application/json" \
  -d '{"accessCode":"P1-DEMO"}'
```

- Patient me:
```bash
curl -sS http://localhost:3000/patient/me \
  -H "Authorization: Bearer <PATIENT_TOKEN>"
```

- Patient check-in:
```bash
curl -sS -X POST http://localhost:3000/patient/checkins \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <PATIENT_TOKEN>" \
  -d '{"date":"2026-02-23","mood":3,"pain":2,"adherence":{"exercises":0.5,"medication":true},"sleep":{"hours":7.5,"quality":4,"disturbances":1},"notes":"doing okay"}'
```

- Patient check-ins list:
```bash
curl -sS "http://localhost:3000/patient/checkins?limit=20" \
  -H "Authorization: Bearer <PATIENT_TOKEN>"
```

- Patient hydration log:
```bash
curl -sS -X POST http://localhost:3000/patient/hydration/log \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <PATIENT_TOKEN>" \
  -d '{"date":"2026-02-23","amountMl":250}'
```

- Patient hydration today:
```bash
curl -sS "http://localhost:3000/patient/hydration/today?date=2026-02-23" \
  -H "Authorization: Bearer <PATIENT_TOKEN>"
```

- Patient hydration range (inclusive end date):
```bash
curl -sS "http://localhost:3000/patient/hydration/range?from=2026-02-17&to=2026-02-23" \
  -H "Authorization: Bearer <PATIENT_TOKEN>"
```

- Patient nutrition log:
```bash
curl -sS -X POST http://localhost:3000/patient/nutrition/log \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <PATIENT_TOKEN>" \
  -d '{"date":"2026-02-23","protein":"ok","fruitVegServings":4,"antiInflammatoryFocus":true,"mealRegularity":"mostly","appetite":"normal","notes":"Balanced meals today"}'
```

- Patient nutrition today:
```bash
curl -sS "http://localhost:3000/patient/nutrition/today?date=2026-02-23" \
  -H "Authorization: Bearer <PATIENT_TOKEN>"
```

- Patient nutrition range (inclusive end date):
```bash
curl -sS "http://localhost:3000/patient/nutrition/range?from=2026-02-17&to=2026-02-23" \
  -H "Authorization: Bearer <PATIENT_TOKEN>"
```

- Patient chat send:
```bash
curl -sS -X POST http://localhost:3000/patient/chat/send \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <PATIENT_TOKEN>" \
  -d '{"message":"Knee still feels tight today"}'
```

- Patient chat history:
```bash
curl -sS "http://localhost:3000/patient/chat/history?limit=50" \
  -H "Authorization: Bearer <PATIENT_TOKEN>"
```

- Patient today exercise plan:
```bash
curl -sS "http://localhost:3000/patient/exercise-plan/today" \
  -H "Authorization: Bearer <PATIENT_TOKEN>"
```

- Patient rehab phases:
```bash
curl -sS "http://localhost:3000/patient/rehab-phases" \
  -H "Authorization: Bearer <PATIENT_TOKEN>"
```

- Patient due PROMs:
```bash
curl -sS "http://localhost:3000/patient/proms/due?limit=10" \
  -H "Authorization: Bearer <PATIENT_TOKEN>"
```

- Patient PROM history:
```bash
curl -sS "http://localhost:3000/patient/proms/history?limit=20" \
  -H "Authorization: Bearer <PATIENT_TOKEN>"
```

- Patient PROM instance detail:
```bash
curl -sS "http://localhost:3000/patient/proms/<PROM_ID>" \
  -H "Authorization: Bearer <PATIENT_TOKEN>"
```

- Patient submit PROM:
```bash
curl -sS -X POST "http://localhost:3000/patient/proms/<PROM_ID>/submit" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <PATIENT_TOKEN>" \
  -d '{"answers":[{"questionId":"q1","value":2},{"questionId":"q2","value":1},{"questionId":"q3","value":2},{"questionId":"q4","value":1},{"questionId":"q5","value":2}]}'
```

- Patient weekly report (Monday weekStart):
```bash
curl -sS "http://localhost:3000/patient/reports/weekly?weekStart=2026-02-23&tzOffsetMinutes=0" \
  -H "Authorization: Bearer <PATIENT_TOKEN>"
```

- Patient create exercise session:
```bash
curl -sS -X POST http://localhost:3000/patient/exercise-sessions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <PATIENT_TOKEN>" \
  -d '{"startedAt":"2026-02-23T08:00:00.000Z","endedAt":"2026-02-23T08:12:30.000Z","planVersion":1,"planTitle":"Lower limb strengthening","planDayOfWeek":1,"exercises":[{"itemKey":"quad-set-1","nameSnapshot":"Quad set","order":1,"planned":{"sets":3,"reps":12},"completed":true,"difficulty":"ok","painDuring":2,"note":"Managed well"},{"itemKey":"heel-slide-1","nameSnapshot":"Heel slide","order":2,"planned":{"sets":3,"reps":10},"completed":false}]}'
```

- Patient list exercise sessions:
```bash
curl -sS "http://localhost:3000/patient/exercise-sessions?limit=20" \
  -H "Authorization: Bearer <PATIENT_TOKEN>"
```

- Patient get exercise session detail:
```bash
curl -sS "http://localhost:3000/patient/exercise-sessions/<SESSION_ID>" \
  -H "Authorization: Bearer <PATIENT_TOKEN>"
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

- Upsert exercise plan for a patient:
```bash
curl -sS -X PUT http://localhost:3000/clinician/patients/p1/exercise-plan \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <CLINICIAN_TOKEN>" \
  -d '{"title":"Lower limb strengthening","daysOfWeek":[1,3,5],"items":[{"key":"quad-set-1","name":"Quad set","instructions":"Tighten your thigh muscle and hold.","sets":3,"reps":12,"order":1},{"key":"heel-slide-1","name":"Heel slide","instructions":"Slide your heel toward your body.","sets":3,"reps":10,"order":2}]}'
```

- Get clinician exercise plan for a patient:
```bash
curl -sS http://localhost:3000/clinician/patients/p1/exercise-plan \
  -H "Authorization: Bearer <CLINICIAN_TOKEN>"
```

- Get clinician rehab phases for a patient:
```bash
curl -sS http://localhost:3000/clinician/patients/p1/rehab-phases \
  -H "Authorization: Bearer <CLINICIAN_TOKEN>"
```

- Set clinician current rehab phase:
```bash
curl -sS -X PATCH http://localhost:3000/clinician/patients/p1/rehab-phase \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <CLINICIAN_TOKEN>" \
  -d '{"currentKey":"phase-strength"}'
```

- Get clinician exercise sessions for a patient:
```bash
curl -sS "http://localhost:3000/clinician/patients/p1/exercise-sessions?limit=50" \
  -H "Authorization: Bearer <CLINICIAN_TOKEN>"
```

- Get clinician exercise session detail:
```bash
curl -sS "http://localhost:3000/clinician/exercise-sessions/<SESSION_ID>" \
  -H "Authorization: Bearer <CLINICIAN_TOKEN>"
```

- Assign PROM to patient:
```bash
curl -sS -X POST "http://localhost:3000/clinician/patients/p1/proms/assign" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <CLINICIAN_TOKEN>" \
  -d '{"templateKey":"AURA_RECOVERY_5"}'
```

- Get clinician PROMs list for a patient:
```bash
curl -sS "http://localhost:3000/clinician/patients/p1/proms?limit=50" \
  -H "Authorization: Bearer <CLINICIAN_TOKEN>"
```

- Get clinician PROM detail:
```bash
curl -sS "http://localhost:3000/clinician/proms/<PROM_ID>" \
  -H "Authorization: Bearer <CLINICIAN_TOKEN>"
```

- Get clinician hydration range for a patient:
```bash
curl -sS "http://localhost:3000/clinician/patients/p1/hydration/range?from=2026-02-17&to=2026-02-23" \
  -H "Authorization: Bearer <CLINICIAN_TOKEN>"
```

- Get clinician nutrition range for a patient:
```bash
curl -sS "http://localhost:3000/clinician/patients/p1/nutrition/range?from=2026-02-17&to=2026-02-23" \
  -H "Authorization: Bearer <CLINICIAN_TOKEN>"
```

- Get clinician weekly report for a patient:
```bash
curl -sS "http://localhost:3000/clinician/patients/p1/reports/weekly?weekStart=2026-02-23&tzOffsetMinutes=0" \
  -H "Authorization: Bearer <CLINICIAN_TOKEN>"
```

## 5) n8n verification
- Open `http://localhost:5678`
- Confirm workflow `alert-created` executed

## 6) Troubleshooting
- Port conflicts: `lsof -i :3000`
- Mongo not connected: `docker ps` and `docker logs aura_mongo`
- AI not reachable: `curl http://localhost:8001/health`
