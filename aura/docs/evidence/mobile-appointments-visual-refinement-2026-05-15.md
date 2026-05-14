# Mobile Appointments visual refinement evidence - 2026-05-15

## Issue observed

- The Appointments screen worked functionally, but the header, planning overview, segmented control, summary tiles, and request cards felt visually heavier than the refined Today and Check-in screens.
- The mini summary cards used a rich shared card layout that was too constrained for narrow two-column content, causing awkward truncation such as "No upco..." and punctuation like "Pending: 1".
- Request cards inherited roomy media-card spacing, which made pending and missed appointments feel bulky and harder to scan.

## Root cause

- `MediaCard` is tuned for richer content blocks, not compact Appointments dashboard summaries.
- The planning copy and card padding were larger than necessary for a mobile scheduling surface.
- The segmented control used the default size, making navigation visually compete with the page content.

## Files changed

- `mobile/app/appointments.tsx`
- `mobile/src/components/SegmentedControl.tsx`
- `mobile/src/app/__tests__/appointmentsScreen.test.tsx`

## Behavior before/after

- Before: summary tiles could truncate "No upcoming" and displayed "Pending: 1"; after: the tiles show stacked, readable labels like "No upcoming", "Pending", and "1 waiting".
- Before: the planning overview used larger copy and a spacious layout; after: it keeps the same real data values in a more compact, scan-friendly layout.
- Before: request cards used generic media-card hierarchy; after: each request card emphasizes date/time, status badge, visit status, modality, and available actions with tighter spacing.
- Before: the segmented control felt large and could truncate on narrow mobile width; after: it uses the smaller mobile tab style with compact labels while preserving all view switching behavior.

## Tests run

- `cd "/Users/University/Final Project/aura/mobile" && npx tsc -p tsconfig.json --noEmit`
- `cd "/Users/University/Final Project/aura/mobile" && npm test -- Appointments appointments`
- `cd "/Users/University/Final Project/aura/mobile" && npm test`
- `cd "/Users/University/Final Project/aura/mobile" && npm run qa:web`
- `cd "/Users/University/Final Project/aura" && git diff --check`

## Manual preview result

- Existing Expo web server on `http://localhost:8081` responded.
- Preview first redirected to sign-in, then authenticated with the documented demo patient code `P1-DEMO` against the local backend at `http://localhost:3000`.
- `http://localhost:8081/appointments` showed the cleaner header, compact planning overview, readable summary tiles, and no "No upco..." truncation.
- `http://localhost:8081/appointments?mode=requests` showed the pending request card with date/time, missed status, visit status copy, modality chip, and the existing cancel request action.

## Limitations

- `npm run qa:web` is currently blocked by unrelated pre-existing Check-in guardrail failures for deprecated shadow styles in `mobile/app/(tabs)/checkin.tsx`.
- No backend/API contracts, scheduling logic, seed data, dashboard, AI, n8n, or safety routing behavior were changed.
