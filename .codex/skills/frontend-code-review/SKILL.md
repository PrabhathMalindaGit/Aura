---
name: frontend-code-review
description: Review frontend `.tsx`, `.ts`, `.js`, and `.jsx` changes with a checklist focused on code quality, performance, and business-logic correctness.
---
# Frontend Code Review

## Intent

Use this skill whenever the user asks to review frontend code, especially React or TypeScript frontend files.

Support two review modes:

1. Pending-change review: inspect staged or working-tree frontend files before commit
2. File-targeted review: inspect the specific frontend files the user names

Apply the same checklist in both modes.

## Review Categories

Review every applicable file across these categories in this order:

1. Code Quality
2. Performance
3. Business Logic

## Checklist

### Code Quality

Check for:

- unclear component boundaries
- weak or missing types
- over-complex conditionals
- duplicated logic that should be extracted
- unsafe null handling
- unreadable naming or prop shapes
- styling patterns that fight the codebase conventions

### Performance

Check for:

- unnecessary re-renders
- expensive work in render
- missing memoization where it actually matters
- unstable props or callbacks passed deep into trees
- avoidable client-side work
- list rendering or state updates that scale poorly

### Business Logic

Check for:

- incorrect state transitions
- missing loading, empty, or error handling
- broken assumptions in event handlers
- incorrect permission or feature-flag logic
- coupling between view code and domain rules that causes regressions

## Review Process

1. Open the relevant file or changed files
2. Gather the lines tied to state, props, rendering, hooks, handlers, and styling
3. Compare the code to the checklist above
4. Record each violation with a short title, file path, line, and a concrete suggested fix
5. Group findings by urgency first, then by category order

## Urgency Levels

- Urgent: likely bug, regression, breakage, or meaningful performance issue
- Suggestion: worthwhile improvement, but not immediately blocking

## Required Output

When invoked, the response must follow one of these templates.

### Template A: findings exist

```text
# Code review
Found <N> urgent issues need to be fixed:

## 1 <brief description of bug>
FilePath: <path> line <line>
<relevant code snippet or pointer>

### Suggested fix
<brief description of suggested fix>

---

Found <M> suggestions for improvement:

## 1 <brief description of suggestion>
FilePath: <path> line <line>
<relevant code snippet or pointer>

### Suggested fix
<brief description of suggested fix>

---
```

Rules:

- Omit the urgent section if there are no urgent issues
- Omit the suggestions section if there are no suggestions
- If there are more than 10 findings in a section, report `10+` and show only the first 10
- Preserve blank lines for readability
- If at least one finding would require code changes, append a brief question asking whether the user wants the fixes applied

### Template B: no findings

```text
## Code review
No issues found.
```

## Notes

- This is a review skill, not a test runner
- Prioritize real bugs and regressions over style nitpicks
- Follow the repository's existing frontend conventions when judging patterns
