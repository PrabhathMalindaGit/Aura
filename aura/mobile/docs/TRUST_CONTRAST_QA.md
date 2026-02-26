# Trust + Contrast QA

## Trust cue rules
- `TrustBanner` is the primary reliability message for `offline`, `serverDown`, and `syncing` states.
- `TrustCues` is secondary and compact: short pills only (`Offline`, `Pending N`, `Updated Xm`, `Saved locally`).
- Do not repeat full TrustBanner sentences inside page content.
- Use warning/info tones for trust states. Keep danger styling for safety-critical UI only.

## Manual QA scenarios
- Light mode:
  - Normal online state
  - Offline mode (airplane mode)
  - Service down (backend unavailable while online)
  - Syncing with pending items
- Dark mode:
  - Repeat all scenarios above
- Tabs to verify:
  - Home
  - Check-in
  - Chat
  - Progress
  - Settings

## What to check
- Trust banner appears once per screen, at the top banner region.
- Trust cues stay short and do not duplicate banner copy.
- `text` and `textMuted` remain readable in light and dark modes.
- Borders/dividers are visible but subtle on dark surfaces.
- Status pills and banners keep readable text/background contrast.
- Danger color is not used for offline/server/sync states.

## Quick test instructions
- iOS/Android: toggle system dark mode and revisit all tabs.
- Simulate offline: airplane mode or disable network.
- Simulate server down: keep network online, stop the local backend.
- Simulate syncing: create pending local items, then reconnect and verify pending cue updates.
