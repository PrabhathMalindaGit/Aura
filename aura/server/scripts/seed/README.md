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
  - access codes: `P1-DEMO`, `P2-DEMO`, `P3-DEMO`
- 2 clinician users for auth testing:
  - `clinician1@example.com` / `devpass123`
  - `clinician2@example.com` / `devpass123`
- 30-day check-in window with deterministic gaps (22 check-ins per patient)
- 14-day hydration log entries with deterministic gaps and daily variation
- 14-day nutrition log entries with deterministic gaps and enum variation
- 10 chat messages per patient
- 6 alerts with status variety (`open`, `acknowledged`, `resolved`)
- care_events timeline entries per alert
- 1 clinician-assigned exercise plan per demo patient
- 1 PROM template (`AURA_RECOVERY_5`) with deterministic scoring bands
- 4 PROM instances across demo patients (2 due, 2 completed)

## Notes

- `npm run seed` is deterministic and safe for repeat runs.
- `npm run seed:reset` explicitly clears only `demo-v1` records before reseeding.
