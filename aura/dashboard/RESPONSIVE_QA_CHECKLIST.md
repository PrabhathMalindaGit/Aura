# Responsive QA Checklist

## Breakpoints
- 390px (phone)
- 768px (tablet portrait)
- 1024px (tablet landscape / small desktop)
- 1440px (desktop wide)

## Global layout
- App shell at `>=900px`: sidebar visible, top bar shows title + connection + last updated.
- App shell at `<900px`: sidebar hidden, menu button opens mobile nav drawer.
- App shell at `<600px`: mobile nav opens full-screen sheet.
- Verify focus trap and `Escape` close behavior for mobile nav.

## Alerts page
- At 390px and 768px, alerts render as cards (not table).
- Each card keeps touch-friendly actions (`Open`, `Ack`, `Resolve`) with 48px targets.
- Open alert from card:
  - 390px and 768px: detail opens as a bottom sheet with `max-height: 92dvh`.
  - 1024px and 1440px: detail opens as a right drawer (`~480px` tablet, `~540px` desktop).
- Detail footer stays sticky with action buttons always reachable.
- Confirm the sheet body scrolls while the footer remains visible.
- Confirm footer + content respect iOS safe area (`env(safe-area-inset-bottom)`), with no content hidden behind actions.
- Long reason text uses show more/less in card and detail summary.
- No major jump between skeleton and loaded content.

## Patients list
- At 390px and 768px, patient cards render (not table).
- Search is always visible.
- `Filters` button opens filter sheet with:
  - status filter
  - recently active
  - sort
  - has open alerts toggle
  - missed check-ins toggle
- Filter sheet has `Apply filters` and `Reset` actions.
- `View` action is easy to tap and opens `/patients/:patientId`.

## Patient detail
- Summary cards:
  - 1024px: multi-column grid
  - 390px: stacked cards
- Charts are stacked and readable on phone with explicit height (~180px), ~240px on tablet, and ~280px on desktop.
- Verify no Recharts size warnings (`width/height 0`) when loading/resizing.
- Day detail opens as bottom sheet at phone width and right drawer on tablet/desktop.
- Day detail has sticky footer close button.

## Accessibility checks
- Visible focus ring on keyboard navigation.
- `Escape` closes mobile nav and drawers.
- Drawer/modal focus is trapped while open.
- Important info is not hover-only; labels remain visible on touch.

## Touch target checks
- Primary/action buttons are at least 48px height.
- Icon buttons are at least 48x48.
- Action rows in cards are tap friendly; no tiny text links.

## Container query checks
- KPI cards adapt by container width (not only viewport width):
  - narrow cards hide secondary helper text
  - primary KPI value remains visible and readable
- Bento/KPI cards do not overflow when cards become narrow.

## Regression checks
- `/alerts`, `/patients`, `/patients/:patientId`, `/settings` all render and navigate correctly.
- Last updated and connection status remain visible in top bar.
- Polling and action flows still function after responsive changes.
