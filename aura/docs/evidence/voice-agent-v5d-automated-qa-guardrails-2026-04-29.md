# Aura Voice Agent V5-D Automated QA Guardrails Evidence

Date: 2026-04-29

## Summary

Implemented the V5-D confirmed-action QA guardrail pass as a narrow test/safety hardening change.

No docs, backend, AI service, dashboard, Realtime broker/config, or report files were changed during implementation.

No commit was made.

A tiny production safety-hardening adjustment was made: cancellation phrases are now consistently conservative across all confirmed-action parsers, including “never mind”, “go back”, and cross-flow “do not …” phrases.

Confirmation phrases remain narrow.

## Files Added/Changed

Added:

- `mobile/src/utils/__tests__/voiceConfirmedActionsSafetyGuard.test.ts`

Changed:

- `mobile/src/app/__tests__/checkinScreen.test.tsx`
- `mobile/src/app/__tests__/chatTruth.test.tsx`
- `mobile/src/app/__tests__/appointmentsScreen.test.tsx`
- `mobile/src/app/__tests__/hydrationScreen.test.tsx`
- `mobile/src/app/__tests__/nutritionScreen.test.tsx`
- `mobile/src/app/__tests__/medicationsScreen.test.tsx`
- `mobile/src/components/__tests__/VoiceAgentSecurityGuard.test.ts`
- `mobile/src/utils/guidedCheckinParser.ts`
- `mobile/src/utils/voiceChatSendConfirmation.ts`
- `mobile/src/utils/voiceAppointmentRequestConfirmation.ts`
- `mobile/src/utils/voiceHealthLogConfirmation.ts`

## Cross-Flow Confirmed-Action Coverage

Tests were strengthened across the completed V5-D confirmed-action series:

- V5-D1 check-in submit
- V5-D2 chat send
- V5-D3 appointment request
- V5-D4A hydration log
- V5-D4B nutrition log
- V5-D4C medication status log

Coverage includes:

- Review-first behavior
- Explicit-confirmation-only behavior
- No ambiguous mutation
- Cancel clears state
- Expiry behavior
- Offline/validation preservation
- Unrelated mutation prevention

## Phrase, Expiry, and Invalidation Coverage

Shared parser guardrails were added for exact accepted phrase sets.

Generic ambiguous phrases are blocked across confirmed actions.

Screen-level ambiguous/cancel matrices were expanded.

Existing expiry and snapshot invalidation tests remain covered across flows.

Cancellation phrase handling is more conservative across all confirmed-action parsers.

## Same-Path Mutation Coverage

Check-in, chat, appointment, hydration, nutrition, and medication status flows retain same-path behavior.

Hydration delegation through `sendHydrationSync` is covered.

Nutrition delegation through `sendNutritionSync` is covered.

Existing screen tests cover check-in, chat, appointments, and medication dose action paths.

## Source-Guard Coverage

`VoiceAgentSecurityGuard` now scans V5-D screens, confirmation utilities, `/voice-agent`, and Realtime files.

It guards against:

- Forbidden APIs
- Cross-flow mutations
- Realtime tools
- `tool_choice`/function calls
- Persistence shortcuts
- OpenAI key exposure
- Direct alerts
- Voice Agent confirmed-action execution

## Accessibility Coverage

Existing and expanded screen tests verify review controls, confirmation controls, cancel controls, disabled state, live status, summaries, and readable safety/status text for V5-D panels.

## Verification Results Recorded

- Targeted required test command passed: 10 files / 336 tests.
- `npm test` passed: 64 files / 698 tests.
- `npm run qa:web` passed.
- TypeScript passed.
- Web guardrails passed: FAIL 0 / WARN 0.
- A11y smoke passed: FAIL 0 / WARN 0.
- `git diff --check` passed.
- Existing `react-test-renderer` deprecation and `act` warnings appeared but did not fail the suite.

## Remaining Manual QA

Manual VoiceOver/TalkBack spot checks on a real device are still useful.

Manual QA should focus on spoken order, tactile flow, and review panels.

## Cautions / Limitations

Source guards are conservative regex checks, so future legitimate refactors may need test updates.

This is automated QA evidence only, not clinical validation.

This is not production voice-agent validation.

Real microphone/speech-recognition behavior still requires manual/device QA.

## Suggested Commit Message

`docs(evidence): record voice confirmed-action guardrails`
