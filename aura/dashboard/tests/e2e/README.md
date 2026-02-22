# E2E Verification Pack

## Run
- `npm run e2e`
- `npm run e2e:live` (opt-in real backend smoke)

## Debug
- `npm run e2e:ui`
- `npm run e2e:debug`
- `npm run e2e:trace <path-to-trace.zip>`

## Scope
- Deterministic browser checks for UI constraints:
  - 2-click acknowledge from Alerts Queue
  - 14/30 trend review + day drilldown workflow
  - a11y smoke checks on Alerts page and open drawer
- Live integration smoke (`tests/e2e/live.smoke.spec.ts`) for `/smoke` page when `LIVE_E2E=1`

## Network mocking
- All clinician API calls are mocked in `tests/e2e/helpers/mockApi.ts`.
- Tests intercept `**/clinician/**` routes and never depend on backend availability.
- Mock scenarios:
  - `default`
  - `ackSuccess`
  - `ackFail`
  - `offline`

The `live` Playwright project does not install mocks and validates real backend connectivity through `/smoke`.

## Fixtures and PHI safety
- Synthetic-only data lives in `tests/e2e/fixtures.ts`.
- No real names, no free-text clinical narratives, no PHI.

## Failure evidence
- Playwright is configured with:
  - `trace: retain-on-failure`
  - `screenshot: only-on-failure`
  - `video: retain-on-failure`
