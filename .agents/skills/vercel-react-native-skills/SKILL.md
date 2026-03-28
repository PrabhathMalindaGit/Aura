---
name: vercel-react-native-skills
description: React Native and Expo best practices for performance, animations, navigation, list rendering, UI patterns, and native-friendly architecture.
---
# React Native Skills

Use this skill when building or reviewing React Native or Expo applications.

## When to Apply

Reference these guidelines when:

- Building new screens or navigation flows
- Optimizing list and scroll performance
- Implementing animations or gestures
- Working with images, fonts, or native modules
- Organizing monorepo packages that include native dependencies

## Priority Order

Apply fixes in this order:

1. List performance
2. Animation
3. Navigation
4. UI patterns
5. State management
6. Rendering correctness
7. Monorepo structure
8. Configuration details

## Core Guidance

### 1. Lists and Scroll Performance

- Use FlashList or another virtualization-first approach for large datasets
- Memoize list items and stabilize callbacks passed to them
- Avoid inline style objects and freshly created functions inside item render paths
- Optimize list images aggressively
- Move expensive formatting and computation outside list items
- Use item typing support for heterogeneous rows when the list library supports it

### 2. Animation

- Animate GPU-friendly properties such as `transform` and `opacity`
- Use Reanimated primitives intentionally, including derived values for computed animation state
- Prefer gesture-native patterns over JS-heavy interaction wrappers when available

### 3. Navigation

- Prefer native stack and native tab navigators over heavier JS-driven alternatives
- Keep screen transitions and back behavior platform-appropriate
- Avoid navigation setups that duplicate state or cause unnecessary remounts

### 4. UI Patterns

- Prefer `expo-image` for images in Expo apps
- Prefer `Pressable` over older touchable components unless there is a clear reason not to
- Handle safe areas explicitly, especially inside `ScrollView`
- Use native-feeling menus and modal surfaces when the platform offers them
- Measure layout with `onLayout` rather than imperative `measure()` calls when possible
- Keep styling consistent with `StyleSheet.create` or a disciplined utility approach like NativeWind

### 5. State Management

- Minimize subscriptions so components only re-render for data they actually need
- Use dispatcher patterns or stable callbacks to limit prop churn
- Show safe fallbacks on first render for async or device-driven state
- Keep React Compiler compatibility in mind when destructuring functions or using shared animated values

### 6. Rendering Correctness

- Wrap displayed text in `Text` components
- Avoid relying on falsy `&&` patterns that can render unintended primitives
- Verify layouts on both iOS and Android, especially around text sizing and safe areas

### 7. Monorepos

- Keep native dependencies in the actual app package unless you have a proven setup for shared native modules
- Use one version per native dependency family across packages
- Be careful with shared packages that import platform-specific code into the wrong target

### 8. Configuration

- Use config plugins for custom fonts and native setup where possible
- Keep design-system imports organized and predictable
- Hoist repeated `Intl` object creation or similar expensive setup

## Review Checklist

1. Will large lists stay smooth on real devices?
2. Are animations using native-friendly properties and patterns?
3. Does navigation favor native primitives?
4. Are images, safe areas, and press interactions handled in a platform-correct way?
5. Are state subscriptions tighter than the default naive version?
6. Will the code behave well in a monorepo and native build pipeline?

## Notes

- Test on low-end devices before assuming a pattern is acceptable.
- In mobile apps, list rendering and image behavior usually matter more than clever abstraction.
- For deeper rule-by-rule guidance, check the upstream `vercel-labs/agent-skills` rule documents.
