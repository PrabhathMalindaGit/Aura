# Mobile UI Voice and Tasks Polish - 2026-05-13

## Issue Observed

- Messages rendered the full "Voice send review" card whenever messaging was available, including inactive and cancelled states, which pushed the conversation and composer down.
- A later web preview still showed a compact "Voice confirmation" row with a Review button, plus the "Response delayed" workflow card above the message thread.
- Tasks could appear unstable after opening from Messages because focus loading depended on refresh/error objects whose identity changed after refresh state updates.
- Web read-aloud failures rendered the inline red text "Read-aloud is unavailable right now." inside exercise cards.
- Web voice dictation surfaced an inline device-unavailable message after pressing the mic, crowding the composer.
- Patient task and exercise cards used the default large MediaCard typography, making dense mobile lists feel oversized.

## Root Cause

- The Messages composer did not gate the expanded voice-send review UI on a pending voice-send snapshot or active confirmation state.
- Delayed communication task summaries were promoted into the chat thread even when the user mainly needed to see actual messages.
- The Tasks focus loader used whole hook result objects in callback dependencies; updating last-refreshed or last-error state recreated those objects and could re-run the focused effect.
- `ReadAloudButton` surfaced speech errors inline and rendered controls on web even though the speech runtime is unsupported there.
- `VoiceDictationButton` rendered on web even though the local speech recognition runtime is unsupported.
- Task/exercise cards did not opt into the existing calmer MediaCard density.

## Files Changed

- `mobile/app/(tabs)/chat.tsx`
- `mobile/app/tasks.tsx`
- `mobile/app/exercise-plan.tsx`
- `mobile/app/exercise-session.tsx`
- `mobile/src/components/ReadAloudButton.tsx`
- `mobile/src/components/VoiceDictationButton.tsx`
- `mobile/src/components/tasks/TaskCard.tsx`
- `mobile/src/app/__tests__/chatTruth.test.tsx`
- `mobile/src/components/__tests__/ReadAloudButton.test.tsx`
- `mobile/src/components/__tests__/VoiceDictationButton.test.tsx`

## Behavior Before / After

- Before: Messages always showed voice review affordances, first as a large panel and then as a compact confirmation row. After: Messages shows no voice review UI by default; pressing the mic on supported devices creates a dictated draft and then shows the explicit confirmation panel.
- Before: delayed response workflow prompts could sit above the message thread. After: Messages prioritizes the actual conversation and composer instead of rendering that card.
- Before: cancelled/expired voice-send states could leave review/status UI occupying the composer. After: those states collapse without sending or leaving a review row.
- Before: Tasks could reload after its own refresh status changed. After: focus loading depends on stable hook functions rather than mutable hook result objects.
- Before: unsupported read-aloud could show permanent red inline warning text. After: web hides read-aloud buttons and native speech failures do not render that noisy inline warning.
- Before: unsupported web dictation showed inline unavailable text under the mic. After: the mic is hidden on unsupported web runtime, avoiding a misleading dead control.
- Before: task and exercise cards used larger default card typography. After: Tasks and exercise plan/session cards use the existing `density="calm"` treatment, with slightly smaller Tasks story/support copy.

## Tests Run

- `cd "/Users/University/Final Project/aura/mobile" && npm test -- Messages Tasks Voice read aloud`
- `cd "/Users/University/Final Project/aura/mobile" && npm test -- chatTruth ReadAloud tasks`
- `cd "/Users/University/Final Project/aura/mobile" && npm test -- chatTruth VoiceDictation ReadAloud tasks`
- `cd "/Users/University/Final Project/aura/mobile" && npm test -- appointmentsScreen hydrationScreen medicationsScreen nutritionScreen`
- `cd "/Users/University/Final Project/aura/mobile" && npm test`
- `cd "/Users/University/Final Project/aura/mobile" && npm run qa:web`
- `cd "/Users/University/Final Project/aura" && git diff --check`

## Manual Preview Result

- Used the existing Expo web server at `http://localhost:8081` and signed in with `P1-DEMO`.
- Messages: normal message history and composer were visible in the latest mobile-width web preview; the "Response delayed" card, default "Voice confirmation" row, voice review panel, and unsupported dictation warning were absent; input and send remained visible.
- Tasks: opened from the Messages shortcut; task list rendered and stayed stable across a follow-up snapshot; no read-aloud warning or voice review text appeared.
- Today’s plan: exercise cards rendered with no read-aloud buttons on web and no red unsupported warning text.

## Limitations

- A later full `npm test` run passed 66 files and 715 tests after the final Messages refinements.
- Manual preview used the existing Expo server already running on port 8081.
