---
name: n8n-node-configuration
description: Operation-aware guidance for configuring n8n nodes with the right required fields, property dependencies, and validation loop.
---
# n8n Node Configuration

Use this skill when you know which node you need but need help configuring it correctly.

## Goal

Configure the smallest valid version of a node first, then add optional fields only when they are actually needed.

## Core Principles

### 1. Configuration Is Operation-Aware

Required fields change based on resource and operation.

Example:

- Slack message `post` needs a channel and text
- Slack message `update` needs a message ID and text

Never assume one valid config applies to every operation on the same node.

### 2. Properties Have Dependencies

Fields often appear only when another field enables them.

Example:

- HTTP Request `POST` may require `sendBody`
- Once `sendBody` is true, body fields become relevant

When a field seems missing, check which prior option unlocks it.

### 3. Start Minimal

Do not configure every optional field up front.

Start with:

1. Resource
2. Operation
3. Required auth choice
4. Minimum required fields

Then validate, fix, and expand.

## Recommended Workflow

1. Identify the node type and operation
2. Call `get_node` with standard detail
3. Build the minimal config
4. Run `validate_node` with `profile: "runtime"`
5. If a field is unclear, inspect docs or search properties
6. Add optional fields only where they matter
7. Validate again

## Best Practices

- Use standard detail by default
- Treat resource + operation as the first decision
- Let validation tell you the next missing field
- Put credentials in the proper credentials system
- Use expressions for dynamic values rather than hard-coding everything

## Common Mistakes

1. Choosing the right node but the wrong operation
2. Missing dependent fields because a toggle was not enabled
3. Putting authentication data into plain parameters
4. Trying to fill every advanced option before the basic config works
5. Ignoring validation after adding expressions

## Quick Example: HTTP Request POST

1. Start with method, URL, and authentication
2. Validate
3. If the validator says body is required, enable body sending
4. Add the JSON body content
5. Validate again until clean

## Related Skills

- `n8n-mcp-tools-expert` for discovery and workflow tools
- `n8n-validation-expert` for interpreting errors
- `n8n-expression-syntax` for dynamic field values
