---
name: next-best-practices
description: Next.js App Router best practices covering file conventions, server-client boundaries, async APIs, data fetching, optimization, routing, and debugging.
---
# Next.js Best Practices

Use this skill when writing or reviewing Next.js code, especially App Router code.

## When to Apply

Reference these guidelines when:

- Creating new routes, layouts, pages, and handlers
- Reviewing server and client component boundaries
- Migrating to newer Next.js async APIs
- Optimizing data fetching, images, fonts, or metadata
- Debugging hydration, Suspense, or routing behavior

## Working Order

### 1. Start With File Conventions

- Use the correct special files such as `layout.tsx`, `page.tsx`, `loading.tsx`, `error.tsx`, and `not-found.tsx`
- Model dynamic, catch-all, route groups, parallel routes, and intercepting routes intentionally
- Keep route structure legible before optimizing internals

### 2. Validate RSC Boundaries

- Keep async logic in Server Components unless there is a clear client need
- Do not pass non-serializable data through server-to-client props
- Use Server Actions only where the boundary is explicit and appropriate

### 3. Handle Async APIs Correctly

- Treat `params`, `searchParams`, `cookies()`, and `headers()` according to the current Next.js async model
- Avoid legacy sync assumptions in newer code
- Use codemods or migration helpers when updating older routes

### 4. Pick the Runtime Deliberately

- Default to Node.js runtime
- Use Edge runtime only when the workload clearly benefits from it and dependencies allow it

### 5. Use Directives Sparingly and Correctly

- Add `'use client'` only where client behavior is required
- Keep `'use server'` explicit for server functions
- Use `'use cache'` only when the caching model is well understood

### 6. Choose the Right Data Pattern

- Prefer Server Components for initial data loading
- Use Server Actions for mutations and server-owned workflows
- Use Route Handlers for HTTP boundaries, integrations, or non-UI consumers
- Parallelize fetches with `Promise.all`, preload patterns, and Suspense boundaries to avoid waterfalls

### 7. Route Handlers

- Use `route.ts` intentionally and avoid conflicts with `page.tsx` in the same segment where unsupported
- Remember route handlers do not run in a React DOM environment
- Keep them focused on transport, not presentational concerns

### 8. Metadata, Images, Fonts, and Scripts

- Use file-based metadata or `generateMetadata` appropriately
- Use `next/og` for dynamic OG images when needed
- Prefer `next/image` over raw `<img>`
- Configure remote images correctly and provide realistic `sizes`
- Use `next/font` for fonts and preload only what is needed
- Use `next/script` when script loading strategy matters

### 9. Error Handling and Redirects

- Use the framework error files rather than ad hoc patterns where possible
- Reach for `redirect`, `permanentRedirect`, `notFound`, `forbidden`, and `unauthorized` intentionally
- Re-throw correctly when framework behavior depends on it

### 10. Hydration and Suspense

- Watch for browser-only APIs, dates, unstable markup, and invalid HTML that cause hydration issues
- Add Suspense boundaries where hooks like `useSearchParams` or `usePathname` require them
- Debug hydration mismatches as data-flow problems before treating them as rendering quirks

### 11. Advanced Routing and Deployment

- Use parallel and intercepting routes for modal patterns carefully
- Include `default.tsx` fallbacks where needed
- For self-hosting and Docker, use standalone output and plan cache behavior for multi-instance deployments

## Review Checklist

1. Is the file structure idiomatic for the route being built?
2. Are server and client concerns separated cleanly?
3. Are async APIs handled in the current recommended way?
4. Is data fetching parallelized and Suspense-friendly?
5. Are images, fonts, scripts, and metadata using framework-native tools?
6. Would this route hydrate cleanly and fail predictably?

## Notes

- Most Next.js issues come from boundaries, routing structure, or async assumptions, not from small syntax mistakes.
- When details matter, consult the upstream `vercel-labs/next-skills` topic documents for the specific area you are changing.
