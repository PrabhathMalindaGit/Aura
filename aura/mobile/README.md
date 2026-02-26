# Aura Mobile (Expo)

## Run

```bash
cd "/Users/University/Final Project/aura/mobile"
npm run start
```

In the Expo terminal:
- Press `i` for iOS simulator
- Press `w` for web
- Press `a` for Android emulator

### Safe start scripts

- `npm run start`: recommended. Cleans invalid port env vars and forces Expo/Metro to port `8081`.
- `npm run start:raw`: raw Expo start without safe guards.
- `npm run ios`: safe start + iOS target.
- `npm run web`: safe start + web target.

## Node version (recommended)

Use Node 22 LTS in this project.

With `nvm`:

```bash
cd "/Users/University/Final Project/aura/mobile"
nvm use
```

With `fnm`:

```bash
cd "/Users/University/Final Project/aura/mobile"
fnm use 22
```

## Environment

1. Copy env template:

```bash
cp .env.example .env
```

2. Set API base URL in `.env`:

```env
EXPO_PUBLIC_API_BASE=http://localhost:3000
```

3. Use only `EXPO_PUBLIC_*` variables for client-side access.
4. Restart Expo after changing `.env`.

## Project Structure

- `app/`: Expo Router routes and layouts.
- `src/components/`: reusable UI primitives.
- `src/hooks/`: reusable hooks (placeholders for upcoming steps).
- `src/api/`: API client and patient auth wrappers.
- `src/config/`: env + app constants.
- `src/state/`: auth/session, network, refresh, and last-error stores.
- `src/types/`: shared TypeScript models.
- `src/utils/`: tiny utility helpers.

## Networking Notes

- iOS Simulator + Web: `http://localhost:3000` usually works.
- Android Emulator: use `http://10.0.2.2:3000`.
- Physical phone: use your laptop LAN IP, for example `http://192.168.x.x:3000`.

## Trust Under Failure (Step 2)

- A global offline banner is mounted at app root.
- Banner copy: "Offline" and "Nothing will be sent until you're back online."
- Actions can be gated with `useGuardedAction` to safely block submits while offline.
- Unknown reachability states are treated as non-blocking to avoid false negatives.
- Error normalization is available in `src/utils/errors.ts` for consistent friendly messages.
- No API calls were added in Step 2.

## Last Refreshed Scaffolding (Step 2.1)

- Local-only timestamp storage is implemented in `src/state/refresh.ts`.
- Keys are typed (`home`, `chat`, `checkins`, `progress`, `exercisePlan`, `exerciseSessions`, `rehabPhases`, `proms`, `hydration`, `nutrition`, `medications`, `wearables`, `appointments`, `insights`, `caregiver`, `weeklyReport`, `photos`) to keep usage consistent.
- Future data steps should call:
  - `setLastRefreshedNow("chat")` after successful chat-history load.
  - `setLastRefreshedNow("progress")` after successful check-ins/progress load.
- Home tab includes a local demo with “Mark ... refreshed” buttons and a dev-only clear action.
- No backend calls were added in Step 2.1.

## Last Error Scaffolding (Step 2.2)

- Persistent local error records are implemented in `src/state/lastError.ts`.
- Error keys are typed (`auth`, `checkinSubmit`, `chatSend`, `chatLoad`, `progressLoad`, `exercisePlanLoad`, `exerciseSessionSave`, `exerciseSessionsLoad`, `rehabPhasesLoad`, `promsLoad`, `promSubmit`, `hydrationLoad`, `hydrationLog`, `nutritionLoad`, `nutritionLog`, `medicationsLoad`, `medicationLog`, `wearablesLoad`, `wearablesSync`, `appointmentsLoad`, `appointmentRequest`, `insightsLoad`, `caregiverLoad`, `caregiverLogin`, `weeklyReportLoad`, `photosLoad`, `photoUpload`).
- UI helper `src/components/LastFailedAttempt.tsx` renders:
  - relative failed-at label
  - optional friendly title/message
  - optional clear action
