# Aura Voice Agent V5-D1 Confirmed Check-in Submit Evidence

Date: 2026-04-29

## 1. Summary

Aura Voice Agent V5-D1 was implemented as a mobile-only, Check-in-screen-owned confirmed voice submit flow.

The patient can review the current check-in, hear or read a summary, listen for a conservative confirmation phrase, and submit through the existing check-in submit path.

`VoiceGuidedCheckinPanel` can request or open the review flow, but it does not own API submission.

## 2. Files Changed

- `mobile/app/(tabs)/checkin.tsx`
- `mobile/src/utils/guidedCheckinParser.ts`
- `mobile/src/components/checkin/VoiceGuidedCheckinPanel.tsx`
- `mobile/src/app/__tests__/checkinScreen.test.tsx`
- `mobile/src/components/checkin/__tests__/VoiceGuidedCheckinPanel.test.tsx`

## 3. V5-D1 Confirmed Check-in Behavior

V5-D1 added a compact "Voice submit review" panel on the final Review step.

The panel supports:

- Reviewing the current draft
- Reading the summary aloud
- Listening for confirmation
- Manual Confirm submit
- Canceling

Confirmed voice submit uses the same submit wrapper and path as manual Submit check-in.

## 4. Confirmation Model

Memory-only states include:

- `draftReady`
- `needsRequiredFields`
- `reviewSummary`
- `awaitingVoiceConfirmation`
- `confirmedSubmit`
- `cancelled`
- `submitting`
- `submitted`
- `highRiskRouted`
- `offlineBlocked`
- `expired`

Accepted voice confirmations only:

- `yes submit`
- `confirm submit`
- `submit check-in`

Rules:

- Ambiguous phrases do nothing.
- Cancel phrases clear the state.
- Confirmation expires after about 30 seconds.
- Any draft change invalidates the prior summary.

## 5. Submit Path Safety

- Voice-confirmed submit uses the same submit wrapper as manual submit.
- It still goes through existing validation.
- It preserves offline behavior.
- It calls `createCheckin`.
- It uses `POST /patient/checkins`.
- It preserves Safety Router handling.
- It preserves high-risk routing to `/safety`.
- No voice-only API was added.
- No direct alert creation was added.
- No Safety Router bypass was added.

## 6. Safety and Privacy Boundaries Preserved

- No Realtime transcript integration.
- No Realtime tools.
- No server-side tools.
- No backend changes.
- No transcript persistence.
- No raw audio persistence.
- No unconfirmed draft persistence.
- No OpenAI key exposure.
- No `EXPO_PUBLIC_OPENAI_API_KEY`.
- No emergency promise.
- No diagnosis.
- No treatment advice.
- No medication dosage advice.
- No chat sending.
- No appointment booking or canceling.
- No medication, hydration, or nutrition logging.
- No photo upload.
- No direct alert creation.

## 7. Tests Added or Updated

Recorded coverage for:

- Missing required fields
- Review summary content
- Explicit confirmations
- Ambiguous and negative phrases
- Expiry
- Draft invalidation
- Offline behavior
- High-risk routing
- Forbidden side effects
- Privacy and key boundaries
- Accessibility labels
- Live status
- Guided-panel ownership boundaries

## 8. Verification Results Recorded

The following verification results were recorded from the V5-D1 implementation result:

- `npm test -- checkinScreen.test.tsx VoiceGuidedCheckinPanel.test.tsx voiceActionProposals.test.ts` passed.
- `npm test` passed.
- `npm run qa:web` passed.
- `git diff --check` passed.
- Full mobile suite passed: 56 files / 401 tests.

## 9. What Is Intentionally Not Implemented

- No Realtime transcript confirmation.
- No Realtime tools.
- No server-side tools.
- No backend changes.
- No chat sending.
- No appointment booking or canceling.
- No medication, hydration, or nutrition logging.
- No photo upload.
- No alert creation.
- No emergency calling.
- No clinical advice behavior.

## 10. Limitations

- Voice confirmation is intentionally narrow and conservative.
- The patient must review the current summary first.
- Confirmation is time-limited.
- Changed drafts require a fresh review.
- On-device speech support depends on the platform and runtime capability already used by the guided flow.
- V5-D1 is prototype support, not clinical validation.
- V5-D1 is not production voice-agent validation.
