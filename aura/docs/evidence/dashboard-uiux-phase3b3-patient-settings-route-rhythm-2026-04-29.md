# Dashboard UI/UX Phase 3B-3 Patient and Settings Route Rhythm Evidence

Date: 2026-04-29

## Summary

Implemented Dashboard UI/UX Phase 3B-3 only.

Scope covered CSS-only visual rhythm polish for:

- Patients roster
- Settings
- Patient Workspace

No route logic, API behavior, copy, tests, docs, or clinical semantics changed.

## Files Changed

Changed:

- `dashboard/src/dashboard-v2/modules/patients/patients.css`
- `dashboard/src/dashboard-v2/modules/settings/settings.css`
- `dashboard/src/dashboard-v2/modules/patient-workspace/patient-workspace.css`

## Patients Rhythm Changes

- Quieted roster chrome.
- Tightened table spacing.
- Made row hover/open-patient affordance clearer.
- Softened secondary metadata.
- Made mobile patient cards easier to compare with lighter fact dividers.

## Settings Rhythm Changes

- Reduced over-framing across real settings sections.
- Made rows and chips calmer.
- Neutralized maintenance styling.
- Strengthened the demo/presentation panel as a caution-separated area without destructive styling.
- Preserved demo/presentation warning meaning and separation.

## Patient Workspace Rhythm Changes

- Reduced shell/card heaviness.
- Quieted repeated metadata.
- Made the current review strip and cockpit state more visually dominant.
- Preserved dark-mode rhythm with targeted overrides.
- Preserved tabs, workspace routing, symptom photo review, and honest photo fallback behavior.

## Copy Changes

No copy changes were made.

## Accessibility Behavior Preserved

- No semantic or component behavior changes.
- Focus rings remain visible.
- Browser probe confirmed visible skip-link focus on target routes.

## Safety/Product Boundaries Preserved

- No backend/API changes.
- No mobile changes.
- No AI changes.
- No n8n changes.
- No docs/evidence changes during implementation.
- No fake clinical actions.
- No patient-care claims.
- No photo interpretation.
- No settings feature changes.
- No seed/presentation behavior changes.

## Tests Added/Updated

- No tests were added or updated.
- CSS-only polish did not require test churn.

## Verification Results Recorded

- `npm run typecheck` passed.
- `npm test -- --run src/dashboard-v2/modules/patients/PatientsRoute.test.tsx src/dashboard-v2/modules/settings/SettingsRoute.test.tsx src/dashboard-v2/modules/patient-workspace/PatientWorkspaceRoute.test.tsx` passed: 27 tests.
- `npm run e2e -- --grep "patients v2|settings v2|patient workspace v2"` passed: 3 tests.
- `npm run e2e -- tests/e2e/a11y-smoke.spec.ts --project=mocked` passed: 1 test.
- `npm run build` passed.
- `git diff --check` passed.

## Browser/Manual Visual QA

- Performed with local Vite dev server plus lightweight in-browser route mocks because the plain dev route correctly hit the clinician session guard.
- Checked:
  - `/patients`
  - `/settings`
  - `/patients/p1`
  - `/patients/p1/communications`
  - `/patients/p1/guidance`
  - `/patients/p1/history`
- Checked at:
  - 1440px
  - 1280px
  - 1180px
  - 900px
  - 390px
- No page-level horizontal overflow.
- The only off-viewport control was the intended horizontally scrollable patient workspace tab strip on 390px.
- Dark-mode patient workspace route rendered without page overflow.
- No screenshot artifacts were kept, per scope.

## Remaining Phase 3C Items

Left untouched:

- Final QA sweep.
- Screenshot evidence.
- Docs/evidence summary update.
- Report/abstract work.
- Broad full-dashboard review.

## Cautions and Limitations

- Full npm test was not run.
- `npm run build` still reports the existing large chunk warning from Vite.
- Browser visual QA used lightweight mocks.
- No screenshot artifacts were kept.
