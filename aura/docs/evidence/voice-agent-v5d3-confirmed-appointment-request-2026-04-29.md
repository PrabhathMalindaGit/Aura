# Aura Voice Agent V5-D3 Confirmed Appointment Request Evidence

Date: 2026-04-29

## 1. Summary

V5-D3 was implemented as a narrow mobile-only Appointments screen feature.

Patients can review a selected appointment request, then submit only after explicit voice or button confirmation.

It creates a pending appointment request, not a guaranteed appointment.

Appointment canceling by voice was not added.

## 2. Files Added/Changed

Changed:

- `mobile/app/appointments.tsx`

Added:

- `mobile/src/utils/voiceAppointmentRequestConfirmation.ts`
- `mobile/src/utils/__tests__/voiceAppointmentRequestConfirmation.test.ts`
- `mobile/src/app/__tests__/appointmentsScreen.test.tsx`

## 3. V5-D3 Confirmed Appointment Request Behavior

The Appointments screen now shows a "Voice request review" panel in Find time mode.

It blocks confirmation until a slot is selected.

It builds a memory-only snapshot of the selected slot plus optional trimmed note.

It shows the exact request summary.

It submits only after one of these confirmations:

- `yes request`
- `confirm request`
- `request appointment`
- pressing `Confirm request`

## 4. Confirmation Model

States:

- `draftReady`
- `needsSlot`
- `needsReason`
- `reviewRequest`
- `awaitingVoiceConfirmation`
- `confirmedRequest`
- `cancelled`
- `requesting`
- `requested`
- `offlineBlocked`
- `expired`
- `unavailableSlot`

Rules:

- Reviews expire after 30 seconds.
- Slot changes invalidate the snapshot.
- Note changes invalidate the snapshot.
- Ambiguous, error, nomatch, cancel, and negative phrases do not request.

## 5. Request Path Safety

Confirmed requests reuse the existing `handleRequestSlot(selectedSlot)` path.

That path calls `createAppointmentRequest`.

It uses the existing `POST /patient/appointments/requests` API.

No voice-only appointment API was added.

No backend route was added.

No validation bypass was added.

Successful response shows pending/request status, not direct booking.

Existing unavailable-slot/server-conflict behavior is preserved.

## 6. Safety/Privacy Boundaries Preserved

- No transcript persistence.
- No raw audio persistence.
- No unconfirmed draft persistence.
- No OpenAI key exposure.
- No `EXPO_PUBLIC_OPENAI_API_KEY`.
- No alert creation.
- No Safety Router bypass.
- No chat send.
- No check-in submit.
- No medication/hydration/nutrition logging.
- No upload calls.
- No emergency calling.
- No diagnosis.
- No treatment advice.
- No appointment canceling by voice.
- No `/voice-agent` Realtime transcript/tool behavior.
- No backend changes.
- No direct booking guarantee.

## 7. Tests Added/Updated

Recorded coverage for:

- explicit confirm/cancel/ambiguous parser phrases
- slot requirement
- exact review summary
- note preview
- explicit voice confirmations
- manual `Confirm request`
- ambiguous/error/nomatch/cancel/expired non-submit paths
- slot/note invalidation
- offline behavior
- unavailable slot handling
- pending request copy
- privacy boundaries
- accessibility labels/live status

## 8. Verification Results Recorded

- `npm test -- voiceAppointmentRequestConfirmation.test.ts appointmentsScreen.test.tsx` passed: 35 tests.
- `npm test` passed: 59 files / 471 tests.
- `npm run qa:web` passed.
- TypeScript, web guardrails, and accessibility smoke passed.
- `git diff --check` passed.
- Existing React test-renderer/act warnings appeared but did not fail the suite.

## 9. What Is Intentionally Not Implemented

- No appointment canceling by voice.
- No `/voice-agent` Realtime transcript/tool behavior.
- No backend changes.
- No direct booking guarantee.
- No medication/hydration/nutrition/photo/alert/emergency flows.
- No diagnosis.
- No treatment advice.

## 10. Limitations

- Voice request requires an already selected visible slot.
- It creates a pending appointment request only.
- Approval remains clinician-controlled.
- If availability changes, the existing request path surfaces the failure.
- V5-D3 is prototype support, not clinical validation.
- V5-D3 is not production voice-agent validation.
