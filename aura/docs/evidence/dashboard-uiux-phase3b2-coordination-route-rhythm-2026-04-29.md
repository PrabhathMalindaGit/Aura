# Dashboard UI/UX Phase 3B-2 Coordination Route Rhythm Evidence

Date recorded: 2026-04-29

## Summary

Implemented Dashboard UI/UX Phase 3B-2 only.

Scope covered CSS-only visual rhythm polish for:

- Appointments
- Insights
- Communication inbox

No route behavior, API calls, copy, tests, docs, or backend code changed.

## Files Changed

Changed:

- `dashboard/src/dashboard-v2/modules/appointments/appointments.css`
- `dashboard/src/dashboard-v2/modules/insights/insights.css`
- `dashboard/src/dashboard-v2/modules/inbox/inbox.css`

## Appointments Rhythm Changes

- Compressed and quieted the status strip.
- Made planner and request review the stronger desktop workflow.
- Converted the desktop request lane into a vertical review rail.
- Softened capacity and publish panels.

## Insights Rhythm Changes

- Made the selected insight review surface more dominant.
- Widened the decision area against the support rail.
- Reduced framing in basis facts.
- Quieted support cards while keeping provenance/context visible.

## Communication Rhythm Changes

- Quieted inbox/status/summary chrome.
- Strengthened timeline and local private draft surfaces.
- Preserved existing timeline-before-draft stack.
- Kept queue/thread context visible but secondary.

## Copy Changes

- No copy changes were made.

## Accessibility Behavior Preserved

- No ARIA labels changed.
- No heading structure changed.
- No focus rings changed.
- No drawer behavior changed.
- No keyboard handlers changed.
- No selected-state semantics changed.
- No narrow-mode state logic changed.
- Existing focused route tests and a11y smoke passed.

## Safety/Product Boundaries Preserved

- No fake messaging added.
- No fake booking added.
- No fake scheduling added.
- No insight decision behavior changed.
- No backend/API changes.
- No unsupported clinical claims added.

## Tests Added/Updated

- No tests were added or updated.
- This was CSS-only, so no assertion copy churn was needed.

## Verification Results Recorded

- `npm run typecheck` passed.
- `npm test -- --run src/dashboard-v2/modules/appointments/AppointmentsRoute.test.tsx src/dashboard-v2/modules/insights/InsightsRoute.test.tsx src/dashboard-v2/modules/inbox/InboxRoute.test.tsx` passed: 3 files / 22 tests.
- `npm run e2e -- --grep "appointments v2|insights v2|communication v2"` passed: 5 tests.
- `npm run e2e -- tests/e2e/a11y-smoke.spec.ts --project=mocked` passed: 1 test.
- `npm run build` passed.
- `git diff --check` passed.

## Browser/Manual Visual QA

- Attempted with local preview.
- The app redirected to `/login` without mocked E2E API/auth setup.
- Manual route visual inspection was not completed.
- Automated mocked E2E covered the scoped routes.

## Remaining Phase 3B Items

Left untouched:

- Patients polish.
- Settings polish.
- Patient workspace polish.
- Final screenshot/manual QA evidence.
- Docs/evidence updates.

## Cautions and Limitations

- Full `npm test` was not run.
- Build still reports existing Vite large chunk warnings.
- Unit tests still print existing React Router future-flag warnings.
