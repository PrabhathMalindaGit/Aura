import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

type WorkflowNode = {
  name?: string;
  type?: string;
  parameters?: Record<string, unknown>;
};

type WorkflowConnection = {
  node?: string;
  type?: string;
  index?: number;
};

type WorkflowExport = {
  name?: string;
  nodes?: WorkflowNode[];
  connections?: Record<string, { main?: WorkflowConnection[][] }>;
};

const workflowsRoot = path.resolve(__dirname, "../../n8n/workflows");

function findWorkflowFile(prefix: string): string {
  const fileName = fs
    .readdirSync(workflowsRoot)
    .find((entry) => entry.startsWith(prefix) && entry.endsWith(".json"));

  if (!fileName) {
    throw new Error(`Missing n8n workflow export with prefix ${prefix}`);
  }

  return path.join(workflowsRoot, fileName);
}

function readWorkflow(prefix: string): { contents: string; workflow: WorkflowExport } {
  const contents = fs.readFileSync(findWorkflowFile(prefix), "utf8");
  return {
    contents,
    workflow: JSON.parse(contents) as WorkflowExport,
  };
}

function getNode(workflow: WorkflowExport, name: string): WorkflowNode {
  const node = (workflow.nodes ?? []).find((candidate) => candidate.name === name);
  if (!node) {
    throw new Error(`Missing n8n node ${name}`);
  }
  return node;
}

function getCode(node: WorkflowNode): string {
  return String(node.parameters?.jsCode ?? "");
}

function getResponseCode(node: WorkflowNode): unknown {
  const options = node.parameters?.options as { responseCode?: unknown } | undefined;
  return options?.responseCode;
}

function firstTarget(
  workflow: WorkflowExport,
  from: string,
  outputIndex = 0
): string | undefined {
  return workflow.connections?.[from]?.main?.[outputIndex]?.[0]?.node;
}

describe("n8n workflow security exports", () => {
  it("keeps workflow 01 alert-created ingress fail-closed before action nodes", () => {
    const { contents, workflow } = readWorkflow("01 - Alert Created Webhook");

    const validateNode = getNode(workflow, "Validate Inbound Webhook Key");
    const validateCode = getCode(validateNode);
    expect(validateCode).toContain("AURA_N8N_WEBHOOK_KEY");
    expect(validateCode).toContain("x-aura-n8n-webhook-key");
    expect(validateCode).toContain("expected.length > 0");
    expect(validateCode).toContain("incoming.length > 0");
    expect(validateCode).toContain("incoming === expected");

    expect(firstTarget(workflow, "Webhook")).toBe("Validate Inbound Webhook Key");
    expect(firstTarget(workflow, "Validate Inbound Webhook Key")).toBe("Authorized?");
    expect(firstTarget(workflow, "Authorized?", 0)).toBe("Get existing alert");
    expect(firstTarget(workflow, "Authorized?", 1)).toBe(
      "Build Unauthorized Response"
    );
    expect(firstTarget(workflow, "Build Unauthorized Response")).toBe(
      "Respond Unauthorized"
    );

    const unauthorizedNode = getNode(workflow, "Build Unauthorized Response");
    expect(getCode(unauthorizedNode)).toContain("UNAUTHORIZED");

    const respondUnauthorized = getNode(workflow, "Respond Unauthorized");
    expect(getResponseCode(respondUnauthorized)).toBe(401);

    expect(contents).not.toContain("dev_aura_webhook_key");
    expect(contents).not.toMatch(/api\.telegram\.org\/bot/i);
    expect(contents).not.toMatch(/[0-9]{6,}:[A-Za-z0-9_-]{20,}/);
  });

  it("keeps workflow 01 notification callback env-based", () => {
    const { workflow } = readWorkflow("01 - Alert Created Webhook");
    const callbackNode = getNode(workflow, "Post Notification Status");

    expect(callbackNode.parameters?.url).toBe(
      "={{ $env.AURA_API_BASE + '/events/notification-status' }}"
    );

    const headers =
      (callbackNode.parameters?.headerParameters as
        | { parameters?: Array<{ name?: string; value?: string }> }
        | undefined)?.parameters ?? [];

    expect(headers).toEqual([
      {
        name: "x-aura-webhook-key",
        value: "={{$env.AURA_WEBHOOK_KEY}}",
      },
    ]);
  });

  it("keeps workflow 02 list alerts proxy fail-closed when API key is unset or wrong", () => {
    const { workflow } = readWorkflow("02 - List Alerts Proxy");
    const normalizeNode = getNode(workflow, "Normalize Request");
    const code = getCode(normalizeNode);

    expect(code).toContain("AURA_N8N_API_KEY");
    expect(code).toContain("x-api-key");
    expect(code).toContain("expectedApiKey.length > 0");
    expect(code).toContain("incomingApiKey.length > 0");
    expect(code).toContain("incomingApiKey === expectedApiKey");
    expect(code).not.toContain("!authRequired");

    const unauthorizedNode = getNode(workflow, "Build Unauthorized Response");
    expect(getCode(unauthorizedNode)).toContain("UNAUTHORIZED");

    const respondUnauthorized = getNode(workflow, "Respond Unauthorized");
    expect(getResponseCode(respondUnauthorized)).toBe(401);
  });
});
