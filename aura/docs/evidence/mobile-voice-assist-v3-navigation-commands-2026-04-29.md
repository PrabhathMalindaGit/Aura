# Mobile Voice Assist V3: Navigation Commands Evidence

Date: 2026-04-29

## Summary

Mobile Voice Assist V3 was implemented as tap-to-use, navigation-only voice commands for signed-in patient mobile screens.

V3 reuses the existing `expo-speech-recognition` dependency from Voice Assist V1. It adds a deterministic command parser and a `VoiceCommandButton` component. Command text remains local and ephemeral.

## Supported Command Scope

V3 supports only:

- Open screens
- Go back
- Show help
- Stop read-aloud

## Allowed Route Map

| Voice command | Result |
| --- | --- |
| `open home` | `/(tabs)` |
| `open check-in` | `/(tabs)/checkin` |
| `open chat` | `/(tabs)/chat` |
| `open progress` | `/(tabs)/progress` |
| `open exercise plan` | `/exercise-plan` |
| `open appointments` | `/appointments` |
| `open reminders` | `/reminders` |
| `open safety guidance` | `/safety` |
| `open coping tools` | `/coping-tools` |
| `open hydration` | `/hydration` |
| `open medications` | `/medications` |
| `open symptom photos` | `/symptom-photos` |
| `open caregiver` | `/caregiver-invite` |
| `go back` | Router back action |
| `stop reading` | Stop current read-aloud |
| `help` | Show supported commands |

## Unsupported And Unsafe Commands

Disallowed or unsafe commands are rejected with:

> Command not supported. Voice commands can only open screens or stop reading.

Unsafe command examples include:

- `submit check-in`
- `send message`
- `book appointment`
- `cancel appointment`
- `log medication`
- `upload photo`
- `call emergency`
- `message clinician`
- `set pain level`
- Mixed commands such as `open chat and send message`

## Safety And Privacy Boundaries

V3 does not:

- Submit forms
- Send chat
- Book or cancel appointments
- Upload photos
- Log medication, hydration, or nutrition
- Create alerts
- Call emergency services
- Pass command text to `/rag/reply`
- Call chat or check-in mutation paths
- Store command text
- Use wake word listening
- Use background listening
- Use server STT
- Use external STT
- Persist raw audio

Safety grep over the new command path found no matches for chat/check-in/appointment/photo/clinical mutation APIs, `/rag/reply`, storage, or logging calls.

## Read-Aloud Integration

V3 added a `stopReadAloud()` helper and wired the `stop reading` command to the existing V2 read-aloud behavior.

The implementation did not add `read this screen`.

## Global Placement

`VoiceCommandButton` is mounted only for signed-in patient routes.

It is hidden on auth routes and caregiver-session routes:

- `/caregiver-login`
- `/caregiver-home`
- `/caregiver-weekly-report`

`/caregiver-invite` remains the patient destination for `open caregiver`.

## Files Added

- `mobile/src/utils/voiceCommands.ts`
- `mobile/src/utils/__tests__/voiceCommands.test.ts`
- `mobile/src/utils/readAloud.ts`
- `mobile/src/utils/readAloud.test.ts`
- `mobile/src/utils/voiceCommandVisibility.ts`
- `mobile/src/utils/voiceCommandVisibility.test.ts`
- `mobile/src/components/VoiceCommandButton.tsx`
- `mobile/src/components/__tests__/VoiceCommandButton.test.tsx`

## Files Changed

- `mobile/src/components/ReadAloudButton.tsx`
- `mobile/app/_layout.tsx`
- `mobile/app.json`
- `mobile/README.md`

## Verification Results

- `npm test` passed: 45 test files / 201 tests.
- `npm run qa:web` passed.
- TypeScript passed.
- Web guardrails and a11y smoke were clean.
- `npx expo-doctor` initially failed due npm cache `EPERM`.
- `npm_config_cache=/private/tmp/aura-npm-cache npx expo-doctor` passed: 17/17 checks.
- `npx expo-modules-autolinking verify -v` passed; warning only about `NO_COLOR` ignored due `FORCE_COLOR`.
- `git diff --check` passed.

## Manual QA Still Required

- iOS development build: allow and deny microphone and speech permissions.
- Android development build: allow and deny microphone and speech permissions.
- Try every supported command.
- Try unsafe commands and confirm no mutation or navigation beyond safe rejection.
- Confirm chat/check-in dictation still requires manual send/submit.
- Confirm backgrounding stops listening.
- Confirm `stop reading` stops active read-aloud.
- Confirm screen reader labels, status, and help panel are usable.
- Check floating global control on small devices for overlap with bottom UI.

## Limitations

- Native speech recognition requires a development or production build; Expo Go is not expected to support this reliably.
- Speech recognition can mishear accents or noisy rooms.
- Unknown or clinical-sounding speech is rejected rather than inferred.
- `read this screen` was not added.
- V3 is not a full voice agent.
- V3 does not perform clinical actions by voice.
- Clinical validation remains future work.
