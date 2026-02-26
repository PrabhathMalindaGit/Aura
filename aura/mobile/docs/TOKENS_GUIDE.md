# Aura Mobile Tokens Guide

## Purpose
- Keep styling consistent through semantic roles instead of ad-hoc hex values.
- Support light and dark themes with the same component code.
- Preserve a calm clinical visual direction (blue/teal, clear hierarchy, accessible contrast).

## Token Source
- Use `/Users/University/Final Project/aura/mobile/src/theme/tokens.ts`.
- Read active tokens via `useTokens()`.
- Avoid hardcoding raw colors in components that can use semantic roles.

## Semantic Color Roles
- `background`: app/page background.
- `surface`: default card and control surface.
- `surfaceElevated`: lifted surfaces (subtle emphasis).
- `text`: primary readable text.
- `textMuted`: secondary/supporting text.
- `border`: standard dividers and outlines.
- `primary`: main CTA/action fill.
- `primaryTextOn`: text/icons placed on `primary`.
- `accent`: secondary highlight/chip/secondary action.
- `accentTextOn`: text/icons placed on `accent`.
- `success` / `successTextOn`: positive confirmations.
- `warning` / `warningTextOn`: caution or service degradation.
- `danger` / `dangerTextOn`: reserved for safety-critical UI only.
- `focusRing`: keyboard/screen-reader focus affordance where needed.
- `overlay`: modal/backdrop layer.

## Usage Rules
- Use `primary` for the single most important action in a section.
- Use `accent` for secondary emphasis or non-critical highlights.
- Use `warning` for temporary reliability issues (for example service unavailable).
- Use `danger` only in safety-critical contexts. Do not use it for routine status.

## Typography Guidance
- Use semantic tiers from tokens:
  - `title`: page-level headings.
  - `section`: section headers.
  - `body`: standard readable content.
  - `caption`: metadata, timestamps, helper text.
- Use token weights:
  - `regular` for long-form text.
  - `medium` for control labels.
  - `semibold` for headings and high-signal labels.
- Keep line heights from tokens to preserve readable rhythm.

## Spacing and Density
- Follow the 8pt rhythm from token spacing:
  - 4, 8, 12, 16, 20, 24, 32, 40.
- Prefer consistent section spacing before adding extra visual separators.
- Default screen padding comes from `tokens.layout.screenPaddingHorizontal` and `tokens.layout.screenPaddingVertical`.

## Radius and Elevation
- Use radius tokens (`sm`, `md`, `lg`, `xl`) instead of per-file values.
- Use subtle elevation tokens (`sm`, `md`) for raised cards only.
- For quiet containers, prefer border + surface over heavy shadows.

## Component Integration Priority
- Foundation-first:
  - `Screen` should define baseline background and padding from tokens.
  - `TrustBanner` should use semantic tones (offline/info, serverDown/warning, syncing/info).
  - `PrimaryButton` should use `primary` + `primaryTextOn` with accessible contrast.
- As components are touched, migrate raw values to semantic tokens incrementally.
