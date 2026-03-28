---
name: vercel-react-best-practices
description: React and Next.js performance optimization guidance with prioritized rules for async flows, bundles, rendering, caching, and re-render behavior.
---
# Vercel React Best Practices

Use this skill when writing, reviewing, or refactoring React or Next.js code with a performance focus.

## When to Apply

Reference these guidelines when:

- Building new React components or Next.js pages
- Auditing load time, interaction latency, or bundle size
- Refactoring data fetching or async flows
- Reviewing code for re-render or hydration issues
- Optimizing client and server boundaries

## Priority Order

Apply fixes in this order:

1. Eliminate waterfalls
2. Reduce bundle size
3. Improve server-side performance
4. Tighten client-side data fetching
5. Cut unnecessary re-renders
6. Improve rendering performance
7. Clean up JavaScript hot paths
8. Reach for advanced patterns only when needed

## Core Guidance

### 1. Eliminate Waterfalls First

- Start independent async work early and await it as late as possible
- Use `Promise.all()` for independent requests
- Use Suspense boundaries to stream slower sections instead of blocking the whole page
- In route handlers and server code, kick off promises before branching where possible

### 2. Keep the Bundle Lean

- Prefer direct imports over barrel files when they bloat bundles
- Dynamically import heavy client-only components
- Defer analytics, chat, logging, and non-critical third-party code until after hydration
- Load optional modules only when the feature is actually used
- Preload intentionally for hover/focus-driven flows

### 3. Optimize Server Work

- Cache repeated work carefully: per-request deduplication first, cross-request caching only when valid
- Hoist static I/O and constants to module scope
- Minimize what crosses the server-to-client boundary
- Avoid serializing large objects when only a few fields are needed
- Authenticate server actions with the same discipline as API routes

### 4. Choose Client Fetching Deliberately

- Prefer server data fetching by default in Next.js
- Use SWR or an equivalent deduping layer for client fetches
- Avoid duplicate global listeners and use passive listeners for scroll/touch when appropriate
- Version and minimize browser storage payloads

### 5. Reduce Re-renders

- Derive state during render when possible instead of syncing it with effects
- Move interaction logic into event handlers rather than effects
- Use functional `setState` updates when callbacks depend on previous state
- Use `startTransition` and `useDeferredValue` for non-urgent updates and expensive UI
- Avoid inline component declarations inside other components
- Keep effect dependencies primitive and stable
- Use refs for transient values that should not trigger re-renders
- Avoid memoization for trivial expressions; use it when it meaningfully cuts work

### 6. Improve Rendering Performance

- Use `content-visibility` or virtualization for long content
- Hoist static JSX when possible
- Prefer animating wrappers over raw SVG nodes
- Keep hydration stable; suppress mismatches only when expected and justified
- Use resource hints and correct script loading strategies
- Prefer explicit ternaries over fragile `&&` patterns for conditional UI

### 7. Watch JavaScript Hot Paths

- Use `Map` and `Set` for repeated lookups
- Combine loops when it improves hot code
- Hoist regexes and repeated computations
- Return early in expensive functions
- Defer non-critical browser work with idle time where appropriate

## Review Checklist

When reviewing a React or Next.js change, check:

1. Are async operations parallelized where possible?
2. Did the change add avoidable client JavaScript?
3. Is server/client data flow minimal and intentional?
4. Are effects doing work that belongs in render or events?
5. Are transitions, deferred values, or refs better fits for fast-changing UI?
6. Are hydration and conditional rendering patterns safe?

## Notes

- Prefer modern React patterns over defensive memoization by default.
- In Next.js, performance issues often start with data flow and boundaries, not micro-optimizations.
- If you need exhaustive rule-by-rule guidance, review the upstream `vercel-labs/agent-skills` documentation and expanded rule files.
