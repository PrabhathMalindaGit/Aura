# Web Stability Guardrails

## 1) Stability Principles (Non-Negotiable)

- One vertical scroll owner per screen:
  - Use `Screen(scroll={false}) + FlatList`, or
  - Use `Screen(scroll={false}) + one ScrollView`.
  - Do not use Screen default scroll while also rendering another vertical `ScrollView`/`FlatList` inside.
- Never combine on the same node (web):
  - `overflow: "hidden"` with `boxShadow`/`shadow*`/`elevation`.
  - `borderRadius + heavy shadow + overflow hidden` on one node.
  - Use wrapper split strategy: outer shadow wrapper, inner clip wrapper.
- Avoid forced remount animations:
  - Do not key trust/banner blocks by fast-changing state (`key={status.kind}`/`key={trust.kind}`) unless strictly required.
  - Prefer stable container nodes and update text/content in place.
- Effects must be idempotent under React Strict Mode:
  - Stable deps in `useEffect`/`useCallback`.
  - Guard in-flight async loads.
  - Avoid non-essential interval churn in frequently rendered UI.
- Blur rules:
  - Render BlurView/GlassPanel *after* `FlatList`/dynamic content in the tree.
  - Use blur as iOS-first; rely on tokenized fallback surfaces on web.

## 2) “Don’t Overdo It” Guardrails

- Blur:
  - Limit blur to `GlassPanel` footers and only where stable.
  - Prefer fallback surface on web if there is any repaint/jank.
- Gradients:
  - Use static gradients only (for example, `HeroHeader`).
  - No animated gradient stops/locations in common surfaces.
- Motion:
  - Web: prefer opacity-only transitions for frequently-updating nodes.
  - Respect reduced-motion by disabling transform/layout animations.
- Visual stacking:
  - Keep to at most 2 elevation layers per section.
  - Prefer fewer, stronger cards instead of deep nested card stacks.

## 3) Approved Patterns

### List Screen Template

- `Screen scroll={false}`
- `FlatList` as sole vertical scroller
- Top UI in `ListHeaderComponent`
- Optional `GlassPanel` footer rendered *after* the `FlatList`

### Wizard Template

- `Screen scroll={false}`
- One `ScrollView` for main content
- `GlassPanel` footer rendered *after* `ScrollView`

### Web Phone Frame Template

- Outer wrapper: layout/backdrop
- Middle wrapper: shadow (`boxShadow` on web)
- Inner wrapper: `borderRadius + overflow: hidden` only (no shadow)

## 4) Regression Checklist (Must Pass Before Merge)

- No nested vertical scrollers.
- No `shadow*` style props used in web-targeted files.
- No `overflow: "hidden"` + shadow/elevation on the same style object.
- Trust/Banner nodes are stable (no state-remount keys unless explicitly allowed).
- Reduced motion behavior verified.
- `npm run web` boot check passes.
- `npx tsc -p tsconfig.json --noEmit` passes.
- `node scripts/web-stability-check.mjs` passes (or fails only for known intentional blocks with documented waivers).

## 5) Debug Playbook (Fast Diagnosis)

- Flicker or flash:
  - Check nested scrollers first.
  - Check overflow+shadow combo in styles.
  - Check StrictMode double-load behavior (duplicate requests/state resets).
  - Check header duplication (`Screen title` + custom header at same time).
- `shadow*` deprecation warning on web:
  - Replace `shadow*` usage with `boxShadow` on web-facing styles.
- Blur not updating:
  - Ensure BlurView/GlassPanel is mounted after dynamic list content.

## 6) A11Y Smoke Check

- Run `npm run a11y:smoke` before merge.
- Requirement: `FAIL: 0` is mandatory.
- `WARN` items are advisory, but should be reviewed and resolved when practical.
