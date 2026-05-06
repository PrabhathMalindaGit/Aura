# Mobile Voice Assist V4-B Guided Check-in Panel Evidence

Date: 2026-04-29

## Summary

Mobile Voice Assist V4-B implemented a collapsed-by-default guided voice panel on the Check-in tab. The panel helps patients fill existing local check-in draft fields one at a time, and it writes values only after explicit patient confirmation.

The existing manual check-in flow remains authoritative. The guided panel does not render a Submit button, does not hide or disable the manual form, and does not create a duplicate submission path.

## Implemented Behavior

- Added a collapsed-by-default guided voice panel on the Check-in tab.
- Placed the panel only in the active Check-in form, near the top of `CheckinFlowShell`, before the current step card.
- The panel asks one question at a time.
- The panel supports:
  - Listen
  - Confirm
  - Retry
  - Skip
  - Edit manually
- The panel shows the transcript, interpreted value, confidence, and destination field before writing anything.
- Confirm writes only to existing local check-in draft fields.
- Retry clears the pending answer and writes nothing.
- Skip advances without writing.
- Edit manually guides the patient back to the manual form and writes nothing.
- The manual form remains visible and usable.
- The existing `Submit check-in` button remains the only path to `POST /patient/checkins` and the Safety Router.

## Supported Draft Fields

- Pain
- Mood
- Exercise completion
- Medication status
- Notes
- Sleep hours
- Sleep quality

## Out of Scope / Manual Only

- Body map
- Support need
- Safety state
- Medication dosage
- Diagnosis
- Treatment advice

## Safety and Privacy Boundaries

V4-B preserved the following boundaries:

- No auto-submit.
- No background listening.
- No wake word.
- No server STT.
- No external STT.
- No raw audio persistence.
- No hidden upload.
- No emergency calling.
- No alert creation.
- No `/rag/reply`.
- No diagnosis or treatment advice.
- No Safety Router bypass.
- Emergency-like speech in numeric/simple fields shows visible safety guidance and writes nothing.
- High-risk notes become draft text only after explicit confirmation and route through the Safety Router only if the patient later taps `Submit check-in`.

## Files Added

- `mobile/src/components/checkin/VoiceGuidedCheckinPanel.tsx`
- `mobile/src/hooks/useVoiceGuidedCheckin.ts`
- `mobile/src/utils/guidedCheckinSteps.ts`
- `mobile/src/components/checkin/__tests__/VoiceGuidedCheckinPanel.test.tsx`
- `mobile/src/utils/__tests__/guidedCheckinSteps.test.ts`

## Files Changed

- `mobile/app/(tabs)/checkin.tsx`
- `mobile/src/app/__tests__/checkinScreen.test.tsx`
- `mobile/README.md`

## Verification Recorded

- `npm test` passed: 48 files / 299 tests.
- `npm run qa:web` passed.
- TypeScript passed.
- Web guardrails and a11y smoke passed with `FAIL 0` and `WARN 0`.
- `npx expo-doctor` initially hit npm cache `EPERM`.
- `npm_config_cache=/private/tmp/aura-npm-cache npx expo-doctor` passed: 17/17 checks.
- `npx expo-modules-autolinking verify -v` passed: 31 modules found, `Everything is fine`.
- `git diff --check` passed.

## Manual QA Still Required

- iOS development build.
- Android development build.
- Microphone permission allow/deny.
- Low-risk guided check-in.
- Unclear answer retry.
- Manual edit after voice answer.
- High-risk pain followed by normal Submit routes like normal high-risk check-in.
- High-risk notes followed by normal Submit routes like normal high-risk check-in.
- Backgrounding while listening.
- Screen reader flow.
- Small-screen layout.
- Confirm there is never auto-submit.

## Limitations

- Manual native QA is still required.
- Speech recognition can mishear clinical values, especially pain and medication status.
- Confirmation and manual editing remain essential.
- Sleep is guided only when the existing daily context section is visible.
- V4-B is still prototype support, not clinical validation.
- V4-B is not a full autonomous voice agent.
