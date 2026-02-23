# Aura Clinician Dashboard

React + TypeScript dashboard app for clinicians, scaffolded with a Vite-compatible structure.

## Quick Start

```bash
cd /Users/University/Final\ Project/aura/dashboard
npm install
npm run dev
```

## Routes

- `/alerts`
- `/patients`
- `/patients/:patientId`
- `/smoke`
- `/settings`
- unknown paths redirect to `/alerts`

## Environment

Copy `.env.local.example` to `.env.local` and adjust if needed:

```bash
VITE_API_BASE_URL=http://localhost:3000
```

## Live Smoke (real backend)

1. Start backend at `http://localhost:3000`.
2. Start dashboard with `npm run dev`.
3. Open `/smoke` to run endpoint checks against the configured API base URL.
4. Optional live E2E smoke:

```bash
npm run e2e:live
```

Live E2E runs only when `LIVE_E2E=1` is set by the script and skips early if backend health is unreachable.

## Dev auth helper for clinician APIs
If backend clinician RBAC is enabled, set a bearer token in localStorage for dashboard API calls.

1) Get token:
```bash
curl -sS -X POST http://localhost:3000/auth/clinician/login \
  -H "Content-Type: application/json" \
  -d '{"email":"clinician1@example.com","password":"devpass123"}'
```

2) In browser devtools console:
```js
localStorage.setItem('clinicianToken', '<TOKEN_FROM_LOGIN>');
```

## Notes

- Legacy README preserved in `README_OLD.md`.
- Theme tokens are defined in `src/styles/tokens.css` and consumed by shared UI components.
- API helpers live in `src/services/apiClient.ts` with connection state in `src/services/connection.ts`.
