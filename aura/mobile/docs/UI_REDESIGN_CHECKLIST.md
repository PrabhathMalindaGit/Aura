# UI Redesign Refactor Checklist (Mobile)

This checklist is for implementing the Aura Deep Research redesign on Expo Router mobile without changing product logic or backend contracts.

## A) Project Goal & Design Direction

- [ ] Keep the visual language calm clinical (blue/teal first, restrained emphasis colors).
- [ ] Keep Safety reachable from every core flow (Home, Check-in, Chat, Progress, Settings).
- [ ] Preserve trust-under-failure behavior and make failure states explicit, never hidden.
- [ ] Remove duplicate UI blocks and duplicate render paths before adding polish.
- [ ] Keep balanced density: concise summaries first, details progressive/disclosed.
- [ ] Use subtle gradients and clinical illustrations sparingly (supportive, not decorative noise).
- [ ] Accessibility first: readable type, large tap targets, reduced motion support.
- [ ] Expo Web demo should present as centered phone-frame, not stretched desktop cards.

## B) Baseline Capture (Before Refactor)

### Capture Current Screens

- [ ] Capture Home baseline screenshot.
- [ ] Capture Check-in baseline screenshot.
- [ ] Capture Chat baseline screenshot.
- [ ] Capture Progress baseline screenshot.
- [ ] Capture Settings baseline screenshot.
- [ ] Capture one offline-state screenshot.
- [ ] Capture one error/failed-sync screenshot.

### Duplicate/Clutter Symptoms to Confirm Later

- [ ] Verify and record if Settings repeats “Developer tools”.
- [ ] Verify and record if Progress repeats KPI blocks/sections.
- [ ] Verify and record if Chat repeats any UI container blocks.
- [ ] Verify and record if Check-in repeats form sections.

### Before/After Evidence Folder

- [ ] Create evidence folder: `aura/mobile/docs/screenshots-before/`
- [ ] Save baseline files:
  - [ ] `home-before.png`
  - [ ] `checkin-before.png`
  - [ ] `chat-before.png`
  - [ ] `progress-before.png`
  - [ ] `settings-before.png`
  - [ ] `offline-before.png`
  - [ ] `error-before.png`
- [ ] Create after folder: `aura/mobile/docs/screenshots-after/`
- [ ] Save matching after files with `-after` names.

## C) Where Things Live (Paths)

### Tab Routes & Layout

- [ ] `aura/mobile/app/(tabs)/_layout.tsx`
- [ ] `aura/mobile/app/(tabs)/index.tsx`
- [ ] `aura/mobile/app/(tabs)/checkin.tsx`
- [ ] `aura/mobile/app/(tabs)/chat.tsx`
- [ ] `aura/mobile/app/(tabs)/progress.tsx`
- [ ] `aura/mobile/app/(tabs)/settings.tsx`

### Shared UI, State, Utilities

- [ ] `aura/mobile/src/components/`
- [ ] `aura/mobile/src/state/`
- [ ] `aura/mobile/src/utils/`

## D) Phase-by-Phase Checklist

## PHASE 0 — Safety Refactor Setup

- [ ] Create branch: `codex/mobile-ui-redesign-phase0` (or team branch with same prefix intent).
- [ ] Define redesign DoD in branch notes/PR description before coding.
- [ ] Define non-negotiables:
  - [ ] No feature logic regressions.
  - [ ] No auth/session regressions.
  - [ ] No trust-under-failure regressions.
- [ ] Add explicit scope note: “UI structure and presentation only, no endpoint/state contract changes unless required for bug fix.”

### Phase 0 Acceptance Criteria

- [ ] Scope is written and agreed.
- [ ] Non-negotiables are visible in task/PR.
- [ ] No product logic changes started yet.

## PHASE 1 — Quick Wins (Stop “Broken App” Feeling)

- [ ] Hide/move Demo Hub + debug tools off Home.
- [ ] Move debug controls into Settings -> Developer Mode (collapsed, dev-only).
- [ ] Standardize one Screen wrapper strategy across all tabs (consistent spacing/background).
- [ ] Add a consistent banner region for offline/sync/server-down on Home/Check-in/Chat.
- [ ] Consolidate Settings sections so each block renders once.
- [ ] Consolidate Progress sections so KPI/summary/history render once.
- [ ] Run duplication bug checklist from Section E while doing this phase.

### Phase 1 Acceptance Criteria

- [ ] Home no longer feels like a debug surface.
- [ ] Key trust banner area appears in same visual position across target tabs.
- [ ] Settings and Progress show no repeated top-level content blocks.
- [ ] Tabs still function with existing logic/state.

## PHASE 2 — UI Foundation (Design System + Accessibility)

- [ ] Define semantic tokens for color/spacing/type/radius/elevation.
- [ ] Document light/dark usage rules for primary, secondary, muted, danger, success states.
- [ ] Define typography rules (hierarchy + scale) and 8pt spacing rhythm.
- [ ] Define reusable component blueprint:
  - [ ] Card
  - [ ] SectionTitle
  - [ ] Row
  - [ ] Chip
  - [ ] Banner
  - [ ] EmptyState
  - [ ] Skeleton
  - [ ] StatusPill
  - [ ] Buttons (primary/secondary/ghost/destructive)
- [ ] Accessibility checks:
  - [ ] Touch targets >= 44x44 (iOS) / 48dp (Android)
  - [ ] Dynamic type and font scaling checks
  - [ ] Contrast checks on text and status chips
  - [ ] Reduced motion fallback behavior
  - [ ] Screen reader labels for icon-only controls

### Phase 2 Acceptance Criteria

- [ ] Token system is used by all tab screens.
- [ ] Shared primitives replace ad-hoc repeated styles/components.
- [ ] Accessibility checklist passes in manual QA.

