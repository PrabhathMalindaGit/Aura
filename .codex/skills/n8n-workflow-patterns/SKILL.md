---
name: n8n-workflow-patterns
description: Proven n8n workflow architectures for webhook processing, API integration, database sync, AI agents, and scheduled automation.
---
# n8n Workflow Patterns

Use this skill when designing the shape of an n8n workflow before choosing exact nodes and field values.

## Goal

Pick the right workflow pattern first, then build around it with clear trigger, transform, output, and error-handling stages.

## The 5 Core Patterns

### 1. Webhook Processing

Use when:

- Receiving events from external systems
- Handling form submissions, Slack commands, GitHub webhooks, or Stripe events
- The workflow needs to react immediately

Typical flow:

`Webhook -> Validate -> Transform -> Respond or Notify`

### 2. HTTP API Integration

Use when:

- Fetching from REST APIs
- Syncing data with third-party services
- Building pull-based integrations

Typical flow:

`Trigger -> HTTP Request -> Transform -> Action -> Error Handler`

### 3. Database Operations

Use when:

- Reading or writing scheduled data
- Syncing between systems
- Running ETL-style jobs

Typical flow:

`Schedule -> Query -> Transform -> Write -> Verify`

### 4. AI Agent Workflow

Use when:

- Building conversational assistants
- Giving AI access to tools or memory
- Running multi-step reasoning tasks

Typical flow:

`Trigger -> AI Agent (model + tools + memory) -> Output`

### 5. Scheduled Tasks

Use when:

- Generating recurring reports
- Performing periodic fetches or cleanup jobs
- Running maintenance workflows

Typical flow:

`Schedule -> Fetch -> Process -> Deliver -> Log`

## Shared Building Blocks

Every workflow should define:

1. Trigger: webhook, schedule, manual, or polling
2. Data source: HTTP, database, service node, or code
3. Transformation: Set, Code, IF, Switch, or Merge
4. Output: API call, database write, email, Slack, file, or storage
5. Error handling: Continue On Fail, explicit checks, or separate error flow

## Workflow Creation Checklist

### Planning

- Choose the pattern first
- List the required nodes
- Trace the data path from input to output
- Decide how failures should be handled

### Implementation

- Start with the correct trigger
- Add sources before complex transforms
- Configure credentials early
- Use Set, IF, and Code only where they simplify the workflow
- Add output nodes last

### Validation

- Validate node configurations before connecting everything
- Validate the whole workflow before activation
- Test with real or realistic sample data
- Check empty inputs, malformed payloads, and auth failures

### Deployment

- Review execution order and timeout settings
- Activate only after validation passes
- Watch the first few executions closely
- Document the workflow purpose and data flow

## Useful Data Flow Shapes

- Linear: `Trigger -> Transform -> Action`
- Branching: `Trigger -> IF -> true/false paths`
- Parallel: `Trigger -> branch A + branch B -> Merge`
- Looping: `Trigger -> Split In Batches -> Process -> Loop`
- Separate error handler: `Main flow + error workflow`

## Common Gotchas

1. Webhook payloads usually live under `$json.body`, not directly on `$json`
2. Some nodes process all input items unless you explicitly switch to execute-once or item-specific behavior
3. Authentication belongs in credentials, not improvised parameter fields
4. Execution order settings can change how branches behave
5. Expressions must use `{{ ... }}` or `={{ ... }}` syntax

## Related Skills

- `n8n-mcp-tools-expert` for node discovery and workflow tools
- `n8n-node-configuration` for property-level setup
- `n8n-validation-expert` for fix cycles
- `n8n-expression-syntax` for dynamic values
