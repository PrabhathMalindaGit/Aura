---
name: n8n-validation-expert
description: Expert guidance for interpreting n8n validation results, fixing configuration problems iteratively, and validating complete workflows before activation.
---
# n8n Validation Expert

Use this skill when validation fails, warnings pile up, or you want to sanity-check a workflow before activation.

## Goal

Treat validation as an iterative fix loop instead of expecting a single pass to solve everything.

## Validation Mindset

- Validate early
- Expect multiple fix cycles
- Solve blocking errors first
- Re-run validation after every meaningful config change

Multiple rounds of `validate -> fix -> validate` are normal.

## Severity Levels

### Errors

These block execution or activation and must be fixed.

Common types:

- `missing_required`
- `invalid_value`
- `type_mismatch`
- `invalid_reference`
- `invalid_expression`

### Warnings

These do not always block execution, but usually deserve attention.

Common types:

- `best_practice`
- `deprecated`
- `performance`

## Recommended Validation Flow

### During editing

Use lighter validation to catch obvious missing fields quickly.

### Before deployment

Use `profile: "runtime"` for realistic checks. This should be the default final pass for most workflows.

### Full workflow pass

After node-level issues are fixed, validate the complete workflow structure and references.

## Fix Strategy

1. Read the exact failing property
2. Confirm the chosen node resource and operation are correct
3. Fix one class of issue at a time
4. Re-run validation
5. Only move to workflow-level validation after node configs are stable

## Common Failure Patterns

1. Required field missing because the wrong operation was selected
2. Value shape wrong because a string, number, or object type was assumed
3. Expression invalid because braces or node references are wrong
4. Reference invalid because a node name changed
5. Warning ignored even though it signals real runtime trouble, such as retries or deprecated behavior

## Best Practices

- Let the validator guide the next fix instead of guessing ahead
- Validate nodes before validating the whole workflow
- Keep expression fixes and structural fixes separate in your head
- Do not activate on unresolved blocking errors

## Review Checklist

1. Are all blocking errors resolved?
2. Are warnings understood and intentionally accepted or fixed?
3. Has `profile: "runtime"` passed?
4. Has the complete workflow been validated after node edits?
5. Would this survive real credentials, real payloads, and real missing-data cases?
