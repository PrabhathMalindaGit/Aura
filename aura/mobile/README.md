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
- Keys are typed (`home`, `chat`, `checkins`, `progress`, `exercisePlan`) to keep usage consistent.
- Future data steps should call:
  - `setLastRefreshedNow("chat")` after successful chat-history load.
  - `setLastRefreshedNow("progress")` after successful check-ins/progress load.
- Home tab includes a local demo with “Mark ... refreshed” buttons and a dev-only clear action.
- No backend calls were added in Step 2.1.

## Last Error Scaffolding (Step 2.2)

- Persistent local error records are implemented in `src/state/lastError.ts`.
- Error keys are typed (`auth`, `checkinSubmit`, `chatSend`, `chatLoad`, `progressLoad`, `exercisePlanLoad`).
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