- Future usage guidance:
  - Step 4 check-in submit failure: set key=`checkinSubmit`
  - Step 5 chat send failure: set key=`chatSend`; chat history load failure: key=`chatLoad`
  - Step 6 progress fetch failure: set key=`progressLoad`
- Messages must stay user-friendly and must not include stacks or PHI.
- No backend calls were added in Step 2.2.

## Auth & Session (Step 3)

- Login endpoint: `POST /patient/auth/login` with `accessCode`.
- Profile endpoint: `GET /patient/me` with bearer token.
- Session restore runs on app launch:
  - native token storage: `expo-secure-store`
  - web fallback: AsyncStorage/localStorage (dev convenience)
- Route guard behavior:
  - signed out users are redirected to `/(auth)/login`
  - signed in users can access `/(tabs)` routes

### Demo login codes

- `P1-DEMO`
- `P2-DEMO`
- `P3-DEMO`

### Step 4/5/6 usage note

- Step 4: implement check-in submit flow (reuse auth token + last-error + refresh stamps).
- Step 5: implement chat send/history flow (reuse auth token + last-error + refresh stamps).
- Step 6: implement progress/check-ins read flow with the same patterns.

## Step 3.1: Logout (Settings Tab)

- Settings tab now includes a dedicated logout control.
- Logout confirms user intent and then clears session state.
- Route guards redirect signed-out users back to `/(auth)/login`.
- In development builds, Settings also exposes:
  - clear last refreshed stamps
  - clear last errors

### Manual logout test

1. Sign in with a demo code (`P1-DEMO`, `P2-DEMO`, or `P3-DEMO`).
2. Open the Settings tab.
3. Tap **Log out** and confirm.
4. Verify you are redirected to login.
5. Relaunch app and verify it stays signed out.
6. Sign in again and confirm tabs load normally.

## Step 4: Daily Check-in + Safety Routing

- Check-in screen lives in the **Check-in** tab and submits to:
  - `POST /patient/checkins` with bearer token from session.
- On low risk:
  - app shows `Saved. Thank you for checking in.`
  - app stays on Check-in screen.
- On high risk:
  - app navigates to `/safety`
  - safety screen shows reason labels and a clinician-notified message when `alertId` is returned.
- Offline behavior:
  - submit is blocked
  - message: `You’re offline. Nothing was sent.`
  - last failed attempt (`checkinSubmit`) is updated.
- Last refreshed:
  - successful submit updates `checkins` refresh stamp.

### Check-in manual test

1. Sign in with `P1-DEMO`.
2. Open the **Check-in** tab.
3. Submit low risk:
   - pain `2`, mood `4`, exercises `80%`, medication `true`
   - verify success notice appears and no safety navigation.
4. Submit high risk:
   - pain `9`, mood `2`, exercises `20%`, medication `false`
   - verify navigation to Safety screen.
5. Turn offline and submit:
   - verify block message and last failed attempt update.

### Emergency call placeholders

- `EMERGENCY_NUMBER_PLACEHOLDER` currently defaults to `911`.
- `SUPPORT_PHONE_PLACEHOLDER` currently defaults to `+0000000000`.
- Replace both in `/Users/University/Final Project/aura/mobile/src/config/constants.ts` before production.

## Step 5: Safety-Gated Chat

- Chat tab uses patient endpoints:
  - `GET /patient/chat/history?limit=50`
  - `POST /patient/chat/send`
- History load:
  - online success updates `Last refreshed` for key `chat`
  - failures are stored as `chatLoad` last-error records
  - when offline, app shows cached messages if available
- Send flow:
  - offline sends are blocked: `You’re offline. Nothing was sent.`
  - low risk appends assistant reply
  - high risk immediately routes to `/safety` and does not append assistant reply
  - send failures are stored as `chatSend` last-error records with retry affordance

### Chat manual test

