---
name: n8n-mcp-tools-expert
description: Expert guide for using n8n MCP tools to discover nodes, validate configurations, build workflows, update them safely, and deploy templates.
---
# n8n MCP Tools Expert

Use this skill when working with the `n8n-mcp` server and you need to choose the right tool, parameter shape, or workflow-building sequence.

## Goal

Use the MCP tools in the right order so node discovery, validation, workflow edits, and deployment stay fast and reliable.

## Tool Groups

1. Node discovery
2. Configuration validation
3. Workflow management
4. Template library
5. Documentation and guides

## Default Tool Sequences

### Find the Right Node

1. `search_nodes({ query: "keyword" })`
2. `get_node({ nodeType: "nodes-base.name" })`
3. Optionally `get_node({ nodeType, mode: "docs" })` for readable docs

Use this before guessing node names or operations.

### Validate a Node Configuration

1. `validate_node({ nodeType, config, profile: "minimal" })` for quick structure checks
2. `validate_node({ nodeType, config, profile: "runtime" })` for realistic validation
3. Fix issues and repeat until clean

### Create or Edit a Workflow

1. Discover nodes first
2. Build the structure
3. Validate nodes
4. Create or patch the workflow
5. Validate the complete workflow

Prefer `n8n_update_partial_workflow` when editing an existing workflow instead of rebuilding from scratch.

### Use Templates

Search and deploy a template when the workflow is close to a known pattern instead of reauthoring everything manually.

## Important Type Formats

### For discovery and validation tools

Use the short node type:

`nodes-base.slack`

### For workflow creation and update tools

Use the full workflow node type:

`n8n-nodes-base.slack`

Do not mix these formats. Search tools often return both. Pick the one that matches the tool you are calling.

## Best Practices

- Use `get_node` with standard detail by default
- Reach for full detail only when standard detail is missing something important
- Search first, then inspect, then validate
- Expect iterative validate-fix cycles
- Patch existing workflows incrementally when possible
- Use docs mode when you need human-readable guidance, not just schema fields

## Common Mistakes

1. Using the wrong `nodeType` prefix
2. Calling `get_node` with `detail: "full"` by default and wasting tokens
3. Trying to create a workflow before validating the nodes it depends on
4. Replacing a workflow wholesale when a partial update is enough
5. Skipping full-workflow validation after local node fixes

## Quick Checklist

1. Did I search before hard-coding a node name?
2. Am I using the correct `nodeType` format for this tool?
3. Did I validate the node config before workflow creation?
4. Should I patch instead of recreate?
5. Did I validate the finished workflow before deployment?
