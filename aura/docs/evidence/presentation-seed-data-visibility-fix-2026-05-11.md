# Presentation Seed Data Visibility Fix Evidence

Date: 2026-05-11

## Issue Observed

- Settings could show the presentation seed panel as enabled while Scheduling still showed zero open capacity and zero visible requests.
- Runtime follow-up showed `POST /clinician/dev/presentation/seed` returning HTTP 409, so presentation seed load failed before Scheduling could receive seeded capacity or requests.
- A later runtime follow-up narrowed the remaining 409 to `communicationEvents:7` while seed status stayed `loaded: false` with zero counts and null metadata.
- Presentation seed records used fixed April/May 2026 dates, so current dashboard windows could hide appointments and patient health records.
- Some clinician-linked presentation records used the fixed logical clinician id `presentation-clinician`, while appointment APIs scoped records to the authenticated clinician id.
- `/patients/p1` is normal demo data, not a presentation-seed patient route.

## Root Cause

- Appointment slots and requests were created for the clinician that loaded seed, but several other presentation records still used fixed clinician identity values.
- Appointment slots were seeded for 2026-04-27 through 2026-05-03, outside the default Scheduling range after 2026-05-11.
- Check-ins, hydration, nutrition, medication logs, wearables, PROMs, exercise sessions, chat reviews, tasks, and insights used fixed April dates that could fall outside current rolling dashboard windows.
- The 409 was caused by preflight collision checks running before cleanup while reset only removed `demoTag: "presentation-seed"` records. Untagged legacy presentation records using reserved presentation patient IDs or deterministic presentation appointment links could block load and survive reset.
- The remaining `communicationEvents:7` collision was caused by legacy untagged `thread_opened` events for a presentation patient/thread (`patient_chat:presentation-maria-gonzalez`) on the `communication_inbox` surface. They were tied to an old clinician ObjectId, so the previous cleanup did not classify them as presentation-owned.

## Files Changed

- `server/src/services/presentationSeedService.ts`
- `server/src/routes/presentationSeed.routes.ts`
- `server/tests/presentationSeed.routes.test.ts`
- `dashboard/src/services/apiClient.ts`
- `dashboard/src/dashboard-v2/modules/settings/useSettingsViewModel.ts`
- `dashboard/src/dashboard-v2/modules/settings/useSettingsViewModel.test.tsx`
- `docs/evidence/presentation-seed-data-visibility-fix-2026-05-11.md`

## Implementation Summary

- Presentation seed now builds a relative timeline from the load date.
- Health trend data spans the current 14-day window and includes current 7-day health records.
- Appointment slots fall inside the current Scheduling week after seed load.
- Patient assignment, rehab update authors, tasks, alert assignment, coordination handoff ownership, threshold configs, recovery support configs, and appointment review snapshots use the authenticated clinician context.
- Presentation seed status/load responses include metadata with the first presentation patient id, patient ids, health date range, and appointment date range.
- Legacy fixed-date communication and appointment manifests remain recognized for safe local cleanup/reset behavior.
- Dashboard API types preserve the backend seed metadata and tests cover presentation-sensitive query invalidation.
- Load now performs safe presentation cleanup before preflight, so reserved presentation patient records and deterministic presentation appointment links are replaced idempotently.
- Reset now removes tagged records plus safely identifiable legacy presentation records: reserved presentation patient IDs, deterministic presentation appointment links, presentation-seed communication events, and presentation patient `thread_opened` interaction events on known dashboard communication surfaces.
- Genuinely unsafe untagged appointment/communication collisions still return HTTP 409 with diagnostic details.
- Settings keeps Reset available whenever backend presentation tools are enabled and surfaces 409 collision names from the backend response.

## Verification Commands and Results

- `cd "/Users/University/Final Project/aura/server" && npm test -- presentationSeed appointment appointments clinician dashboard`
  - Result after legacy communication event cleanup: passed, 16 test files and 98 tests.
  - Existing Mongoose duplicate-index warnings were printed.
  - Some clinician alert notification tests emit mocked n8n log events; no real n8n workflow/provider was activated.
- `cd "/Users/University/Final Project/aura/server" && npm run build`
  - Result: passed, `tsc -p tsconfig.json` completed with exit code 0.
- `cd "/Users/University/Final Project/aura/dashboard" && npm test -- SettingsRoute Appointments PatientWorkspace Insights Inbox clinicianApi`
  - Result: passed, 14 test files and 103 tests.
  - Existing React Router v7 future-flag warnings were printed.
- `cd "/Users/University/Final Project/aura/dashboard" && npm run build`
  - Result: passed, Vite transformed 4039 modules and built successfully.
  - Existing large chunk warning was printed.
- `cd "/Users/University/Final Project/aura" && git diff --check`
  - Result: passed with no whitespace errors.

## Route Checklist

- Settings: covered by tests for enabled/disabled tooling and load/reset actions.
- Today dashboard: backend date-relative appointments/tasks now land in current windows; runtime route check not performed.
- Worklist: clinician-linked presentation tasks now use the authenticated clinician; runtime route check not performed.
- Alerts/Governance: alert assignment now uses authenticated clinician when assigned; runtime route check not performed.
- Patients roster: presentation patient ids are exposed through seed metadata; runtime route check not performed.
- Patient workspace overview: health records now include current rolling data; runtime route check not performed.
- Patient workspace communications: communication records remain seeded and date-relative; runtime route check not performed.
- Patient workspace guidance: PROM/exercise/medication records now use current relative dates; runtime route check not performed.
- Patient workspace history: check-ins, hydration, nutrition, medication, and wearables now include current-window records; runtime route check not performed.
- Appointments/Scheduling: backend tests confirm current-week slots and pending requests are visible for the loading clinician.
- Insights/Follow-up: insight windows now end on the seed load date; runtime route check not performed.
- Communication inbox: communication reviews/events remain seeded and date-relative; runtime route check not performed.

## Seed Record Checklist

- patients: seeded, clinician-linked to loading clinician.
- clinicians: not seeded as `User` records.
- check-ins: seeded in current 14-day window.
- alerts: seeded; assigned alert uses loading clinician.
- care events: seeded.
- appointment slots: seeded in current Scheduling week.
- appointment requests: seeded and visible to loading clinician.
- tasks/worklist items: seeded and assigned to loading clinician.
- insights: seeded with current 14-day window.
- communication threads/events: seeded with current relative chat dates.
- hydration: seeded in current 14-day window.
- nutrition: seeded in current 14-day window.
- medication: schedules/logs seeded with current-window logs.
- wearables: seeded in current 14-day window.
- PROMs: seeded with current due/completed dates.
- exercise plans/sessions: seeded with recent sessions.
- symptom photos: not seeded.
- caregiver/recovery support records: recovery support configs seeded; caregiver invite/access records not seeded.

## Runtime and Browser Verification

- Runtime/browser verification was not performed.
- MongoDB was already running locally and was inspected read-only to identify the seven legacy communication event records.
- Backend dev server and dashboard dev server were not started by this verification pass.
- No screenshots were generated.

## Limitations

- Verification is static/unit/build-level plus API-route tests, not a live browser walkthrough against local MongoDB.
- The live browser Network check for `POST /clinician/dev/presentation/seed` returning 200 after Reset then Load remains to be performed.
- Existing dashboard route tests still rely on mocked API responses for broad route rendering.
- Symptom photos and caregiver invite/access records remain outside presentation seed scope.

Presentation/demo data is for local demo walkthroughs only and is not clinical validation.