1. Sign in with `P1-DEMO`.
2. Open **Chat** tab and verify history loads.
3. Send low-risk message:
   - `I completed my exercises and feel okay.`
   - expect assistant reply in chat.
4. Send high-risk message:
   - `I have chest pain right now.`
   - expect navigation to Safety screen and no assistant reply bubble.
5. Turn offline and send:
   - expect blocked send and updated last failed attempt for `chatSend`.
6. Return online and retry:
   - expect send succeeds and history continues.

## Step 6: Progress (14/30 day summaries + history)

- Progress tab loads check-ins from:
  - `GET /patient/checkins?limit=200`
- Summary supports:
  - `14 days`
  - `30 days`
- History list shows recent check-ins and supports tap-to-detail view.
- Trust-under-failure integration:
  - `Last refreshed` key: `progress`
  - `Last failed attempt` key: `progressLoad`
  - offline uses cached progress when available.

### Progress manual test

1. Sign in with `P1-DEMO`.
2. Submit a few check-ins in **Check-in** tab.
3. Open **Progress** tab:
   - verify summary values appear for 14-day window.
   - switch to 30-day window and verify values update.
   - verify history rows show date, pain, mood, exercises, medication.
4. Pull to refresh:
   - online success updates `Last refreshed`.
5. Turn offline and reopen Progress:
   - cached data should display if available.
   - if no cache, clear offline empty state is shown.
6. Stop backend while online and pull to refresh:
   - `progressLoad` failure appears.
   - Retry action is shown for retryable failures.

### Developer cache reset

- In **Settings** (development mode), use:
  - `Clear saved progress`
  to remove the cached progress payload for the signed-in patient.

## Step 7: Local daily reminders (Settings)

- Reminders are **local notifications only** (no backend push, no push token flow).
- Configure in **Settings > Daily reminder**:
  - enable/disable toggle
  - hour/minute inputs (0-23, 0-59)
  - persisted per signed-in patient
- Permission flow:
  - enabling requests notification permission
  - if denied, reminder stays off and settings guidance is shown
- Development helpers in Settings:
  - `Send test notification now`
  - `List scheduled notifications (debug)`

### Reminder test flow

1. Use a real device when possible for reliable notification behavior.
2. Sign in and open **Settings**.
3. Enable reminder and set time 1–2 minutes ahead.
4. Keep app in foreground/background and verify local notification appears.
5. Disable reminder and verify future reminders stop.
6. Deny permission, re-enable reminder, verify guidance with `Open Settings`.

### Notes

- Expo Go support differs by platform/version; local notification testing is most reliable on physical devices.
- This step does not add remote push notifications.

## Step 8 Demo Script (Demo Hub)

### Required services

1. Start backend on `http://localhost:3000`.
2. Start AI service on `http://localhost:8001`.
3. Start mobile app:
   - `cd "/Users/University/Final Project/aura/mobile"`
   - `npm run start`

### Demo flow (matches Home/Demo Hub checklist)

1. Sign in with `P1-DEMO`.
2. Check-in low risk:
   - pain `2`, mood `4`, exercises `80%`, meds on
   - expected: `Saved`.
3. Check-in high risk:
   - pain `9`, mood `2`, exercises `20%`, meds off
   - expected: Safety screen.
4. Chat low risk:
   - send `I completed my exercises and feel okay.`
   - expected: assistant reply appears.
5. Chat high risk:
   - send `I have chest pain right now.`
   - expected: Safety screen, no assistant reply.
6. Progress:
   - open Progress tab, switch `14 days` / `30 days`
   - open one check-in detail row.
7. Settings:
   - enable/disable daily reminder
   - log out.

### Offline expectations during demo

- Offline banner appears.
- Send/submit actions show `Nothing was sent`.
- `Last failed attempt` timestamps update for the corresponding action.
- Progress and chat should show cached data when available.

### Demo reset tools (development only)

- In Home/Demo Hub:
  - `Reset demo state` clears chat cache, check-ins cache, last refreshed stamps, last failed attempts, and reminder prefs.
  - `Reset + sign out` does the same and signs out.

