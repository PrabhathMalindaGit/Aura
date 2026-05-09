# Aura Voice Agent V5-C2 Safe Workflow Starts Evidence

Date: 2026-04-29

## Summary

Aura Voice Agent V5-C2 was implemented for the mobile app only.

V5-C2 adds safe route/control actions and safe workflow-start actions while keeping proposal review visible in the Voice Agent panel. It adds a safe guided check-in workflow start and does not add data-changing voice actions.

## Files Changed

- `mobile/src/utils/voiceActionProposals.ts`
- `mobile/src/components/VoiceAgentSessionPanel.tsx`
- `mobile/app/(tabs)/checkin.tsx`
- `mobile/src/components/checkin/VoiceGuidedCheckinPanel.tsx`
- Related parser, panel, check-in, guided check-in, and Realtime source-guard tests

## Route/Control Behavior Implemented

Allowed proposals now cover:

- Open check-in
- Open chat
- Open exercise plan
- Open appointments
- Open safety
- Open coping tools
- Go back
- Stop session
- Stop reading
- Voice help
- Guided check-in workflow start

## Guided Check-In Workflow-Start Behavior

The phrase "start guided check-in" routes to `/(tabs)/checkin` with only `voiceGuided=1`.

The route flag expands/starts the guided check-in surface state only.

It does not:

- Start microphone recognition
- Submit answers
- Autosave drafts
- Call `createCheckin`
- Pass clinical text through route params

Unknown or array route params are ignored safely.

## Safety/Privacy Boundaries Preserved

V5-C2 preserved the following boundaries:

- No mutation APIs
- No care-data writes
- No alert creation
- No Safety Router bypass
- No transcript persistence
- No draft persistence
- No raw-audio persistence
- No Realtime tools or handlers
- No live Realtime transcript command execution
- No mobile OpenAI key exposure

## What Is Intentionally Not Implemented

V5-C2 intentionally does not implement:

- V5-D confirmed actions
- Voice check-in submission
- Chat sending
- Appointment booking/canceling
- Medication/hydration/nutrition logging
- Photo upload
- Emergency calling
- Diagnosis, treatment, or dosage advice
- Realtime transcript/event command execution

## Verification Results Recorded

The following verification results were recorded from the V5-C2 implementation pass:

- Targeted test command passed: 5 files / 94 tests
- `npm test` passed: 56 files / 383 tests
- `npm run qa:web` passed
- TypeScript, web guardrails, and a11y smoke checks passed
- `git diff --check` passed
- Existing React test renderer / `act(...)` warnings appeared but did not fail the suite

## Limitations

- V5-C2 still depends on local typed/reviewed deterministic proposal parsing.
- Live Realtime transcript integration remains intentionally postponed for a later scoped version.
- V5-C2 is prototype support, not clinical validation.
- V5-C2 is not production voice-agent validation.
- Confirmed data-changing voice actions remain future V5-D work.
