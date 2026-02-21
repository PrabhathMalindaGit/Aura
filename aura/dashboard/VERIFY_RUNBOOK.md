# Verify Runbook

Use this runbook before merge or release.

## Commands

```bash
cd /Users/University/Final\ Project/aura/dashboard
npm ci
npm run verify
```

If `npm ci` is not available in your environment, use:

```bash
npm install
npm run verify
```

## What `npm run verify` Executes

1. `npm run lint`
2. `npm run typecheck`
3. `npm run test`
4. `npm run build`

## Success Criteria

- ESLint exits with code 0.
- TypeScript check (`tsc --noEmit`) exits with code 0.
- Vitest suite passes without real backend/network dependency.
- Production build completes successfully.

## Common Failures and Fixes

### ESLint failures
- Symptom: unused variables, hook rules, or explicit `any` warnings/errors.
- Fix:
  - Remove unused variables/imports.
  - Prefix intentionally unused args with `_`.
  - Replace `any` with concrete types where practical.
  - Ensure hooks follow rules of hooks.

### Typecheck failures
- Symptom: `string | undefined` issues, invalid prop types, test typing issues.
- Fix:
  - Add narrowing guards before calling typed functions.
  - Strengthen interfaces and function signatures.
  - Use explicit casts only when safe and justified.

### Test failures
- Symptom: flaky time/date, missing browser APIs, unmocked fetch.
- Fix:
  - Use helpers from `src/test/mocks.ts`.
  - Ensure tests mock `fetch` responses explicitly.
  - Use fake timers for timeout flows.
  - Keep deterministic dates in UTC for date-sensitive tests.

### Build failures
- Symptom: Vite or TypeScript compile error after tests pass.
- Fix:
  - Run `npm run typecheck` first and resolve strict typing issues.
  - Re-check conditional branches that rely on route params.

## Recommended Local Workflow

```bash
npm run test:watch
# while developing
npm run verify
# before committing
```