### Step 8 troubleshooting

- Assistant reply missing:
  - verify `EXPO_PUBLIC_API_BASE` in `.env`
  - verify backend `/patient/chat/send` is reachable.
- High-risk message does not open Safety:
  - verify AI classify service is running on `:8001`
  - verify backend safety classification path is healthy.
- Progress not updating:
  - use pull-to-refresh
  - check `Last failed attempt (progressLoad)` for latest failure time.

## Step 9: Clinician-assigned Exercise Plan (HEP)

- Patient endpoint used by mobile:
  - `GET /patient/exercise-plan/today`
- Screen:
  - open **Home (Demo Hub)** and tap **Go to Plan**
  - route: `/exercise-plan`
- Trust-under-failure integration:
  - `Last refreshed` key: `exercisePlan`
  - `Last failed attempt` key: `exercisePlanLoad`
  - offline shows cached plan when available.

### Step 9 demo flow

1. Clinician signs into dashboard and updates plan for `p1`.
2. Patient signs into mobile with `P1-DEMO`.
3. Open **Go to Plan** and verify:
   - plan title and item list appear
   - item order is stable
   - `Open video` opens external URL when present.
4. Turn offline and reopen plan:
   - if cached, app shows `Offline — showing saved plan`
   - `Last refreshed` does not advance while offline.
5. Stop backend while online and refresh plan:
   - `Last failed attempt (exercisePlanLoad)` updates
   - cached plan remains visible when available.

## Step 10: Exercise sessions + micro feedback

- New mobile routes:
  - `/exercise-session` (runner)
  - `/exercise-sessions` (recent list + pending uploads)
  - `/exercise-session-detail?id=<sessionId>` (detail)
- Backend endpoints used:
  - `POST /patient/exercise-sessions`
  - `GET /patient/exercise-sessions?limit=20`
  - `GET /patient/exercise-sessions/:id`
- Trust-under-failure keys:
  - `Last refreshed`: `exerciseSessions`
  - `Last failed`: `exerciseSessionSave`, `exerciseSessionsLoad`

### Step 10 demo flow

1. Open **Go to Plan** and tap **Start session**.
2. Mark at least two exercises done:
   - on each mark, complete the micro-feedback modal:
     - difficulty (`easy` / `ok` / `hard`)
     - pain during (`0..5`)
     - optional short note.
3. Tap **Finish session**.
4. Expected online behavior:
   - session is saved to backend
   - app navigates to session detail or sessions list
   - session appears in **Go to Sessions** list.
5. Expected offline behavior:
   - finish does not call backend
   - session is stored as pending (`Not sent`)
   - open **Go to Sessions** and use **Submit pending** once online.

### Step 10 troubleshooting

- Session list empty after finishing online:
  - confirm backend is reachable at `EXPO_PUBLIC_API_BASE`
  - pull-to-refresh on `/exercise-sessions`.
- Pending submit fails:
  - check network state (offline banner)
  - retry **Submit pending** after connectivity recovers.
- Detail screen cannot load:
  - verify session was created on backend
  - open from list row to ensure valid `id` param.

## Step 11: Rehab phase tracker

- New mobile route: `/rehab-journey`
- Backend endpoint used:
  - `GET /patient/rehab-phases`
- Trust-under-failure keys:
  - `Last refreshed`: `rehabPhases`
  - `Last failed`: `rehabPhasesLoad`

### Step 11 demo flow

1. In dashboard, open patient detail (for example `/patients/p1`) and change **Rehab phase**.
2. In mobile Demo Hub, tap **Rehab journey**.
3. Verify timeline shows:
   - done phases (✓)
   - current phase (Current)
   - locked phases (🔒)
4. Turn offline and reopen Rehab journey:
   - cached timeline is shown if available
   - `Last refreshed` does not advance while offline.

### Step 11 troubleshooting

