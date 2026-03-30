---
name: backend-code-review
description: Review backend changes with a checklist focused on correctness, reliability, data safety, performance, and business-logic integrity.
---
# Backend Code Review

## Intent

Use this skill whenever the user asks to review backend code, especially Python backend files, service logic, API handlers, tasks, or data-access code.

Support two review modes:

1. Pending-change review: inspect staged or working-tree backend files before commit
2. File-targeted review: inspect the specific backend files the user names

Apply the same checklist in both modes.

## Review Categories

Review every applicable file across these categories in this order:

1. Code Quality
2. Reliability and Performance
3. Business Logic and Data Safety

## Checklist

### Code Quality

Check for:

- weak typing or unclear data contracts
- duplicated service or validation logic
- exception handling that hides real failures
- tangled responsibilities between handlers, services, and persistence
- hard-coded values that should be configuration
- unclear naming or control flow

### Reliability and Performance

Check for:

- missing retries, timeouts, or failure boundaries for external calls
- N+1 queries or inefficient data access
- blocking work in request paths
- missing transaction boundaries
- concurrency hazards, race conditions, or idempotency gaps
- unbounded loops, pagination gaps, or memory-heavy loading patterns

### Business Logic and Data Safety

Check for:

- incorrect authorization or tenant scoping
- invalid state transitions
- missing validation or sanitization
- partial writes that can corrupt workflow state
- wrong defaults in critical paths
- assumptions about nullable, missing, or stale data that can break production flows

## Review Process

1. Open the relevant file or changed files
2. Gather the lines related to routing, validation, service logic, persistence, external calls, and error handling
3. Compare the code to the checklist above
4. Record each violation with a short title, file path, line, and a concrete suggested fix
5. Group findings by urgency first, then by category order

## Urgency Levels

- Urgent: likely production bug, security or data-safety issue, or meaningful reliability problem
- Suggestion: worthwhile improvement that is not immediately blocking

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

- This skill is for static review, not runtime verification
- Prioritize correctness, safety, and production behavior over style-only feedback
- Follow the repository's backend architecture and conventions when judging patterns
