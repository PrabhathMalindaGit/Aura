# Mobile Phase V1 Voice Assist Evidence

Date: 2026-04-29

## Scope

Mobile Phase V1 Voice Assist was implemented as reviewed dictation only.

It adds speech-to-text dictation for:

- Chat composer
- Check-in notes

Users must review or edit the transcript before pressing the existing **Send** or **Submit** action.

## Safety And Product Boundaries

The implementation preserves these boundaries:

- No auto-send.
- No voice commands.
- No wake word.
- No background listening.
- No raw audio persistence.
- No server transcription endpoint.
- No direct `/rag/reply` call from mobile.
- Chat dictation still submits only through `/patient/chat/send`.
- Check-in dictation still submits only through `/patient/checkins`.
- Safety Router remains authoritative after submission.

Unsupported devices show a safe unavailable state and users can keep typing.

## Speech Recognition Approach

The mobile implementation uses `expo-speech-recognition@3.1.3`.

Native speech recognition requires a development or production build. Expo Go is not expected to support this native speech module.

## Files Added

- `mobile/src/components/VoiceDictationButton.tsx`
- `mobile/src/components/__tests__/VoiceDictationButton.test.tsx`

## Files Changed

- `mobile/app/(tabs)/chat.tsx`
- `mobile/app/(tabs)/checkin.tsx`
- `mobile/src/app/__tests__/chatTruth.test.tsx`
- `mobile/src/app/__tests__/checkinScreen.test.tsx`
- `mobile/package.json`
- `mobile/package-lock.json`
- `mobile/app.json`
- `mobile/README.md`

## Verification Recorded

- `npm test` passed: 40 files / 140 tests.
- `npm run qa:web` passed.
- `npx expo-doctor` initially failed due root-owned npm cache.
- `npm_config_cache=/private/tmp/aura-npm-cache npx expo-doctor` passed: 17/17 checks.
- `npx expo-modules-autolinking verify -v` passed and found `expo-speech-recognition@3.1.3`.
- `git diff --check` passed.

## Manual QA Still Required

- Microphone permission granted.
- Microphone permission denied.
- Noisy speech and mis-transcription review.
- Stop button.
- App backgrounding aborts listening.
- No raw audio files persisted.
- High-risk dictated chat text routes like typed high-risk chat.
- High-risk dictated check-in notes route like typed high-risk check-in notes.

## Limitations

- This is not a full voice agent.
- No text-to-speech yet.
- No voice commands yet.
- No voice-guided check-in yet.
- No clinical validation.
- Native speech recognition behaviour varies by device, OS, language, accent, noise, and network state.