- Rehab journey is empty online:
  - verify patient has seeded rehab phases (`npm run seed:reset` in server).
- Rehab phase change in dashboard not visible in mobile:
  - confirm both clients use the same backend base URL.
  - refresh Rehab journey screen while online.
- Offline shows no timeline:
  - open Rehab journey once while online to create cache, then retry offline.

## Step 12: Questionnaires (PROMs) + deterministic scoring

- New mobile routes:
  - `/proms` (due/completed list + pending uploads)
  - `/prom-fill?promId=<PROM_ID>` (one-question-per-screen wizard)
- Backend endpoints used:
  - `GET /patient/proms/due?limit=10`
  - `GET /patient/proms/history?limit=20`
  - `GET /patient/proms/:id`
  - `POST /patient/proms/:id/submit`
- Trust-under-failure keys:
  - `Last refreshed`: `proms`
  - `Last failed`: `promsLoad`, `promSubmit`

### Step 12 demo flow

1. In dashboard, assign `AURA_RECOVERY_5` to `p1`.
2. In mobile Demo Hub, tap **PROMs**.
3. Open a due questionnaire and complete all questions in the wizard.
4. Submit online:
   - due item moves to completed
   - completed row shows score + severity band.
5. Offline flow:
   - open a cached questionnaire
   - complete and submit while offline
   - item is saved to pending uploads
   - return online and tap **Submit pending**.

### Step 12 troubleshooting

- Questionnaire does not open offline:
  - open it once online first so the instance is cached.
- Pending submissions do not clear:
  - verify network is online
  - check `Last failed attempt` for `promSubmit`.
- Due/completed lists stale:
  - pull-to-refresh on `/proms`
  - verify API base URL in `.env`.

## Step 13: Weekly report (deterministic, non-AI)

- New mobile route:
  - `/weekly-report`
- Backend endpoint used:
  - `GET /patient/reports/weekly?weekStart=YYYY-MM-DD&tzOffsetMinutes=<offset>`
- Trust-under-failure keys:
  - `Last refreshed`: `weeklyReport`
  - `Last failed`: `weeklyReportLoad`

### Step 13 demo flow

1. Open Demo Hub and tap **Weekly report**.
2. Select **This week** and verify:
   - headline, highlights, and next steps
   - check-in, exercise, PROM, and safety sections.
3. Tap **Share report** and confirm text share sheet opens.
4. Go offline and reopen **Weekly report**:
   - cached report is shown when available
   - `Last refreshed` does not update offline.
5. Return online and tap **Refresh report**.

### Step 13 troubleshooting

- Weekly report not loading online:
  - verify backend is running and reachable from `EXPO_PUBLIC_API_BASE`.
  - check `Last failed attempt` for `weeklyReportLoad`.
- Offline report empty:
  - open the same week online once to populate cache, then retry offline.
- Shared text looks stale:
  - refresh online first, then use **Share report** again.

## Step 14: Sleep tracker add-on

- Sleep is now optional in check-ins:
  - `sleep.hours` (0..16, 0.5 step in UI)
  - `sleep.quality` (1..5)
  - `sleep.disturbances` (0..5)
- Sleep inputs are submitted through existing endpoint:
  - `POST /patient/checkins`
- Progress summary now includes:
  - average sleep hours
  - average sleep quality
- Weekly report now includes a sleep section:
  - tracked nights
  - average hours
  - average quality

### Step 14 demo flow

1. Submit a check-in with sleep values in **Check-in** tab.
2. Open **Progress**:
   - verify sleep averages update for 14/30 day windows.
3. Open **Weekly report**:
   - verify sleep section appears with tracked nights and averages.
4. Turn offline and try submitting check-in:
   - submission is blocked (nothing sent), same as existing behavior.
5. Reopen Progress/Weekly report offline:
   - cached data remains visible when previously loaded.

## Step 14: Hydration tracker add-on

- New route:
  - `/hydration` (opened from Demo Hub quick actions)
