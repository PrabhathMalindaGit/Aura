# Mobile Weekly Report Flicker Fix - 2026-05-13

## Issue observed

Opening the patient Weekly report card from the Today tab could show the Weekly summary screen repeatedly returning to a loading state. A spinner appeared between the Review window controls and the This week at a glance section, creating a visible gap and making the page look like it was jumping or reloading.

## Root cause

Two related refresh loops were found:

- `mobile/app/weekly-report.tsx` loaded weekly report data from both `useFocusEffect` and `useEffect`. Its load callback depended on `useLastRefreshed()` and `useLastError()` objects whose memo identity changes when refresh/error metadata changes. A successful load called `refreshLocal()`, which could recreate the callback and trigger another load.
- `mobile/app/(tabs)/index.tsx` had the same dependency pattern in the Today tab weekly-report prefetch. The Today tab refreshed weekly report metadata after a successful prefetch, which could retrigger the focus callback and repeatedly call `/patient/reports/weekly`.

## Files changed

- `mobile/app/weekly-report.tsx`
- `mobile/app/(tabs)/index.tsx`
- `mobile/src/app/__tests__/weeklyReportScreen.test.tsx`
- `mobile/src/app/__tests__/todayScreen.test.tsx`

## Behavior before

- Weekly summary could repeatedly fetch the same week.
- The screen could briefly set `isLoading` again while report content was already present.
- A standalone spinner rendered between Review window and This week at a glance, causing an unstable visual gap.

## Behavior after

- Weekly summary uses one initial/week-change load path.
- Refresh/error helper methods are destructured so effects depend on stable callback functions instead of changing metadata objects.
- Overlapping weekly report requests are guarded with a latest-request ref so stale responses cannot replace the active week.
- Week switching clears stale report content only when the selected week changes and shows a reserved loading section.
- Refresh summary keeps the loaded content visible and uses the button loading state instead of inserting a page-level spinner.
- Today tab weekly prefetch no longer depends on the changing weekly refresh object.

## Tests run

- `cd "/Users/University/Final Project/aura/mobile" && npm test -- Weekly Report Summary Today`
- `cd "/Users/University/Final Project/aura/mobile" && npm test`
- `cd "/Users/University/Final Project/aura/mobile" && npm run qa:web`

## Manual preview result

Manual preview used:

- `cd "/Users/University/Final Project/aura/mobile" && EXPO_PUBLIC_API_BASE=http://localhost:3000 npx expo start --port 8082 --localhost`
- `http://localhost:8082`
- Patient access code `P1-DEMO`

Observed result:

- Today tab opened normally.
- Tapping Weekly report opened `/weekly-report`.
- The Weekly summary screen showed Review window followed by This week at a glance with no repeated spinner gap.
- This week and Last week controls remained usable.
- Refresh summary made one explicit weekly report request and kept loaded content stable.
- Bottom navigation remained visible and stable.
- Browser network check after the fix showed one Today prefetch, one Weekly screen load, one Last week load, one This week load, and one explicit Refresh request. After waiting, no additional repeated `/patient/reports/weekly` requests appeared.

## Limitations

- Expo printed package compatibility notices for minor Expo package patch versions during preview; this was not changed.
- React Native Web console still reports existing warnings about deprecated `shadow*` / `pointerEvents` props and existing DOM prop warnings for `accessible` / `importantForAccessibility`; these were not introduced by this fix and were outside the weekly flicker scope.
