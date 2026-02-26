# Mobile Render Duplication Root-Cause Note

## Root causes identified
- Non-idempotent load effect chains in tab screens:
  - `Chat` and `Progress` were using `useCallback` loaders with full hook objects in dependency arrays (`useLastError`, `useLastRefreshed` return objects).
  - Because those objects are re-created each render, loader callbacks changed identity frequently and re-triggered effects in dev/StrictMode.
- Missing overlap guard on async loaders:
  - `loadHistory` and `loadProgress` could overlap during rapid navigation/refresh, creating repeated state writes and unstable list UI.
- Data-level duplicate tolerance:
  - Check-in normalization did not dedupe by `id` before rendering/caching, so repeated records from upstream responses could show duplicated rows.

## How this was confirmed
- Static dependency audit on `Chat` and `Progress` loader callbacks/effects.
- List identity audit on `FlatList` data and key extraction paths.
- Route/layout audit confirmed no duplicate route mounting from `_layout.tsx` and `/(tabs)/_layout.tsx`.

## Fixes applied
- `Chat`:
  - Switched to stable primitive/function deps from `useLastError`/`useLastRefreshed`.
  - Added in-flight guard for history loading.
  - Added server-id dedupe for chat messages before state updates.
  - Added DEV-only warning if duplicate `localId` keys are detected.
- `Progress`:
  - Switched to stable primitive/function deps from `useLastError`/`useLastRefreshed`.
  - Added in-flight guard for progress loading.
  - Added dedupe by check-in `id` after sorting.
  - Switched list keyExtractor to stable `item.id`.
  - Added DEV-only warning if duplicate check-in ids are detected.
- Shared data path:
  - Added check-in dedupe by `id` in API normalization and check-ins cache normalization.

## Regression prevention guidance
- Avoid using full hook return objects as effect/callback dependencies.
- Keep list keys based on immutable identity fields, not indexes.
- Keep async loaders idempotent and overlap-safe (`inFlightRef` or cancellation).
- Deduplicate normalized API/cache arrays by identity before rendering.
