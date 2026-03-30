---
name: n8n-code-python
description: Python Code node guidance for n8n, including when to prefer JavaScript, input access patterns, return format, standard-library limits, and beta-mode caveats.
---
# Python Code Node

Use this skill when writing Python inside an n8n Code node.

## Goal

Use Python only when it is the right fit, and still follow n8n's item model and runtime limitations.

## First Principle: JavaScript First

Prefer JavaScript for most n8n code tasks.

Choose Python only when:

- The logic is materially clearer in Python
- You need Python standard-library features
- The person maintaining the workflow is more effective in Python

## Key Limitations

- Do not assume external packages are available
- Standard library only is the safe default
- Prefer dedicated n8n nodes over reimplementing integrations in Python
- Prefer the documented `_input.*` interface for portability

## Essential Rules

1. Use `_input.all()`, `_input.first()`, or `_input.item`
2. Return items as `[{"json": {...}}]`
3. Webhook data is usually under `_json["body"]`
4. Keep code simple and data-focused
5. Use HTTP Request or other native nodes instead of trying to import third-party clients

## Mode Selection

### Run Once for All Items

Use for:

- Aggregations
- Batch transforms
- Totals, counts, summaries
- Multi-item filtering and mapping

Typical access:

`items = _input.all()`

### Run Once for Each Item

Use only when:

- Each item needs isolated logic
- The workflow truly benefits from per-item execution

Typical access:

`item = _input.item`

## Return Format

Always return n8n items:

```python
return [
    {
        "json": {
            "ok": True
        }
    }
]
```

## Common Mistakes

1. Using Python for a problem that a Set or Code JavaScript node would solve more simply
2. Importing external libraries such as `requests`, `pandas`, or `numpy`
3. Returning a plain dict instead of a list of items
4. Forgetting webhook payload data is nested under `body`
5. Mixing execution-mode access patterns

## Best Practices

- Keep Python nodes focused on transformation logic
- Use native n8n nodes for networking, auth, storage, and integrations where possible
- Use Python's standard library deliberately, not as a substitute for workflow structure
- If the environment exposes multiple Python modes, prefer the documented interface unless you have a concrete reason not to

## Review Checklist

1. Does Python actually add value here over JavaScript?
2. Is the input accessor correct for the chosen mode?
3. Is the return shape valid for n8n?
4. Are there any hidden external-library assumptions?
5. Would this be clearer as native nodes plus a smaller Python transform?
