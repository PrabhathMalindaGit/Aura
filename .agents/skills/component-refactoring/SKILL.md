---
name: component-refactoring
description: Refactor high-complexity React components in the Dify frontend using structured extraction patterns and incremental validation.
---
# Dify Component Refactoring Skill

Refactor high-complexity React components in the Dify frontend with the patterns and workflow below.

> Complexity threshold: components with complexity greater than `50` should be refactored before testing.

## Quick Reference

### Commands

Run from `web/` and use paths relative to that directory.

```bash
cd web

# Generate a refactoring prompt
pnpm refactor-component <path>

# Generate refactoring analysis as JSON
pnpm refactor-component <path> --json

# Analyze complexity and generate testing prompt
pnpm analyze-component <path>

# Analyze complexity as JSON
pnpm analyze-component <path> --json
```

### Metrics To Check

- `complexity`: normalized `0-100`, target `< 50`
- `maxComplexity`: highest single-function complexity
- `lineCount`: target `< 300`

### Complexity Score Guide

- `0-25`: simple, ready for testing
- `26-50`: medium, consider minor refactoring
- `51-75`: complex, refactor before testing
- `76-100`: very complex, must refactor

## Core Refactoring Patterns

### 1. Extract Custom Hooks

Use when:

- complex state management lives inside the component
- several `useState` or `useEffect` calls are mixed with UI
- business logic is tangled with rendering

Dify convention:

- place hooks in a `hooks/` subdirectory, or
- colocate them as `use-<feature>.ts`

Good targets:

- model/config state
- orchestration logic
- multi-step derived state
- feature-specific event handling

Reference examples:

- `web/app/components/app/configuration/hooks/use-advanced-prompt-config.ts`
- `web/app/components/app/configuration/debug/hooks.tsx`
- `web/app/components/workflow/hooks/use-workflow.ts`

### 2. Extract Sub-Components

Use when:

- one component contains multiple visual sections
- JSX is monolithic
- repeated UI patterns appear in one file
- modals, headers, actions, and content all live together

Dify convention:

- split sections into separate files or subdirectories in the same feature folder
- keep the main file focused on orchestration

Typical structure:

```text
feature/
  index.tsx
  header.tsx
  operations.tsx
  modals.tsx
```

Reference examples:

- `web/app/components/app/configuration/`
- `web/app/components/workflow/nodes/`

### 3. Simplify Conditional Logic

Use when:

- nesting goes deeper than 3 levels
- multiple `if/else` chains fight each other
- large ternaries make the UI hard to follow
- mode or locale switching dominates the component

Preferred tactics:

- lookup tables
- early returns
- mode maps
- extracted helpers with clear names

### 4. Extract API And Data Logic

Use when:

- the component performs API calls directly
- async orchestration dominates the component
- data transformation logic overwhelms the rendering logic

Dify convention:

- this skill is for component decomposition, not full query or mutation redesign
- follow `web/AGENTS.md` when refactoring data fetching
- use `frontend-query-mutation` for query contracts, invalidation, conditional queries, and mutation patterns
- do not introduce deprecated `useInvalid` or `useReset`
- do not add thin passthrough `useQuery` wrappers unless a hook truly orchestrates shared logic

Reference examples:

- `web/service/use-workflow.ts`
- `web/service/use-common.ts`
- `web/service/knowledge/use-dataset.ts`
- `web/service/knowledge/use-document.ts`

### 5. Extract Modal And Dialog Management

Use when:

- one component manages many modal booleans
- opening and closing dialog state dominates the file
- modal state and action handlers are tightly coupled to unrelated UI

Dify convention:

- extract modal state with the modal logic itself
- prefer a single `activeModal` shape over many booleans
- expose `openModal`, `closeModal`, and focused helpers

### 6. Extract Form Logic

Use when:

- validation is complex
- submission logic is large
- field transformation or derived field state is non-trivial

Dify convention:

- use `@tanstack/react-form` patterns from `web/app/components/base/form/`
- prefer `useAppForm` and existing form infrastructure

## Dify-Specific Refactoring Guidelines

### Context Providers

When a provider value grows too large:

- split it into domain-specific providers
- keep model, dataset, UI, and feature concerns separate
- avoid giant provider values with dozens of unrelated properties

Reference:

- `web/context/`

### Workflow Node Components

When refactoring files under `web/app/components/workflow/nodes/`:

- keep node logic in `use-interactions.ts`
- extract panel UI into separate files
- reuse `_base` components for common node behavior

Preferred structure:

```text
nodes/<node-type>/
  index.tsx
  node.tsx
  panel.tsx
  use-interactions.ts
  types.ts
```

### Configuration Components

When refactoring app configuration UI:

- split sections into subdirectories
- follow patterns from `web/app/components/app/configuration/`
- keep feature toggles in dedicated components

### Tool And Plugin Components

When refactoring `web/app/components/tools/`:

- follow existing modal patterns
- use service hooks from `web/service/use-tools.ts`
- isolate provider-specific logic

## Refactoring Workflow

### Step 1: Generate The Refactoring Prompt

```bash
cd web
pnpm refactor-component <path>
```

This surfaces likely refactoring actions based on the component's detected features.

### Step 2: Analyze Complexity

```bash
cd web
pnpm analyze-component <path> --json
```

Review:

- total complexity score
- highest function complexity
- line count
- detected features such as state, effects, events, and API usage

### Step 3: Plan The Extractions

Map observed features to extraction actions:

- `hasState` plus `hasEffects`: extract a custom hook
- `hasAPI`: extract service or data logic
- many handlers: extract event or interaction logic
- `lineCount > 300`: split sub-components
- `maxComplexity > 50`: simplify conditionals

### Step 4: Execute Incrementally

Extract one piece at a time.

After each extraction:

```bash
cd web
pnpm lint:fix
pnpm type-check:tsgo
pnpm test
```

Then manually verify the affected behavior before continuing.

### Step 5: Re-Analyze Before Stopping

Run the analyzer again and confirm:

- complexity has dropped
- the component is easier to reason about
- file size and branching improved
- no new architectural regressions were introduced

## Working Rules

1. Prefer incremental refactors over wholesale rewrites
2. Keep the main component as the orchestration layer
3. Match existing Dify folder structure and naming conventions
4. Reuse existing form, workflow, and service patterns before inventing new ones
5. Stop after each safe extraction and validate before continuing

## Related Skills

- `frontend-code-review` for post-refactor review
- `frontend-query-mutation` when the work expands into query and mutation architecture