- Backend endpoints used:
  - `POST /patient/hydration/log`
  - `GET /patient/hydration/today`
  - `GET /patient/hydration/range`
- Trust-under-failure keys:
  - `Last refreshed`: `hydration`
  - `Last failed`: `hydrationLoad`, `hydrationLog`
- Offline behavior:
  - quick-add hydration entries are queued locally as pending
  - pending entries sync with **Sync now** when online.

### Step 14 hydration demo flow

1. Open **Hydration** and tap `+250 ml` / `+500 ml` a few times.
2. Verify **Today total** and entry list update.
3. Turn offline and tap add again:
   - pending count increases
   - entries show `(Pending)`.
4. Go online and tap **Sync now**:
   - pending clears
   - today totals refresh from server.
5. Open **Progress**:
   - verify hydration summary cards (`Avg hydration`, `Hydration goal days`).
6. Open **Weekly report**:
   - verify hydration section appears.

## Step 14: Nutrition tracker add-on

- New route:
  - `/nutrition` (opened from Demo Hub quick actions)
- Backend endpoints used:
  - `POST /patient/nutrition/log`
  - `GET /patient/nutrition/today`
  - `GET /patient/nutrition/range`
- Trust-under-failure keys:
  - `Last refreshed`: `nutrition`
  - `Last failed`: `nutritionLoad`, `nutritionLog`
- Offline behavior:
  - nutrition logs are queued locally when offline
  - pending nutrition logs sync with **Sync now** when online.

### Step 14 nutrition demo flow

1. Open **Nutrition** and save today’s log.
2. Verify today summary updates (`Saved at ...`).
3. Turn offline, change values, save again:
   - pending count increases
   - entry shows as pending sync.
4. Go online and tap **Sync now**:
   - pending clears
   - latest saved entry reflects synced server data.
5. Open **Weekly report**:
   - verify nutrition section appears.
6. Open dashboard `/patients/p1`:
   - verify **Nutrition (last 7 days)** panel updates.

## Step 14: Medication & supplement tracker add-on

- New route:
  - `/medications` (opened from Demo Hub quick actions)
- Backend endpoints used:
  - `GET /patient/medications`
  - `GET /patient/medications/today`
  - `POST /patient/medications/log`
  - `GET /patient/medications/logs/range`
- Trust-under-failure keys:
  - `Last refreshed`: `medications`
  - `Last failed`: `medicationsLoad`, `medicationLog`
- Offline behavior:
  - dose logs are queued locally while offline
  - pending dose logs sync with **Sync now** when online.

### Step 14 medication demo flow

1. Open **Medications** and mark one dose as **Taken**.
2. Verify the dose status updates immediately in today checklist.
3. Turn offline and mark another dose:
   - pending count increases
   - dose row shows pending sync behavior.
4. Go online and tap **Sync now**:
   - pending count clears
   - checklist refreshes from server.
5. Open **Weekly report**:
   - verify medications section appears (scheduled/taken/skipped/adherence).
6. Open dashboard `/patients/p1`:
   - verify **Medication adherence (last 7 days)** panel updates.

## Step 14: Body map pain localization add-on

- Body map is now optional in check-ins:
  - region chips (up to 6 selections in UI)
  - per-region intensity (`0..10`)
  - per-region pain type (`ache`, `sharp`, `burning`, `tingling`, `stiffness`, `other`)
- Backend endpoint used:
  - `POST /patient/checkins` (bodyMap embedded in check-in payload)
- Trust-under-failure behavior:
  - check-in submission is still blocked while offline
  - no new offline queue was added for body map (same as check-in behavior)

### Step 14 body map demo flow

1. Open **Check-in** and select 1–2 body areas in **Where is the pain?**.
2. Set intensity/type for each selected area and submit while online.
3. Open **Progress** and tap the new check-in row to open **Check-in detail**.
4. Verify **Pain areas** renders region label + intensity + type.
5. Open **Weekly report**:
   - verify **Top pain areas** section appears when body-map data exists this week.

