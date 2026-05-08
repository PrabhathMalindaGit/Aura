# Voice Agent V5-B2-Web Realtime Audio Evidence

Date: 2026-04-29

## Summary

Aura Voice Agent V5-B2-Web implemented browser-only live Realtime WebRTC audio on the mobile app's `/voice-agent` screen.

V5-B2-Web uses the existing V5-A backend broker at `POST /patient/voice/session` and the existing `createPatientVoiceSession(token)` mobile API helper to request a backend-created temporary Realtime client secret.

The implementation is web-only for this phase. Native iOS and Android do not start live audio and show web-demo-only copy instead.

## Implemented Web Experience

- Uses the existing `/voice-agent` screen.
- Uses `createPatientVoiceSession(token)`.
- Requests browser microphone permission only after the patient taps Start and after the session request succeeds.
- Creates `RTCPeerConnection` on Expo web/browser only.
- Attaches the local browser audio track.
- Creates a remote audio element for model audio.
- Posts SDP to `https://api.openai.com/v1/realtime/calls` using the temporary client secret.
- Transitions to live after the SDP answer is set.

## Files Added

- `mobile/src/utils/realtimeVoiceSession.ts`
- `mobile/src/utils/realtimeVoiceSession.web.ts`
- `mobile/src/utils/__tests__/realtimeVoiceSession.web.test.ts`

## Files Changed

- `mobile/app/voice-agent.tsx`
- `mobile/src/components/VoiceAgentSessionPanel.tsx`
- `mobile/src/components/__tests__/VoiceAgentSessionPanel.test.tsx`
- `mobile/src/components/__tests__/VoiceAgentSecurityGuard.test.ts`
- `mobile/README.md`

## Native Boundary

- Native iOS and Android do not start live audio in V5-B2-Web.
- Native iOS and Android show web-demo-only copy.
- No native WebRTC packages were added.
- `mobile/package.json` was not changed.
- `mobile/app.json` was not changed.

## Client Secret Handling

- `clientSecret.value` stays in memory only.
- `clientSecret.value` is never rendered.
- `clientSecret.value` is never logged.
- `clientSecret.value` is never stored.
- No AsyncStorage or SecureStore secret writes were added.
- No OpenAI API key was added to mobile.
- No `EXPO_PUBLIC_OPENAI_API_KEY` was added.

## Cleanup Behavior

The browser audio session and sensitive state are cleaned up on:

- Stop.
- Unmount.
- App background.
- Document hidden.
- Expiry.
- Token loss.
- Permission denial.
- WebRTC failure.
- Network failure.

Cleanup includes clearing session metadata and nulling the in-memory client secret reference.

## Safety And Privacy Boundaries

V5-B2-Web preserves the following boundaries:

- No transcript persistence.
- No raw audio persistence.
- No background listening.
- No always-on microphone.
- No tools.
- No app actions.
- No check-in submission.
- No chat sending.
- No appointment booking or canceling.
- No medication logging.
- No hydration logging.
- No nutrition logging.
- No uploads.
- No alerts.
- No emergency calling.
- No Safety Router bypass.
- Tests use mocked WebRTC/OpenAI behavior.
- No live OpenAI calls in automated tests.

## Verification Recorded

- `npm test` passed: 52 files / 324 tests.
- Existing `react-test-renderer` deprecation and `act` warnings appeared, but exit code was 0.
- `npm run qa:web` passed.
- TypeScript passed.
- Web guardrails passed: `FAIL 0` / `WARN 0`.
- A11y smoke passed: `FAIL 0` / `WARN 0`.
- `git diff --check` passed.

## Manual QA Still Required

- Backend disabled: Start shows safe unavailable copy.
- Backend enabled with real `OPENAI_API_KEY`: short web session connects.
- Browser microphone permission denied: safe denied state and no session leak.
- Stop button ends audio and clears session.
- Browser tab hidden / app background / route leave stops session.
- Network loss during SDP fetch clears session.
- Inspect console, storage, and UI: no client secret/transcript/audio persisted or logged.
- Check OpenAI usage after demo.

## Limitations

- Live browser testing has real OpenAI API cost and privacy exposure.
- Browser WebRTC/microphone support varies.
- Remote audio playback can depend on browser autoplay policies.
- Native live audio remains future development-build work.
- V5-B2-Web is not clinical validation.
- V5-B2-Web is not production voice-agent validation.
- No clinical actions by voice yet.
- No tool/action proposal layer yet.
