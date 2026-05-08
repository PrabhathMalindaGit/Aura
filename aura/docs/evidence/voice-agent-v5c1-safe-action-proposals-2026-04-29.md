# Aura Voice Agent V5-C1: Safe Action Proposals Evidence

Date: 2026-04-29

## Summary

- V5-C1 was implemented as a mobile-only deterministic voice action proposal layer.
- It parses local text intent into whitelisted safe proposals.
- It shows visible review UI in the Voice Agent panel.
- Proposal-only drafts remain memory-only on `/voice-agent`.
- Actions come only from a local whitelist parser, not from Realtime model output.
- V5-C1 does not wire live Realtime transcript text into the proposal parser as an executable command source.

## Files Added

- `mobile/src/utils/voiceActionProposals.ts`
- `mobile/src/utils/__tests__/voiceActionProposals.test.ts`

## Files Changed

- `mobile/src/components/VoiceAgentSessionPanel.tsx`
- `mobile/src/components/__tests__/VoiceAgentSessionPanel.test.tsx`
- `mobile/src/components/__tests__/VoiceAgentSecurityGuard.test.ts`
- `mobile/app/voice-agent.tsx`

## Proposal Behavior Implemented

- Visible proposal UI with detected intent.
- Proposed action.
- Review reason.
- Memory-only draft preview where applicable.
- Accessible status updates.
- Local deterministic parser/router only.
- No Realtime tool-calling.

## Allowed Actions

- Open Check-in.
- Open Chat.
- Open Exercise plan.
- Open Appointments.
- Open Safety.
- Open Coping tools.
- Go back.
- Stop session.
- Stop reading.
- Show voice help.

## Proposal-Only Actions

- Start guided check-in screen.
- Draft check-in note only.
- Draft chat message only.
- Select appointment slot.
- Prepare hydration log.
- Prepare medication status.
- Prepare nutrition log.
- Prepare exercise completion.
- These only offer review/open-screen paths.
- They do not call mutation APIs.

## Blocked Actions

- Diagnosis.
- Treatment advice.
- Medication dose or schedule changes.
- Silent submit/send/book/log/upload.
- Alert creation.
- Emergency calling.
- Safety Router bypass.
- Clinician override.
- Suppress or ignore alert requests.

## Safety and Privacy Boundaries Preserved

- No backend changes.
- No Realtime tools.
- No server tool calling.
- No mutation APIs.
- No check-in submission by voice.
- No chat sending by voice.
- No appointment booking/canceling by voice.
- No medication/hydration/nutrition logging by voice.
- No photo upload by voice.
- No direct alert creation.
- No emergency call automation.
- No transcript persistence.
- No raw audio persistence.
- No draft storage.
- No URL-param draft passing.
- No OpenAI key exposure.
- No Safety Router behavior changes.
- No clinical routing behavior changes.

## Tests Added or Updated

- Parser coverage for allowed, proposal-only, blocked, mixed unsafe, and unknown intents.
- Panel tests for proposal UI, routing, draft clearing, stop/background/auth/expiry cleanup, blocked safe redirects, stop reading, voice help, no storage writes, no mutation calls, and no client secret rendering.

## Verification Results Recorded

- `npm test -- voiceActionProposals` passed.
- `npm test -- VoiceAgentSessionPanel.test.tsx` passed.
- `npm test -- voiceCommands` passed.
- `npm test -- todayScreen.test.tsx` passed.
- `npm test -- VoiceAgentSecurityGuard.test.ts` passed.
- `npm test` passed: 56 files / 377 tests.
- `npm run qa:web` passed.
- `git diff --check` passed.
- Existing React test-renderer / `act` warnings appeared but did not fail the suite.

## Intentionally Not Implemented

- No V5-D confirmed clinical/data-changing actions.
- No automatic submission.
- No automatic message sending.
- No automatic booking/canceling.
- No automatic medication/hydration/nutrition logging.
- No photo upload.
- No alert creation.
- No emergency call automation.
- No Safety Router bypass.
- No live Realtime transcript-to-command execution yet.

## Limitations

- V5-C1 reviews typed/local intent in the Voice Agent panel.
- Live Realtime transcript text is not yet wired into the proposal parser as an executable command source.
- V5-C1 is prototype support, not clinical validation.
- V5-C1 is not production voice-agent validation.
- Confirmed data-changing voice actions remain future V5-D work.
