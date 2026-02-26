# Aura Illustration Assets

## Purpose
- Provide lightweight, calm clinical illustration helpers for empty/loading states.
- Keep visual language consistent across Home, Progress, Chat, Weekly Report, and safety/offline guidance.

## Naming Convention
- Prefix with `ill_`.
- Use screen/state intent in snake case, for example:
  - `ill_today.png`
  - `ill_progress_empty.png`
  - `ill_chat_empty.png`

## Add New Illustrations
1. Keep style minimal and clinical (teal/blue + neutral tones).
2. Prefer transparent PNG.
3. Keep file size small (target under 150KB).
4. Add the file to `/src/assets/illustrations/`.
5. Register the file in `/src/assets/illustrations/index.ts`.
6. Use the matching `illustrationKey` in `EmptyState`.

