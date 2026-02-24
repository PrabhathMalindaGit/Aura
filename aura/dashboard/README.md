# Aura Clinician Dashboard

React + TypeScript dashboard app for clinicians, scaffolded with a Vite-compatible structure.

## Quick Start

```bash
cd /Users/University/Final\ Project/aura/dashboard
npm install
npm run dev
```

## Routes

- `/alerts`
- `/patients`
- `/patients/:patientId`
- `/patients/:patientId/plan`
- `/patients/:patientId/weekly-report`
- `/proms/:promId`
- `/smoke`
- `/settings`
- unknown paths redirect to `/alerts`

## Environment

Copy `.env.local.example` to `.env.local` and adjust if needed:

```bash
VITE_API_BASE_URL=http://localhost:3000
```

## Live Smoke (real backend)

1. Start backend at `http://localhost:3000`.
2. Start dashboard with `npm run dev`.
3. Open `/smoke` to run endpoint checks against the configured API base URL.
4. Optional live E2E smoke:

```bash
npm run e2e:live
```

Live E2E runs only when `LIVE_E2E=1` is set by the script and skips early if backend health is unreachable.

## Dev auth helper for clinician APIs
If backend clinician RBAC is enabled, set a bearer token in localStorage for dashboard API calls.

1) Get token:
```bash
curl -sS -X POST http://localhost:3000/auth/clinician/login \
  -H "Content-Type: application/json" \
  -d '{"email":"clinician1@example.com","password":"devpass123"}'
```

2) In browser devtools console:
```js
localStorage.setItem('clinicianToken', '<TOKEN_FROM_LOGIN>');
```

## Exercise plan editor demo path

1. Open a patient detail page, e.g. `/patients/p1`.
2. Click **Exercise Plan**.
3. Use the JSON editor:
   - **Validate** to check JSON parse/shape quickly.
   - **Load demo template** to prefill a valid plan.
   - **Save** to upsert `PUT /clinician/patients/:patientId/exercise-plan`.
4. Reload to confirm persisted version and updated timestamp.

## Exercise sessions viewer demo path

1. Record a session from mobile:
   - open mobile **Today’s plan** screen
   - tap **Start session**
   - complete at least one exercise and finish.
2. In dashboard, open `/patients/p1`.
3. Use the **Exercise sessions** card to view recent entries.
4. Click **View all** to open `/patients/:patientId/sessions`.
5. Click any row for full per-exercise feedback detail.

## Rehab phase editor demo path

1. Open `/patients/p1` (or another seeded patient).
2. In the **Rehab phase** card:
   - review current phase and timeline statuses
   - choose a new current phase from the dropdown
   - click **Save**.
3. Refresh to confirm the selected phase persists and timeline statuses recompute.
4. In mobile, open **Rehab journey** to verify the patient view reflects this update.

## PROMs demo path (Step 12)

1. Open `/patients/p1`.
2. In **Questionnaires (PROMs)**:
   - select template `AURA_RECOVERY_5`
   - click **Assign** (or set an optional due date and assign).
3. Verify the new entry appears in the **Due** list.
4. Click **Open** to view `/proms/:promId` detail.
5. In mobile, complete the due PROM.
6. Refresh patient detail and verify it moves into **Completed** with score and band.

## Weekly report demo path (Step 13)

1. Open `/patients/p1`.
2. In the **Weekly report** card, choose **View this week** or **View last week**.
3. Verify the report page shows:
   - headline + highlights + next steps
   - check-in metrics
   - exercise session metrics
   - PROM due/completed summary
   - safety counts.
4. Use **Refresh** to reload the same week.

## Sleep add-on demo path (Step 14)

1. In mobile, submit one or more check-ins with optional sleep fields.
2. In dashboard, open `/patients/p1`.
3. Review **Sleep (recent)** card:
   - tracked entries from recent check-ins
   - average sleep hours and quality
   - latest 7-day sleep rows (date, hours, quality, disturbances).
4. Open weekly report (`/patients/p1/weekly-report`) and verify sleep stats are shown.

## Hydration add-on demo path (Step 14 #2)

1. In mobile, open **Hydration** and log intake entries (`+250 ml` / `+500 ml` / `+750 ml`).
2. In dashboard, open `/patients/p1`.
3. Review **Hydration (last 7 days)** card:
   - day totals in ml
   - average daily intake
   - goal-day count (`>= 2000 ml`).
4. Open weekly report (`/patients/p1/weekly-report`) and verify hydration stats are shown.

## Nutrition add-on demo path (Step 14 #3)

1. In mobile, open **Nutrition** and save today’s log.
2. Turn offline in mobile, save again, then go back online and sync pending logs.
3. In dashboard, open `/patients/p1`.
4. Review **Nutrition (last 7 days)** card:
   - per-day latest nutrition signal
   - tracked-day count
   - avg fruit/veg servings
   - protein OK/high day count.
5. Open weekly report (`/patients/p1/weekly-report`) and verify nutrition stats are shown.

## Medication add-on demo path (Step 14 #4)

1. In mobile, open **Medications** and mark at least one scheduled dose as **Taken**.
2. Turn offline in mobile, mark another dose, then return online and sync pending logs.
3. In dashboard, open `/patients/p1`.
4. Review **Medication adherence (last 7 days)** card:
   - daily scheduled/taken/skipped values
   - weekly adherence percentage.
5. Open weekly report (`/patients/p1/weekly-report`) and verify the **Medications** block is shown.

## Notes

- Legacy README preserved in `README_OLD.md`.
- Theme tokens are defined in `src/styles/tokens.css` and consumed by shared UI components.
- API helpers live in `src/services/apiClient.ts` with connection state in `src/services/connection.ts`.