## Step 14: Symptom photo upload add-on

- Symptom photos are tracked on a dedicated screen:
  - `/symptom-photos` (opened from Demo Hub quick actions)
- Backend endpoints used:
  - `POST /patient/photos` (multipart upload)
  - `GET /patient/photos`
  - `GET /patient/photos/:id/meta`
  - `GET /patient/photos/:id/file`
- Trust-under-failure keys:
  - `Last refreshed`: `photos`
  - `Last failed`: `photosLoad`, `photoUpload`
- Offline behavior:
  - photo selection is allowed offline
  - uploads are queued as pending and synced manually with **Sync now**.

### Step 14 photo demo flow

1. Open **Symptom photos** and add a photo while online.
2. Verify the photo appears in the list and opens in **Photo** viewer.
3. Turn offline and add another photo:
   - item is marked **Pending sync**
   - pending count increases.
4. Go online and tap **Sync now**:
   - pending count clears
   - uploaded item appears in server-backed list.
5. Open **Weekly report**:
   - verify **Symptom photos** section appears (uploaded count + kinds).
6. Open dashboard `/patients/p1`:
   - verify **Symptom photos (recent)** panel shows entries and **View** opens image.

## Step 15: Clinician-reviewed insight cards

- New route:
  - `/insights` (opened from Demo Hub quick actions)
- Backend endpoint used:
  - `GET /patient/insights` (approved-only)
- Trust-under-failure keys:
  - `Last refreshed`: `insights`
  - `Last failed`: `insightsLoad`
- Offline behavior:
  - patient sees cached approved insights only
  - pending/rejected suggestions are never shown on mobile.

### Step 15 demo flow

1. In dashboard, open `/patients/p1` and click **Generate suggestions** in the Insight cards panel.
2. Approve one pending suggestion (inline or from `/insights` queue page).
3. In mobile, open **Demo Hub** and check the **Insights** preview cards.
4. Open **View all insights** and verify approved cards appear.
5. Go offline and reopen **Insights**:
   - cached approved cards remain visible
   - last refreshed timestamp does not update offline.

## Step 16: Coping tools (offline)

- New routes:
  - `/coping-tools`
  - `/breathing`
  - `/grounding`
- Works fully offline:
  - no backend required
  - usage counts and last-used timestamps are stored locally.

### Breathing tool

- Duration options:
  - `1 min`
  - `3 min`
  - `5 min`
- Pattern:
  - inhale `4s`
  - hold `2s`
  - exhale `6s`
- Controls:
  - Start, Pause/Resume, Stop
  - completion message and back to tools action.

### Grounding tool (5-4-3-2-1)

- Guided steps:
  - 5 see
  - 4 feel
  - 3 hear
  - 2 smell
  - 1 taste
- One step at a time with Back, Next, and Skip.
- Entered text is not persisted (privacy); only usage metadata is saved.

### Step 16 demo flow

1. Open **Coping tools** from Demo Hub.
2. Run a **1-minute breathing** session to completion.
3. Verify breathing usage count increases.
4. Open **Grounding** and complete all steps.
5. Verify grounding usage count increases.
6. Turn on airplane mode and repeat either tool:
   - both tools still work offline.
7. Restart app and verify coping usage counts persist.

## Step 17: Caregiver access (read-only)

- Patient flow:
  - Open **Settings** and tap **Manage caregiver invites**.
  - Generate a short-lived invite code (default 24h).
  - Revoke active invite codes when needed.
- Caregiver flow:
  - From login, tap **I’m a caregiver**.
  - Sign in with the invite code on `/caregiver-login`.
  - View read-only summary on `/caregiver-home`.
  - Open `/caregiver-weekly-report` for this/last week.

### Privacy and scope

- Caregiver views are strictly read-only.
- Caregiver endpoints do not expose:
  - chat contents
  - patient free-text notes
  - symptom photos
  - detailed body-map region lists
- Caregiver token is scoped to one linked patient only.

