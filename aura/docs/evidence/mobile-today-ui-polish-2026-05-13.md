# Mobile Today UI polish evidence - 2026-05-13

## Issue observed

- The Today tab reused full-size shared card typography in dense dashboard areas, making check-in, exercise, voice support, and recovery-tool cards feel heavy on mobile.
- The reviewed-insights empty state used the standard illustrated `EmptyState`, which made the "no reviewed insights" case look oversized and unfinished.
- The Today background was mostly flat cream, leaving large quiet areas feeling plain.

## Files changed

- `mobile/app/(tabs)/index.tsx`
- `mobile/src/components/Screen.tsx`
- `mobile/src/components/MediaCard.tsx`
- `mobile/src/components/TipCard.tsx`
- `mobile/src/components/TrackerTile.tsx`
- `mobile/src/app/__tests__/todayScreen.test.tsx`

## Behavior before/after

- Before: no reviewed insights showed a large illustration and the copy "No reviewed insights yet"; after: it shows a smaller inline card with a compact insights icon, the heading "No care-team insights yet", and clinician-approval wording.
- Before: Today card titles, body copy, and progress values used the default shared component scale; after: Today opts into calmer component density where needed, while section headings remain clear.
- Before: Today used the app's plain background color; after: Today passes an opt-in background layer to `Screen` with low-contrast cream/blue washes and faint dots. No remote assets were added.

## Data source confirmed

- Reviewed insights remain driven by `getCachedInsights(patientId)` in `mobile/app/(tabs)/index.tsx`.
- When cached reviewed insights exist, Today still renders the top insight and routes to `/insights`.
- When cached reviewed insights are empty, Today renders the compact empty state.

## Tests run

- `cd "/Users/University/Final Project/aura/mobile" && npm test -- Today insights home`
- `cd "/Users/University/Final Project/aura/mobile" && npm test -- Today insights home promFollowThrough`
- `cd "/Users/University/Final Project/aura/mobile" && npm test`
- `cd "/Users/University/Final Project/aura/mobile" && npm run qa:web`
- `cd "/Users/University/Final Project/aura" && git diff --check`

## Manual preview result

- Existing Expo web server on `http://localhost:8081` responded.
- A fresh Playwright context opened the preview but landed on the sign-in screen, so an authenticated Today tab visual inspection could not be completed without a patient access code or saved browser session.
- The unauthenticated preview confirmed the app boots in mobile viewport and the subtle app background remains low contrast.

## Limitations

- Authenticated manual confirmation of the reviewed-insights empty state, bottom-navigation overlap, and deeper Today scroll positions remains pending because the preview context was signed out.
- Automated Today tests cover the empty reviewed-insights copy, reviewed-insights available state, main section rendering, and preserved navigation routes.
