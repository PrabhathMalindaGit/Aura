# Accessibility QA Checklist

## Touch Targets
- [ ] Primary and secondary buttons are at least 48px tall.
- [ ] Icon-only buttons are at least 48x48 with hit slop.
- [ ] Pressable rows are at least 56px tall.
- [ ] Small action buttons in banners remain easy to tap (minimum 44px tall).

## Screen Reader
- [ ] Icon-only controls include an explicit `accessibilityLabel`.
- [ ] Interactive controls expose `accessibilityRole="button"`.
- [ ] Disabled controls expose disabled state via accessibility state.
- [ ] Section titles are announced as headers where applicable.

## Dynamic Type
- [ ] iOS: Settings -> Accessibility -> Display & Text Size -> Larger Text.
- [ ] Android: Settings -> Display -> Font size and Display size.
- [ ] Verify no clipping in:
  - Buttons
  - Rows
  - Banners
  - Empty states

## Reduced Motion
- [ ] iOS: Settings -> Accessibility -> Motion -> Reduce Motion ON.
- [ ] Android: Developer options -> Animator duration scale OFF (if available).
- [ ] App still behaves correctly without motion-dependent transitions.
- [ ] Disclosure and status UI remain functional when reduced motion is enabled.

