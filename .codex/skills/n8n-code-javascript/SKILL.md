---
name: n8n-code-javascript
description: JavaScript Code node guidance for n8n covering execution modes, item access, return shape, webhook data handling, and built-in helpers.
---
# JavaScript Code Node

Use this skill when writing JavaScript inside an n8n Code node.

## Goal

Write Code node logic that matches n8n's execution model, accesses items correctly, and always returns valid output.

## Essential Rules

1. Prefer "Run Once for All Items" for most cases
2. Use `$input.all()`, `$input.first()`, or `$input.item` based on mode
3. Return an array of items in `[{ json: { ... } }]` shape
4. Remember webhook payloads usually live under `$json.body`
5. Prefer platform helpers and dedicated nodes over reinventing integrations in raw code

## Mode Selection

### Run Once for All Items

Use for:

- Aggregation
- Batch transforms
- Filtering or mapping large inputs
- Building one API request from many items

Typical access pattern:

`const items = $input.all();`

### Run Once for Each Item

Use only when:

- Each item needs isolated logic
- Per-item validation is clearer than batch logic
- The workflow truly benefits from one-at-a-time execution

Typical access pattern:

`const item = $input.item;`

## Common Access Patterns

### All items

Use `$input.all()` when you need to filter, map, or reduce a collection.

### First item

Use `$input.first()` when upstream output is logically a single object.

### Current item

Use `$input.item` only in each-item mode.

## Return Format

Always return n8n items, not plain objects:

```javascript
return [
  {
    json: {
      ok: true
    }
  }
];
```

## Useful Built-ins

- `$helpers.httpRequest()` for HTTP calls when code is truly necessary
- `DateTime` for date/time work
- `$jmespath()` for structured querying

If a dedicated n8n node can do the work more clearly, prefer the node over custom code.

## Common Mistakes

1. Returning a plain object instead of an array of `{ json }` items
2. Using `$input.item` while in all-items mode
3. Forgetting that webhook data is nested under `$json.body`
4. Writing large integration logic in code when a built-in node would be clearer
5. Doing per-item loops when one batch transform would be simpler and faster

## Review Checklist

1. Is the execution mode the right one?
2. Is the item access API correct for that mode?
3. Does the return shape match n8n item format?
4. Is webhook data accessed from the correct path?
5. Would a Set, IF, HTTP Request, or other native node be cleaner than code?
