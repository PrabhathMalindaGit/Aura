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
  -d '{"date":"2026-02-23","mood":3,"pain":2,"adherence":{"exercises":0.5,"medication":true},"sleep":{"hours":7.5,"quality":4,"disturbances":1},"bodyMap":{"regions":[{"region":"lower_back","intensity":6,"type":"stiffness"},{"region":"knee_left","intensity":5,"type":"ache"}]},"notes":"doing okay"}'
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

- Patient wearables mock bulk sync (daily rollups):
```bash
curl -sS -X POST http://localhost:3000/patient/wearables/daily/bulk \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <PATIENT_TOKEN>" \
  -d '{"source":"mock","days":[{"date":"2026-02-23","steps":4200,"activeMinutes":28,"restingHr":74},{"date":"2026-02-24","steps":5100,"activeMinutes":33,"restingHr":72}]}'
```

- Patient wearables daily range:
```bash
curl -sS "http://localhost:3000/patient/wearables/daily?from=2026-02-17&to=2026-02-23&source=mock" \
  -H "Authorization: Bearer <PATIENT_TOKEN>"
```

- Patient wearables summary:
```bash
curl -sS "http://localhost:3000/patient/wearables/summary?from=2026-02-17&to=2026-02-23&source=mock" \
  -H "Authorization: Bearer <PATIENT_TOKEN>"
```

- Patient medications list:
```bash
curl -sS "http://localhost:3000/patient/medications" \
  -H "Authorization: Bearer <PATIENT_TOKEN>"
```

- Patient medication checklist for today:
```bash
curl -sS "http://localhost:3000/patient/medications/today?date=2026-02-23&tzOffsetMinutes=0" \
  -H "Authorization: Bearer <PATIENT_TOKEN>"
```

- Patient medication dose log upsert:
```bash
curl -sS -X POST http://localhost:3000/patient/medications/log \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <PATIENT_TOKEN>" \
  -d '{"medicationId":"<MEDICATION_ID>","date":"2026-02-23","time":"08:00","status":"taken","note":"As prescribed"}'
```

- Patient medication adherence range (inclusive end date):
```bash
curl -sS "http://localhost:3000/patient/medications/logs/range?from=2026-02-17&to=2026-02-23" \
  -H "Authorization: Bearer <PATIENT_TOKEN>"
```

- Patient symptom photo upload:
```bash
curl -sS -X POST http://localhost:3000/patient/photos \
  -H "Authorization: Bearer <PATIENT_TOKEN>" \
  -F "file=@/absolute/path/to/symptom.jpg;type=image/jpeg" \
  -F "date=2026-02-23" \
  -F "kind=swelling" \
  -F "note=Mild swelling near incision"
```

- Patient symptom photo list:
```bash
curl -sS "http://localhost:3000/patient/photos?limit=20" \
  -H "Authorization: Bearer <PATIENT_TOKEN>"
```

- Patient symptom photo metadata:
```bash
curl -sS "http://localhost:3000/patient/photos/<PHOTO_ID>/meta" \
  -H "Authorization: Bearer <PATIENT_TOKEN>"
```

- Patient symptom photo file (binary stream):
```bash
curl -sS "http://localhost:3000/patient/photos/<PHOTO_ID>/file" \
  -H "Authorization: Bearer <PATIENT_TOKEN>" \
  --output symptom-photo.jpg
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
Response includes deterministic `bodyMap.topRegions` when localized pain was logged in check-ins during that week.

- Patient approved insights:
```bash
curl -sS "http://localhost:3000/patient/insights?limit=5" \
  -H "Authorization: Bearer <PATIENT_TOKEN>"
```

- Patient create caregiver invite code:
```bash
curl -sS -X POST http://localhost:3000/patient/caregiver/invites \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <PATIENT_TOKEN>" \
  -d '{"expiresHours":24}'
```

- Patient list caregiver invites:
```bash
curl -sS "http://localhost:3000/patient/caregiver/invites" \
  -H "Authorization: Bearer <PATIENT_TOKEN>"
```

- Patient revoke caregiver invite:
```bash
curl -sS -X POST "http://localhost:3000/patient/caregiver/invites/<INVITE_ID>/revoke" \
  -H "Authorization: Bearer <PATIENT_TOKEN>"
```

- Caregiver login with invite code:
```bash
curl -sS -X POST http://localhost:3000/caregiver/auth/login \
  -H "Content-Type: application/json" \
  -d '{"code":"CG-ABCD-EFGH"}'
```

- Caregiver summary (read-only):
```bash
curl -sS "http://localhost:3000/caregiver/summary" \
  -H "Authorization: Bearer <CAREGIVER_TOKEN>"
