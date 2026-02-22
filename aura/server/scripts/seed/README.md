# Demo Seed Runbook

This seed script creates deterministic demo data for clinician dashboard workflows.

## Safety

- Uses `demoTag: "demo-v1"` on every seeded document.
- Reset deletes only documents tagged with `demoTag: "demo-v1"`.
- No PHI is generated or logged.

## Commands

```bash
cd /Users/University/Final\ Project/aura/server
npm run seed
npm run seed:reset
```

## What gets seeded

- 3 patients (`active`, `on_hold`, `discharged`)
- 2 clinician users for auth testing:
  - `clinician1@example.com` / `devpass123`
  - `clinician2@example.com` / `devpass123`
- 30-day check-in window with deterministic gaps (22 check-ins per patient)
- 10 chat messages per patient
- 6 alerts with status variety (`open`, `acknowledged`, `resolved`)
- care_events timeline entries per alert

## Notes

- `npm run seed` is deterministic and safe for repeat runs.
- `npm run seed:reset` explicitly clears only `demo-v1` records before reseeding.
