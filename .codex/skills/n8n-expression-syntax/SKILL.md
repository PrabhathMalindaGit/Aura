---
name: n8n-expression-syntax
description: Expert guide for writing correct n8n expressions, including current-item access, node references, timestamps, environment variables, and webhook payload paths.
---
# n8n Expression Syntax

Use this skill when filling n8n fields dynamically with expressions.

## Goal

Write expressions that evaluate correctly the first time and reference the right data source.

## Expression Format

Dynamic content must use expression syntax:

`{{ expression }}`

In many parameter fields you will also see whole-field expression form:

`={{ expression }}`

If you omit the braces, n8n will often treat the text literally.

## Core Variables

### Current node output

Use `$json` for the current item's data:

- `{{$json.field}}`
- `{{$json.nested.value}}`
- `{{$json["field with spaces"]}}`

### Previous node output

Use `$node["Node Name"]` to reference earlier nodes:

- `{{$node["HTTP Request"].json.data}}`
- `{{$node["Webhook"].json.body.email}}`

Rules:

- Node names must be quoted
- Node names are case-sensitive
- The name must match the workflow exactly

### Time

Use `$now` for current date/time logic:

- `{{$now}}`
- `{{$now.toFormat("yyyy-MM-dd")}}`
- `{{$now.plus({ days: 7 })}}`

### Environment variables

Use `$env` for environment configuration:

- `{{$env.API_KEY}}`
- `{{$env.DATABASE_URL}}`

## Critical Webhook Rule

Webhook payload data is usually nested under `.body`.

Use:

- `{{$json.body.name}}`
- `{{$json.body.email}}`

Do not assume user payload fields live directly on `$json`.

## Common Mistakes

1. Forgetting `{{ ... }}`
2. Using single braces instead of double braces
3. Referencing the wrong node name or wrong case
4. Reading webhook data from `$json.name` instead of `$json.body.name`
5. Mixing current-item data and previous-node data without realizing it

## Best Practices

- Start with `$json` if the value comes from the current node
- Use `$node["..."]` only when you truly need another node's output
- Test expressions after renaming nodes
- Use bracket notation for keys with spaces or special characters
- Keep expressions readable; if logic becomes complex, move it to a Set or Code node

## Review Checklist

1. Is the expression wrapped correctly?
2. Am I reading from the correct node?
3. Is the path correct for webhook data?
4. Will this still work if node names change?
5. Would a Set or Code node make the logic clearer?
