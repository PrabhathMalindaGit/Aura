# Dashboard Logo Branding - 2026-05-15

## Logo source used

- Used the uploaded logo at `/Users/prabhathmalinda/Downloads/LOGO.png`.
- Added dashboard assets:
  - `dashboard/src/assets/brand/aura-logo.png`
  - `dashboard/src/assets/brand/aura-logo-mark.png`
  - `dashboard/src/assets/brand/index.ts`
- Created the compact mark from the uploaded logo so the sidebar can stay narrow and readable without stretching the full wordmark.

## Files changed

- `dashboard/src/pages/ClinicianLoginPage.tsx`
- `dashboard/src/pages/ClinicianLoginPage.test.tsx`
- `dashboard/src/dashboard-v2/shell/ShellNav.tsx`
- `dashboard/src/dashboard-v2/shell/ShellNav.test.tsx`
- `dashboard/src/dashboard-v2/foundation/styles.css`
- `dashboard/src/styles/globals.css`
- `dashboard/src/assets/brand/aura-logo.png`
- `dashboard/src/assets/brand/aura-logo-mark.png`
- `dashboard/src/assets/brand/index.ts`
- `docs/evidence/screenshots/dashboard-login-logo-branding-2026-05-15.png`
- `docs/evidence/screenshots/dashboard-sidebar-logo-branding-wide-2026-05-15.png`

## Behavior before/after

Before:
- Login page relied on text-only Aura clinician workspace branding.
- Dashboard v2 sidebar used a simple blue plus-style mark beside `Aura` and `Clinician workspace`.

After:
- Login page shows the Aura logo mark next to the existing `Aura clinician workspace` and `Clinician access` copy.
- Sidebar brand mark uses the Aura logo mark while preserving the visible `Aura` and `Clinician workspace` labels.
- The logo is constrained with `object-fit: contain`, fixed shell dimensions, and non-stretching responsive sizing.
- Authentication flow, demo credentials, routes, API calls, and dashboard behavior were not changed.

## Tests run

- `cd "/Users/University/Final Project/aura/dashboard" && npm test -- ClinicianLoginPage ShellNav`
  - Pass: 2 files, 8 tests.
- `cd "/Users/University/Final Project/aura/dashboard" && npm run lint`
  - Pass.
- `cd "/Users/University/Final Project/aura/dashboard" && npm run typecheck`
  - Pass.
- `cd "/Users/University/Final Project/aura/dashboard" && npm test`
  - Pass: 83 files, 548 tests.
- `cd "/Users/University/Final Project/aura/dashboard" && npm run build`
  - Pass.
  - Vite emitted the existing large chunk warning after build.
- `cd "/Users/University/Final Project/aura" && git diff --check`
  - Pass.

## Manual preview result

- Ran `VITE_API_BASE_URL=http://localhost:3000 VITE_AURA_PRESENTATION_TOOLS_ENABLED=true npm run dev`.
- Opened `http://localhost:5173/login`.
- Login page shows the Aura logo cleanly without crowding the login card.
- `Use local demo credentials` plus `Sign in` successfully reached `/dashboard`.
- Sidebar shows the Aura mark with `Aura` and `Clinician workspace` on a wide viewport.
- The browser preview was in dark mode; the logo remained readable and the dashboard layout stayed otherwise unchanged.
- Screenshots:
  - `docs/evidence/screenshots/dashboard-login-logo-branding-2026-05-15.png`
  - `docs/evidence/screenshots/dashboard-sidebar-logo-branding-wide-2026-05-15.png`

## Limitations

- Manual preview used the active local backend at `http://localhost:3000`, which returned healthy during verification.
- Vite build still reports large chunk warnings unrelated to this branding change.
