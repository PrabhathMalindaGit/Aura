# Aura Voice Agent V5-D2 Confirmed Voice Chat Send Evidence

Date: 2026-04-29

## 1. Summary

V5-D2 was implemented as a Chat-screen-only confirmed voice send flow.

The patient can review the exact trimmed draft, optionally hear the summary, listen for an explicit confirmation phrase, and send through the existing manual chat send path.

Dictation still only fills the draft and never sends.

## 2. Files Changed/Added

Changed:

- `mobile/app/(tabs)/chat.tsx`
- `mobile/src/app/__tests__/chatTruth.test.tsx`
- `mobile/src/components/VoiceDictationButton.tsx`

Added:

- `mobile/src/utils/voiceChatSendConfirmation.ts`
- `mobile/src/utils/__tests__/voiceChatSendConfirmation.test.ts`

## 3. V5-D2 Confirmed Chat-Send Behavior

Added a "Voice send review" card in the existing Chat composer area.

The card supports:

- Review for voice send
- Listen for confirmation
- Confirm send
- Cancel

The patient must review the exact trimmed message before sending.

The flow sends only after explicit confirmation.

## 4. Confirmation Model

Memory-only states:

- `draftReady`
- `needsMessage`
- `reviewMessage`
- `awaitingVoiceConfirmation`
- `confirmedSend`
- `cancelled`
- `sending`
- `sent`
- `highRiskRouted`
- `offlineBlocked`
- `expired`

Accepted confirmation phrases only:

- `yes send`
- `confirm send`
- `send message`

Rules:

- Ambiguous phrases do not send.
- Empty phrases do not send.
- Parser failure does not send.
- Recognition error does not send.
- Negative phrases do not send.
- Reviews expire after 30 seconds.
- Any raw draft change invalidates the review.

## 5. Send Path Safety

- Voice-confirmed send calls the same `handleSend()` path as manual Send.
- It validates that the reviewed draft is still current.
- It preserves trim/non-empty/read-only/offline validation.
- It preserves `sendChat`.
- It preserves assistant reply behavior.
- It preserves high-risk `/safety` navigation.
- No voice-only chat API was added.
- No direct alert creation was added.
- No Safety Router bypass was added.

## 6. Safety/Privacy Boundaries Preserved

- No backend routes.
- No backend API contract changes.
- No Realtime tool-calling.
- No OpenAI mobile keys.
- No `EXPO_PUBLIC_OPENAI_API_KEY`.
- No direct alert creation.
- No transcript persistence.
- No audio persistence.
- No unconfirmed draft persistence.
- Confirmation speech recognition uses `recordingOptions.persist=false`.
- No appointment booking/canceling.
- No medication/hydration/nutrition logging.
- No photo upload.
- No emergency calling.
- No diagnosis.
- No treatment advice.
- No medication dosage advice.

## 7. Tests Added/Updated

Recorded coverage for:

- empty/whitespace blocking
- exact review text
- accepted confirmation phrases
- ambiguous/negative/error/expired cases
- draft invalidation
- high-risk routing
- offline blocking
- unsafe action exclusions
- no key exposure
- accessibility labels/live status

## 8. Verification Results Recorded

- `npm test -- chatTruth.test.tsx voiceChatSendConfirmation.test.ts VoiceAgentSessionPanel.test.tsx` passed: 3 files / 71 tests.
- `npm test` passed: 57 files / 436 tests.
- `npm run qa:web` passed.
- Typecheck passed.
- Web guardrails passed with 0 issues.
- A11y smoke passed with 0 issues.
- `git diff --check` passed.
- Existing React test renderer / `act` warnings appeared but did not fail tests.

## 9. What Is Intentionally Not Implemented

- No `/voice-agent` Realtime transcript integration.
- No backend behavior changes.
- No server-side tools.
- No appointment/log/upload actions.
- No emergency calling.
- No diagnosis.
- No treatment advice.
- No medication dosage advice.
- No direct alert creation.

## 10. Limitations

- Confirmation depends on on-device speech recognition accuracy.
- Explicit phrase gate and exact visible review are the safety controls.
- The 30-second expiry is intentionally short.
- Ambiguous phrases do not refresh expiry.
- V5-D2 is prototype support, not clinical validation.
- V5-D2 is not production voice-agent validation.
