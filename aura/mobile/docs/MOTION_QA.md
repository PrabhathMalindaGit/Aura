# Motion QA

## Principles
- Keep motion calm, short, and purposeful.
- Use motion to clarify state changes, not to decorate.
- Motion must never be required to understand the UI.

## Where Motion Is Applied
- Settings: Developer Mode disclosure reveal/hide.
- Check-in: More details accordion reveal/hide.
- Banners: `Banner` and `TrustBanner` fade/slide in gently.
- Press feedback: Row and button components use subtle press feedback.

## Reduced Motion Behavior
- Motion is gated via `useReducedMotion()`.
- When reduced motion is enabled:
  - Layout animations are skipped.
  - Fade/slide wrappers use instant transitions.
  - Press interactions use opacity only (no scale transforms).

## QA Checklist
- No bouncy or long animations.
- Accordion open/close is gentle and stable on native.
- Banners do not pop abruptly.
- Press feedback is consistent across rows and buttons.
- No clipped banner/content inside the web phone frame.

## Reduced Motion Testing
- iOS: Settings -> Accessibility -> Motion -> Reduce Motion ON.
- Android: Accessibility/System settings -> Remove animations (if available).
- Web: verify default behavior remains subtle and non-disruptive.