```

- Caregiver weekly report (read-only):
```bash
curl -sS "http://localhost:3000/caregiver/reports/weekly?weekStart=2026-02-23&tzOffsetMinutes=0" \
  -H "Authorization: Bearer <CAREGIVER_TOKEN>"
```

- Clinician create appointment slot:
```bash
curl -sS -X POST http://localhost:3000/clinician/appointments/slots \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <CLINICIAN_TOKEN>" \
  -d '{"startsAt":"2026-03-20T10:00:00.000Z","endsAt":"2026-03-20T10:30:00.000Z","meetingLink":"https://example.com/meet/aura-demo"}'
```

- Patient list available appointment slots:
```bash
curl -sS "http://localhost:3000/patient/appointments/slots?limit=20" \
  -H "Authorization: Bearer <PATIENT_TOKEN>"
```

- Patient create appointment request:
```bash
curl -sS -X POST http://localhost:3000/patient/appointments/requests \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <PATIENT_TOKEN>" \
  -d '{"slotId":"<SLOT_ID>","note":"Morning is best for me"}'
```

- Clinician review request (approve/reject):
```bash
curl -sS -X PATCH "http://localhost:3000/clinician/appointments/requests/<REQUEST_ID>" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <CLINICIAN_TOKEN>" \
  -d '{"status":"approved"}'
```

- Patient list own appointment requests:
```bash
curl -sS "http://localhost:3000/patient/appointments/requests?limit=20" \
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

- Get clinician wearables daily range for a patient:
```bash
curl -sS "http://localhost:3000/clinician/patients/p1/wearables/daily?from=2026-02-17&to=2026-02-23&source=mock" \
  -H "Authorization: Bearer <CLINICIAN_TOKEN>"
```

- Get clinician wearables summary for a patient:
```bash
curl -sS "http://localhost:3000/clinician/patients/p1/wearables/summary?from=2026-02-17&to=2026-02-23&source=mock" \
  -H "Authorization: Bearer <CLINICIAN_TOKEN>"
```

- Get clinician medications for a patient:
```bash
curl -sS "http://localhost:3000/clinician/patients/p1/medications" \
  -H "Authorization: Bearer <CLINICIAN_TOKEN>"
```

- Get clinician medication adherence for a patient:
```bash
curl -sS "http://localhost:3000/clinician/patients/p1/medications/adherence?from=2026-02-17&to=2026-02-23" \
  -H "Authorization: Bearer <CLINICIAN_TOKEN>"
```

- Get clinician symptom photos for a patient:
```bash
curl -sS "http://localhost:3000/clinician/patients/p1/photos?limit=20&from=2026-02-17&to=2026-02-23" \
  -H "Authorization: Bearer <CLINICIAN_TOKEN>"
```

- Get clinician symptom photo metadata:
```bash
curl -sS "http://localhost:3000/clinician/photos/<PHOTO_ID>/meta" \
  -H "Authorization: Bearer <CLINICIAN_TOKEN>"
```

- Get clinician symptom photo file (binary stream):
```bash
curl -sS "http://localhost:3000/clinician/photos/<PHOTO_ID>/file" \
  -H "Authorization: Bearer <CLINICIAN_TOKEN>" \
  --output clinician-photo.jpg
```

- Get clinician weekly report for a patient:
```bash
curl -sS "http://localhost:3000/clinician/patients/p1/reports/weekly?weekStart=2026-02-23&tzOffsetMinutes=0" \
  -H "Authorization: Bearer <CLINICIAN_TOKEN>"
```
Response now includes deterministic `photos` counts (`uploadedThisWeek` + kind breakdown).

- Generate clinician insight suggestions for a patient:
```bash
curl -sS -X POST "http://localhost:3000/clinician/patients/p1/insights/generate" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <CLINICIAN_TOKEN>" \
  -d '{"windowDays":14}'
```

- Get clinician pending insights queue:
```bash
curl -sS "http://localhost:3000/clinician/insights?status=pending&limit=50" \
  -H "Authorization: Bearer <CLINICIAN_TOKEN>"
```

- Approve or reject clinician insight:
```bash
curl -sS -X PATCH "http://localhost:3000/clinician/insights/<INSIGHT_ID>" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <CLINICIAN_TOKEN>" \
  -d '{"status":"approved"}'
```

- Get clinician insights for one patient:
```bash
curl -sS "http://localhost:3000/clinician/patients/p1/insights?status=approved&limit=20" \
  -H "Authorization: Bearer <CLINICIAN_TOKEN>"
```

## 5) n8n verification
- Open `http://localhost:5678`
- Confirm workflow `alert-created` executed

## 6) Troubleshooting
- Port conflicts: `lsof -i :3000`
- Mongo not connected: `docker ps` and `docker logs aura_mongo`
- AI not reachable: `curl http://localhost:8001/health`
