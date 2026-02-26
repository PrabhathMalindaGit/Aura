# Aura Mobile Illustrations Guide

## Illustration Keys
- `today`
- `progress`
- `chat`
- `weekly`
- `offline`
- `safety`
- `checkinSuccess`
- `syncing`

## Where to Use
- `today`: Home getting-started and general daily context empty states.
- `progress`: Progress history/trend empty states.
- `chat`: Chat conversation empty states.
- `weekly`: Weekly report and care-plan summary placeholders.
- `offline`: Full-screen offline fallback where no cached data exists.
- `safety`: Safety-support context only.
- `checkinSuccess`: Post check-in confirmation states.
- `syncing`: Pending upload / sync helper states.

## Style Rules
- Calm clinical tone only (teal/blue + neutral gray).
- Keep forms geometric and simple; avoid character/cartoon illustrations.
- Use consistent visual language across all assets.
- Danger/red accents should be minimal and only for safety/offline warnings.

## File Naming
- Store files in `/Users/University/Final Project/aura/mobile/src/assets/illustrations`.
- Prefix all files with `ill_`.
- Use lowercase snake case, for example `ill_progress_empty.png`.

## Performance Tips
- Keep files lightweight (target < 150 KB each).
- Prefer transparent PNG assets for broad Expo compatibility.
- Reuse the same asset by key through `EmptyState` instead of duplicating files.

