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
- `/settings`
- unknown paths redirect to `/alerts`

## Environment

Copy `.env.example` to `.env` and adjust if needed:

```bash
VITE_API_BASE_URL=http://localhost:3000
```

## Notes

- Legacy README preserved in `README_OLD.md`.
- Theme tokens are defined in `src/styles/tokens.css` and consumed by shared UI components.
- API helpers live in `src/services/apiClient.ts` with connection state in `src/services/connection.ts`.
