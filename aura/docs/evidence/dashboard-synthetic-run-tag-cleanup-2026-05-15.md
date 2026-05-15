# Dashboard Synthetic Run Tag Cleanup - 2026-05-15

## Issue observed

The clinician dashboard Today and communication preview surfaces could show raw local verification markers such as `[aura-n8n-provider-send-all:<run-id>]` in patient message text. These markers were created by local n8n provider-send verification and are useful for traceability, but they are not appropriate in clinician-facing demo UI.

## Root cause

Provider-send-all verification sends a synthetic high-risk patient chat message with a run marker in the message body. The backend keeps those local/demo records for evidence traceability, and the dashboard rendered `messagePreview` values directly in several Today, inbox, patient workspace, and legacy dashboard communication preview paths. Existing dashboard guards filtered `AURA_LATENCY_BENCH` benchmark records, but they did not sanitize provider-send-all markers embedded in otherwise useful high-risk message text.

## Files changed

- `dashboard/src/utils/syntheticRunTags.ts`
- `dashboard/src/utils/syntheticRunTags.test.ts`
- `dashboard/src/dashboard-v2/adapters/dashboard.ts`
- `dashboard/src/dashboard-v2/adapters/communication.ts`
- `dashboard/src/dashboard-v2/adapters/patientWorkspace.ts`
- `dashboard/src/dashboard-v2/modules/patient-workspace/usePatientWorkspaceViewModel.ts`
- `dashboard/src/services/communicationWorkspace.ts`
- `dashboard/src/services/communicationWorkspace.test.ts`
- `dashboard/src/utils/patientCompare.ts`
- `dashboard/src/utils/patientCompare.test.ts`
- `dashboard/src/utils/patientDetail.ts`
- `dashboard/src/components/dashboard/CommunicationOverviewCard.tsx`
- `dashboard/src/components/patients/PatientCommunicationPanel.tsx`
- `dashboard/src/pages/CommunicationPage.tsx`
- `dashboard/src/pages/DashboardHomePage.tsx`
- `dashboard/src/pages/PatientDetailPage.tsx`
- `dashboard/src/dashboard-v2/modules/analytics/DashboardRoute.test.tsx`
- `dashboard/src/dashboard-v2/modules/inbox/InboxRoute.test.tsx`

## Sanitizer behavior

Added a narrow dashboard text sanitizer for known local/evidence markers:

- Removes bracketed provider-send-all tags such as `[aura-n8n-provider-send-all:<run-id>]`.
- Removes bracketed latency benchmark tags such as `[AURA_LATENCY_BENCH:<run-id>]` when text reaches display code.
- Removes known n8n evidence tags such as `[AURA_N8N_TELEGRAM_RUNTIME:<run-id>]`.
- Removes the known synthetic evidence token `AURA_N8N_WORKFLOW_SUITE_SYNTHETIC`.
- Preserves normal patient text and normal bracketed content such as `[left knee]`.

Existing latency benchmark filtering remains intact for synthetic benchmark rows. Provider-send-all rows are not filtered away; the clinical message text remains visible after the marker is stripped.

## Cleanup behavior

No automatic database cleanup was added or run. This keeps n8n workflow verification and evidence traceability intact and avoids mutating local records outside an explicit operator action.

For local demo data hygiene, existing opt-in cleanup/reset paths remain:

- `cd "/Users/University/Final Project/aura/server" && npm run seed:reset` resets deterministic `demo-v1` local records and demo identities.
- Dashboard presentation tools can reset records marked with the backend `presentation-seed` tag when presentation tooling is enabled.

## Tests run

- `cd "/Users/University/Final Project/aura/dashboard" && npm test -- sanitize dashboard today inbox communication`
- `cd "/Users/University/Final Project/aura/dashboard" && npm run lint`
- `cd "/Users/University/Final Project/aura/dashboard" && npm run typecheck`
- `cd "/Users/University/Final Project/aura/dashboard" && npm test`
- `cd "/Users/University/Final Project/aura/dashboard" && npm run build`
- `cd "/Users/University/Final Project/aura" && git diff --check`

## Manual preview result

Backend health returned `{"status":"ok"}` at `http://localhost:3000/health`.

The dashboard dev server was started with `VITE_API_BASE_URL=http://localhost:3000 VITE_AURA_PRESENTATION_TOOLS_ENABLED=true npm run dev`. Port `5173` was already in use, so Vite served this run on `http://localhost:5174/`. The login page rendered, but browser sign-in was blocked by backend CORS because the backend allowed the normal `5173` origin, not the fallback `5174` origin.

Further Browser navigation was unavailable because the Browser tool reported a usage-limit block during the manual preview. Manual Today-page visual confirmation is therefore limited; automated component, route, full test, lint, typecheck, build, backend health, and diff checks completed.

## Limitations

- The sanitizer intentionally strips only known synthetic local/evidence markers and does not attempt broad UUID or bracket removal.
- Existing local provider-send-all records remain in the local database for evidence traceability unless an operator runs an explicit demo reset.
- Manual browser verification of the Today page was blocked by local port/CORS and Browser tool availability, not by a failing dashboard build.

