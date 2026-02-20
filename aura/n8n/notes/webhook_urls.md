# Webhook URLs (Test vs Production)

## Test URL
- Where to find: Open the `Webhook` node in n8n editor.
- Typical format: `http://localhost:5678/webhook-test/alert-created`
- When to use:
  - During manual testing only.
  - Only while `Listen for Test Event` is active in the Webhook node.

## Production URL
- URL: `http://localhost:5678/webhook/alert-created`
- When to use:
  - Real app/backend requests.
  - Normal local integration testing with active workflow.

## Which URL goes in server/.env
Use `Production URL`.

```env
N8N_WEBHOOK_ALERT=http://localhost:5678/webhook/alert-created
```
