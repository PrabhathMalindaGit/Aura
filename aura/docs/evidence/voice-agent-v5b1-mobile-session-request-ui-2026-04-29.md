# Voice Agent V5-B1 Mobile Session Request UI Evidence

Date: 2026-04-29

## Summary

Aura Voice Agent V5-B1 implemented a mobile-only Voice Agent session request prototype.

V5-B1 adds a patient-facing `/voice-agent` screen and reusable `VoiceAgentSessionPanel` so a signed-in patient can request a backend-created temporary Realtime session secret from `POST /patient/voice/session`.

The UI shows prepared-session status, safe session metadata, and expiry information. In V5-B1, "connected" means the prototype session is ready or prepared. It does not mean a live voice conversation has started.

## Implemented Mobile Experience

- Added `/voice-agent` screen.
- Added reusable `VoiceAgentSessionPanel`.
- Added Home/Demo Hub entry.
- Patient can request a backend-created temporary Realtime session secret from `POST /patient/voice/session`.
- UI shows prepared-session status and metadata.
- UI shows session expiry information.
- "Connected" means prototype session ready/session prepared, not live voice conversation.

## Files Added

- `mobile/app/voice-agent.tsx`
- `mobile/src/components/VoiceAgentSessionPanel.tsx`
- `mobile/src/components/__tests__/VoiceAgentSessionPanel.test.tsx`
- `mobile/src/components/__tests__/VoiceAgentSecurityGuard.test.ts`
- `mobile/src/app/__tests__/voiceAgentScreen.test.tsx`

## Files Changed

- `mobile/src/api/patient.ts`
- `mobile/src/api/patient.test.ts`
- `mobile/app/(tabs)/index.tsx`
- `mobile/src/app/__tests__/todayScreen.test.tsx`
- `mobile/README.md`

## API And Session Handling

- Added `createPatientVoiceSession(token)`.
- Sends authenticated `POST /patient/voice/session`.
- Sends no request body.
- Validates success shape:
  - `ok`
  - `clientSecret.value`
  - `clientSecret.expiresAt`
  - `session.id`
  - `session.model`
- Maps `404`, `401`/`403`, `429`, server, network, and timeout failures to safe user-facing messages.
- Does not expose raw upstream errors.

## Security And Privacy Boundaries

V5-B1 preserves the following boundaries:

- No live audio.
- No WebRTC.
- No native packages.
- No microphone session.
- No background listening.
- No app action tools.
- No clinical mutations.
- No check-in submission.
- No chat sending.
- No appointment booking or canceling.
- No medication logging.
- No hydration logging.
- No nutrition logging.
- No uploads.
- No alerts.
- No emergency calls.
- No Safety Router bypass.
- No mobile OpenAI API key.
- No `EXPO_PUBLIC_OPENAI_API_KEY`.
- No transcript storage.
- No raw audio storage.

## Client Secret Handling

- `clientSecret.value` stays in component memory only.
- `clientSecret.value` is never rendered.
- `clientSecret.value` is never logged.
- `clientSecret.value` is cleared on stop.
- `clientSecret.value` is cleared on unmount.
- `clientSecret.value` is cleared on backgrounding.
- `clientSecret.value` is cleared on expiry.
- `clientSecret.value` is cleared on error.
- `clientSecret.value` is cleared on missing token/sign-out detection.
- No AsyncStorage persistence.
- No SecureStore persistence.
- No mobile OpenAI environment key was added.
- Key scan found `OPENAI_API_KEY` / `EXPO_PUBLIC_OPENAI_API_KEY` only in the README boundary note, not mobile env/config or production code.

## Verification Recorded

- `npm test` passed: 51 files / 314 tests.
- `npm run qa:web` passed.
- TypeScript passed.
- Web guardrails passed: `FAIL 0` / `WARN 0`.
- A11y smoke passed: `FAIL 0` / `WARN 0`.
- `npx expo-doctor` initially failed due npm cache `EPERM`.
- `npm_config_cache=/private/tmp/aura-npm-cache npx expo-doctor` passed: 17/17.
- `npx expo-modules-autolinking verify -v` passed: 31 modules found, Everything is fine.
- `git diff --check` passed.
- Existing `react-test-renderer` deprecation warnings appeared but did not fail tests.

## Manual QA Still Required

- Backend disabled returns unavailable/prototype-disabled state.
- Backend enabled or stubbed response prepares a session and shows expiry.
- Stop clears prepared session.
- Backgrounding clears prepared session.
- Client secret never appears in UI or logs.
- No storage entry is created for client secret/transcript/audio.
- Clinical action flows remain untouched.
- Signed-out users are redirected to login.

## Limitations

- V5-B1 is session preparation UI only.
- No actual Realtime audio yet.
- No live conversation yet.
- No WebRTC yet.
- No tool/action proposal layer yet.
- No confirmed actions yet.
- V5-B2 must separately plan native Realtime audio/WebRTC and development-build QA.
- Not clinical validation.
- Not production voice-agent validation.
