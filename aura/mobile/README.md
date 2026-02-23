# Aura Mobile (Expo)

## Run

```bash
cd "/Users/University/Final Project/aura/mobile"
npx expo start
```

In the Expo terminal:
- Press `i` for iOS simulator
- Press `w` for web
- Press `a` for Android emulator

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
- `src/api/`: API client and endpoint stubs (no backend calls yet).
- `src/config/`: env + app constants.
- `src/state/`: state shape stubs.
- `src/types/`: shared TypeScript models.
- `src/utils/`: tiny utility helpers.

API/auth/check-in/chat/progress wiring is intentionally deferred to Step 3+.

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
  - rerun with `npx expo start --clear`
  - capture the failing command and error output from the terminal.
- Node runtime compatibility:
  - Expo SDK 54 is most reliable on Node LTS (20/22).
  - If you see `ERR_SOCKET_BAD_PORT`, switch Node version and restart Expo.
