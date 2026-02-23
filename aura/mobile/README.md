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
