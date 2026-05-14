# Mobile Final Demo Voice UI Scope Cleanup

## Why this was changed

The final mobile submission is scoped to the original Aura deliverables: daily check-ins, safety-gated chat, progress, exercise sessions, appointments, reports, caregiver access, and clinician-visible safety routing. Prototype voice features were visible in the patient app even though Voice Agent is outside the final Proposal/PID scope and is unreliable in Expo Web/mobile web.

This cleanup hides the visible voice and unsupported read-aloud entry points while keeping the source code reversible for post-viva work.

## Files changed

- `mobile/src/config/finalDemoScope.ts`
- `mobile/src/utils/globalVoiceCommandVisibility.ts`
- `mobile/app/(tabs)/index.tsx`
- `mobile/app/(tabs)/checkin.tsx`
- `mobile/app/(tabs)/chat.tsx`
- `mobile/app/appointments.tsx`
- `mobile/app/exercise-plan.tsx`
- `mobile/app/exercise-session.tsx`
- `mobile/src/app/__tests__/todayScreen.test.tsx`
- `mobile/src/app/__tests__/checkinScreen.test.tsx`
- `mobile/src/app/__tests__/chatTruth.test.tsx`
- `mobile/src/app/__tests__/appointmentsScreen.test.tsx`
- `mobile/src/app/__tests__/exercisePlanScreen.test.tsx`
- `mobile/src/app/__tests__/exerciseSessionScreen.test.tsx`
- `mobile/src/utils/globalVoiceCommandVisibility.test.ts`

## Behavior before and after

Before:

- Today showed an Aura Voice Agent card linking to `/voice-agent`.
- A global floating microphone command could render across patient screens.
- Check-in could show a voice-guided check-in panel and voice submit review flow.
- Messages could show voice dictation and a Voice send review panel.
- Appointment booking could show a voice request review flow.
- Exercise plan/session cards could render read-aloud controls and unsupported read-aloud messaging.

After:

- The visible Voice Agent card and `/voice-agent` shortcut are removed from Today.
- The global floating microphone command is hidden for the final demo scope.
- Check-in shows the manual form flow only.
- Messages keep the typed message composer and safety routing path without voice send UI.
- Appointment booking keeps normal slot selection and manual request behavior without voice review UI.
- Exercise plan/session content, controls, and safety note remain visible without read-aloud controls or permanent unsupported text.

## Tests run

- `cd "/Users/University/Final Project/aura/mobile" && npm test -- Voice Today CheckIn Messages Exercise`
- `cd "/Users/University/Final Project/aura/mobile" && npm test -- Voice Today CheckIn Messages Exercise Appointments Chat`
- `cd "/Users/University/Final Project/aura/mobile" && npm test`
- `cd "/Users/University/Final Project/aura/mobile" && npm run qa:web`
- `cd "/Users/University/Final Project/aura" && git diff --check`

All commands completed successfully.

## Manual preview result

Preview command requested:

```sh
cd "/Users/University/Final Project/aura/mobile" && EXPO_PUBLIC_API_BASE=http://localhost:3000 npx expo start --port 8081 --localhost
```

The first run hit the local file watcher limit (`EMFILE: too many open files, watch`). The preview was started successfully after raising the shell file descriptor limit for the Expo process.

Because `localhost:3000` was not reachable during preview, the authenticated patient app was checked in the browser with mocked patient API responses. The visible result:

- Today rendered without Voice Agent, Voice support, or Open Voice Agent UI.
- Check-in rendered the manual flow without the Voice-guided check-in panel.
- Messages rendered normal thread/composer UI without the Voice send review panel.
- Exercise plan rendered exercise content and the safety note without read-aloud controls or "Read-aloud is unavailable right now."
- The floating microphone command was not visible.
- Bottom navigation between Today, Check-in, Messages, Progress, and Settings remained present in the authenticated app shell.

## Limitations

- Voice source files and internal route code were intentionally retained for reversibility.
- Direct URL access to internal voice routes was not removed; visible navigation and shortcuts were removed from the patient app.
- Browser preview used mocked API data because the configured backend was unavailable.
