# Mobile Sign-in Logo Branding - 2026-05-15

## Issue observed

The mobile sign-in page had the existing Aura background and working access-code flow, but the entry screen felt generic: the top header was a plain sign-in card, the security pill was oversized, and the page did not strongly identify the Aura brand.

## Logo/source used

- Searched the mobile project assets and app config first:
  - `mobile/assets/images/icon.png`
  - `mobile/assets/images/adaptive-icon.png`
  - `mobile/assets/images/splash-icon.png`
  - `mobile/assets/images/favicon.png`
  - `mobile/src/assets/backgrounds/aura-background.png`
  - `mobile/app.json`
- The existing icon and splash assets are Expo placeholders.
- Used the provided uploaded source logo from `/Users/prabhathmalinda/Downloads/LOGO.png`.
- Added:
  - `mobile/src/assets/brand/aura-logo.png`
  - `mobile/src/assets/brand/aura-brand-mark.png`
  - `mobile/src/assets/brand/index.ts`

## Files changed

- `mobile/app/(auth)/login.tsx`
- `mobile/src/app/__tests__/loginScreen.test.tsx`
- `mobile/src/assets/brand/aura-logo.png`
- `mobile/src/assets/brand/aura-brand-mark.png`
- `mobile/src/assets/brand/index.ts`
- `docs/evidence/mobile-signin-logo-branding-2026-05-15.md`
- `docs/evidence/screenshots/mobile-signin-logo-branding-2026-05-15.png`

## Behavior before/after

Before:
- Plain sign-in header with no Aura logo.
- Full-width `Secure sign-in` pill.
- Access-code and caregiver login flows were present.

After:
- Added a polished Aura brand header with the uploaded mark, `Aura`, and the subtitle `Rehabilitation support that keeps your recovery plan connected.`
- Replaced the full-width security pill with a compact `Secure patient access` trust badge.
- Added the note `Your check-ins and messages stay protected behind Aura access.`
- Kept the existing Aura background image, access-code input, Continue button, and caregiver option.
- Added compact local-dev demo chips for `P1-DEMO`, `P2-DEMO`, and `P3-DEMO`, gated behind `__DEV__` and localhost detection.

## Tests run

- `cd "/Users/University/Final Project/aura/mobile" && npm test -- Login SignIn Auth`
  - Pass: 1 test file, 5 tests.
- `cd "/Users/University/Final Project/aura/mobile" && npm test`
  - Pass: 66 test files, 625 tests.
- `cd "/Users/University/Final Project/aura/mobile" && npm run qa:web`
  - Blocked after TypeScript completed.
  - `scripts/web-stability-check.mjs` reported 12 pre-existing deprecated shadow style findings in `app/(tabs)/checkin.tsx`.
- `cd "/Users/University/Final Project/aura/mobile" && npx tsc -p tsconfig.json --noEmit`
  - Pass.
- `cd "/Users/University/Final Project/aura/mobile" && npm run a11y:smoke`
  - Pass: 0 failures.
  - Warning: existing `app/appointments.tsx:303` DomainIcon-in-Pressable accessibility warning.

## Manual preview result

- Requested command found port `8081` already occupied by an existing Expo server for this app, so the existing server at `http://localhost:8081` was used.
- Sign-in page rendered the Aura logo cleanly at mobile width.
- Logo size was balanced and not oversized.
- Background stayed subtle and readable.
- `P1-DEMO` chip plus Continue signed into the existing patient flow.
- `I’m a caregiver` navigated to `/caregiver-login`.
- Screenshot: `docs/evidence/screenshots/mobile-signin-logo-branding-2026-05-15.png`

## Limitations

- Full `qa:web` remains blocked by unrelated deprecated shadow props in `mobile/app/(tabs)/checkin.tsx`.
- The standalone a11y smoke check reports one unrelated warning in `mobile/app/appointments.tsx`.
- During manual route history testing, browser back from caregiver login briefly surfaced an Expo Router `stale` error page; a clean reload of `/` returned to the sign-in screen. The direct sign-in, patient login, and caregiver navigation checks passed.