### Offline behavior

- Caregiver home and caregiver weekly report use local cache.
- When offline:
  - app shows `Offline — showing saved info.`
  - last refreshed is not updated.

### Step 17 demo flow

1. Patient signs in and opens **Settings → Manage caregiver invites**.
2. Generate invite code and copy/share it securely.
3. Sign out or switch user, open **I’m a caregiver** login.
4. Enter invite code and open **Caregiver** home.
5. Confirm summary + weekly preview are visible.
6. Turn offline and reopen caregiver home/report:
   - cached data remains visible with offline notice.

## Step 17 Add-on #2: Telerehab scheduling

- New patient route:
  - `/appointments`
- Demo Hub integration:
  - quick action **Appointments**
  - cached summary for pending request count and next approved time.

### Behavior

- Patient can browse available slots and submit requests while online.
- Request statuses are explicit: `pending`, `approved`, `rejected`, `canceled`.
- Offline mode:
  - cached slots/requests remain visible
  - booking/cancel actions are blocked with `Nothing was sent`.
- Approved appointments schedule a local notification 15 minutes before start time.

### Step 17 Add-on #2 demo flow

1. In dashboard, clinician opens **Appointments** and creates one upcoming slot.
2. In mobile, open **Appointments** and request a slot.
3. Back in dashboard, approve the request.
4. In mobile, refresh and verify request status is **Approved**.
5. Confirm reminder scheduling for the approved request.
6. Turn offline:
   - open **Appointments**
   - verify cached slots/requests are visible
   - verify booking actions are blocked.

## Step 17 Add-on #3: Wearables integration (stub/mock)

- New patient route:
  - `/wearables`
- Demo Hub integration:
  - quick action **Wearables**
  - cached summary line with connector state and average steps.

### Behavior

- Mock connector only (no HealthKit/Google Fit native SDKs in this step).
- **Mock sync last 7 days** generates deterministic daily rollups:
  - steps
  - active minutes
  - optional resting HR.
- Offline mode:
  - mock sync batches queue locally
  - cached summary remains visible
  - use **Sync now** when online to upload pending batches.
- Trust-under-failure keys:
  - refresh key `wearables`
  - error keys `wearablesLoad`, `wearablesSync`.

### Step 17 Add-on #3 demo flow

1. Open **Wearables** and enable **Mock wearable connected**.
2. While online, tap **Mock sync last 7 days**.
3. Verify summary updates (tracked days, average steps, active minutes).
4. Turn offline and tap **Mock sync last 7 days** again:
   - pending sync count increases
   - UI shows saved local data.
5. Turn online and tap **Sync now**:
   - pending count clears
   - summary refreshes from server.
6. Open **Weekly report** and verify the wearables block appears.
7. Open dashboard patient detail and verify **Wearables (last 7 days)** updates.

## How to Test Offline

- iOS simulator: disable network in simulator/device settings.
- macOS: temporarily disable active network adapter.
- Web: use browser devtools network mode and set it to `Offline`.
- When offline:
  - banner appears
  - guarded action shows a friendly blocked message
- When online again:
  - banner hides
  - guarded action runs normally

## Step 4/5 Usage Note

- Use `useGuardedAction({ isBlocked: isOffline })` for Send/Submit actions.
- Use `InlineNotice` for lightweight inline warnings/errors with retry affordances.
- Keep business/API logic out of these helpers and inject action callbacks from feature screens.

## Troubleshooting

- Metro bundler issues:
  - stop Expo, delete `node_modules` and reinstall dependencies.
- Web build/runtime failure:
  - rerun with `npm run start`
  - capture the failing command and error output from the terminal.
- Login works on native but not web:
  - verify `EXPO_PUBLIC_API_BASE`
  - check backend CORS configuration for your web origin
- Node runtime compatibility:
  - Expo SDK 54 is most reliable on Node LTS (20/22).
  - If you see `ERR_SOCKET_BAD_PORT`, switch Node version and use `npm run start`.