## PHASE 3 — Screen Refactors (Apply Foundation)

### Home (“Today dashboard”)

- [ ] Header with optional patient photo/avatar.
- [ ] Safety entry always visible.
- [ ] Primary CTA: Start check-in.
- [ ] Card set:
  - [ ] Today’s plan
  - [ ] Insights (max 1 preview card)
  - [ ] Weekly report summary
  - [ ] Next appointment
- [ ] States:
  - [ ] Loading skeleton
  - [ ] Empty state with restrained illustration
  - [ ] Offline banner

### Check-in

- [ ] Guided card flow/stepper structure.
- [ ] Add-on fields under collapsed “More details optional” accordion.
- [ ] Sticky footer CTA.
- [ ] Trust cues present:
  - [ ] Saved locally
  - [ ] Pending sync
  - [ ] Error + retry

### Chat

- [ ] Clean bubble hierarchy.
- [ ] Quick prompt chips.
- [ ] Delivery states visible (sending/sent/failed).
- [ ] Safety banner behavior routes clearly to Safety screen.

### Progress

- [ ] 7/30/90 range selector.
- [ ] KPI grid capped to 4-6 cards.
- [ ] Trend labels use text semantics (Improving/Stable/Needs attention), not color-only.
- [ ] Minimal trends view (no clutter).
- [ ] History list with empty/offline states.

### Settings

- [ ] Grouped sections:
  - [ ] Account
  - [ ] Reminders
  - [ ] Caregiver
  - [ ] Support/Safety plan
  - [ ] App info
  - [ ] Developer mode
- [ ] Developer mode is collapsed + dev-only.
- [ ] Developer mode renders once.

### Phase 3 Acceptance Criteria

- [ ] All five tabs share consistent layout rhythm and trust cues.
- [ ] Each tab supports loading/empty/error/offline states.
- [ ] No duplicate visual blocks remain on any tab.

## PHASE 4 — Polish (Product Feel)

- [ ] Add subtle motion transitions for screen/card state changes.
- [ ] Add reduced-motion fallback (no essential info hidden in animation).
- [ ] Add restrained clinical illustrations for empty/success/safety states.
- [ ] Add “trust cues” everywhere needed (last updated, pending sync chips).
- [ ] Run contrast + dark mode QA pass.
- [ ] Run final bug bash checklist.

### Phase 4 Acceptance Criteria

- [ ] Motion is calm and optional for reduced-motion users.
- [ ] Visual style feels consistent and production-ready.
- [ ] QA bug bash has zero P0/P1 visual regressions.

## E) Duplication Bug Checklist (High Detail)

### FlatList/SectionList Pitfalls

- [ ] Confirm `ListHeaderComponent` is not accidentally rendered inside `renderItem`.
- [ ] Confirm source `data` is not appended repeatedly across fetches/focus.
- [ ] Confirm `keyExtractor` is stable and unique for each list.

### StrictMode Double-Effect Symptoms

- [ ] Check effects for append patterns (`setState(prev => [...prev, ...new])`) where replace is intended.
- [ ] Ensure fetch/load effects are idempotent and cleanly canceled on rerender/unmount.
- [ ] Ensure mount/focus handlers do not duplicate section injection.

### Wrapper Duplication

- [ ] Confirm no nested top-level `Screen` wrappers that both render full content.
- [ ] Confirm web layout wrappers are not double-mounting tab content.

### Debug Steps

- [ ] Temporarily add distinct background colors to parent wrappers to detect duplicate layers.
- [ ] Log lengths for source arrays vs rendered arrays.
- [ ] Isolate suspicious blocks by commenting out one section at a time.
- [ ] Re-enable sections one by one to identify first duplicate source.

### Regression Guards

- [ ] Each tab has exactly one top-level Screen wrapper.
- [ ] Every list has stable `keyExtractor`.
- [ ] No effect appends duplicate items when re-triggered.

## F) Trust Under Failure (Explicit Copy Rules)

### Copy States

- [ ] Offline (saving locally):
  - [ ] “You’re offline. We’ll keep this on your device and sync when you’re back online.”
- [ ] Server down (service unavailable):
  - [ ] “Service is temporarily unavailable. Your data is safe; try again shortly.”
- [ ] Syncing (pending count):
  - [ ] “Syncing data… {n} item(s) pending.”

### Placement Checklist

- [ ] Home shows offline/server-down/syncing state summary.
- [ ] Check-in shows explicit submit safety state and sync result.
- [ ] Chat shows network state and failed-send retry cues.
- [ ] Progress shows stale/cached vs refreshed clarity.

## G) Expo Web Phone-Frame QA Checklist

- [ ] App is centered in a phone-width container on web.
- [ ] Outer page background remains neutral and non-distracting.
- [ ] Cards do not stretch to desktop-wide proportions.
- [ ] Scroll behavior works with keyboard open and content overflow.
- [ ] No nested scrolling traps in tab screens.

## H) Verification Commands (From Current Mobile Setup)

Source: `aura/mobile/package.json` scripts.

### Script Commands

- [ ] `npm run start`
- [ ] `npm run start:raw`
- [ ] `npm run android`
- [ ] `npm run ios`
- [ ] `npm run web`

### Additional Local Validation Command (non-script)

- [ ] `npx tsc -p tsconfig.json --noEmit`

## I) Final Definition of Done

- [ ] No duplicate blocks on any tab screen.
- [ ] Safety entry is reachable from all core tabs.
- [ ] Offline/server-down/syncing states are distinct and correct.
- [ ] Tabs are visually consistent, calm clinical, and balanced.
- [ ] Expo Web phone-frame demo looks like a real app screen flow.
- [ ] Accessibility checks pass (tap targets, scaling, contrast, reduced motion, labels).
