# Mobile Voice Assist V2 Read-Aloud Evidence

Date: 2026-04-29

## Summary

Mobile Phase V2 Voice Assist was implemented as user-controlled text-to-speech read-aloud support for Aura mobile.

The implementation uses `expo-speech@~14.0.8` and adds a reusable `ReadAloudButton` component for explicit Speak/Stop playback.

## Supported Read-Aloud Surfaces

- Assistant replies
- Exercise instructions
- Fixed safety guidance
- Selected check-in question/help text

## Controls

- Speak/Stop only
- No pause/resume in V2
- No automatic playback

## Safety And Privacy Boundaries

- No voice commands
- No auto-play
- No auto-submit
- No background listening
- No server-generated audio
- No external TTS
- No audio persistence
- No Safety Router bypass
- Patient-entered notes are not read automatically

## Surface-Specific Evidence

### Chat

- Read-aloud appears only on assistant replies.
- Read-aloud does not appear on patient messages.
- Read-aloud does not appear on system/safety cards.

### Exercise Instructions

- Exercise read-aloud reads visible exercise name, dose/status where visible, and instruction text only.

### Safety Screen

- Safety screen read-aloud speaks fixed visible support/safety guidance.
- Safety screen read-aloud does not navigate, call, message, submit, or escalate.

### Check-In

- Check-in read-aloud is limited to selected question/help text.
- Patient-entered notes are not read automatically.

## Files Added

- `mobile/src/components/ReadAloudButton.tsx`
- `mobile/src/components/__tests__/ReadAloudButton.test.tsx`

## Files Changed

- `mobile/package.json`
- `mobile/package-lock.json`
- `mobile/app/(tabs)/chat.tsx`
- `mobile/app/exercise-plan.tsx`
- `mobile/app/exercise-session.tsx`
- `mobile/app/safety.tsx`
- `mobile/app/(tabs)/checkin.tsx`
- Related mobile tests
- `mobile/README.md`

## Verification Results

- `npm test` passed: 41 test files / 154 tests.
- `npm run qa:web` passed.
- TypeScript passed.
- Web guardrails: FAIL 0 WARN 0.
- A11y smoke: FAIL 0 WARN 0.
- `npx expo-doctor` initially failed due npm cache `EPERM`.
- `npm_config_cache=/private/tmp/aura-npm-cache npx expo-doctor` passed: 17/17 checks.
- `npx expo-modules-autolinking verify -v` passed: Everything is fine.
- `git diff --check` passed.

## Manual QA Still Required

- iOS Speak/Stop.
- Android Speak/Stop.
- Web Speak/Stop or graceful unavailable state.
- Leaving chat/exercise/safety/check-in stops reading.
- App backgrounding stops reading.
- Multiple read-aloud buttons do not overlap audio.
- Safety guidance matches visible safety text.
- Exercise instructions read correctly.
- Patient-entered notes are not read automatically.
- Screen reader users can discover and operate controls.

## Limitations And Cautions

- Device voice availability and pronunciation vary.
- Reading aloud can expose PHI if others can hear.
- Screen reader audio may overlap with app TTS and requires manual QA.
- V2 is not a full voice agent.
- V2 does not add voice commands.
- V2 does not add voice-guided check-in.
- Clinical validation remains future work.
- Existing V1 speech recognition still requires development/production build for native dictation QA.
