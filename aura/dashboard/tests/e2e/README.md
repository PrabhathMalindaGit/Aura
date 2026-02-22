# E2E Verification Pack

## Run
- `npm run e2e`

## Debug
- `npm run e2e:ui`
- `npm run e2e:debug`
- `npm run e2e:trace <path-to-trace.zip>`

## Scope
- Deterministic browser checks for UI constraints:
  - 2-click acknowledge from Alerts Queue
  - 14/30 trend review + day drilldown workflow
  - a11y smoke checks on Alerts page and open drawer

## Network mocking
- All clinician API calls are mocked in `tests/e2e/helpers/mockApi.ts`.
- Tests intercept `**/clinician/**` routes and never depend on backend availability.
- Mock scenarios:
  - `default`
  - `ackSuccess`
  - `ackFail`
  - `offline`

## Fixtures and PHI safety
- Synthetic-only data lives in `tests/e2e/fixtures.ts`.
- No real names, no free-text clinical narratives, no PHI.

## Failure evidence
- Playwright is configured with:
  - `trace: retain-on-failure`
  - `screenshot: only-on-failure`
  - `video: retain-on-failure`
