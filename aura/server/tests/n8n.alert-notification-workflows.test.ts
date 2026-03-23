import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

type WorkflowNode = {
  name?: string;
  type?: string;
  parameters?: Record<string, unknown>;
};

type WorkflowExport = {
  name?: string;
  nodes?: WorkflowNode[];
};

const workflowsRoot = path.resolve(__dirname, "../../n8n/workflows");

function readWorkflow(fileName: string): WorkflowExport {
  const fullPath = path.join(workflowsRoot, fileName);
  const contents = fs.readFileSync(fullPath, "utf8");
  return JSON.parse(contents) as WorkflowExport;
}

function getHttpProcessNode(workflow: WorkflowExport) {
  return (workflow.nodes ?? []).find(
    (node) => node.type === "n8n-nodes-base.httpRequest"
  );
}

describe("alert notification n8n workflow exports", () => {
  it("defines a bounded processor cron workflow that calls the internal process route", () => {
    const fileName =
      "09 - Alert Notification Processor (Cron every minute → Aura Internal Process).json";
    const workflow = readWorkflow(fileName);

    expect(workflow.name).toBe(
      "09 - Alert Notification Processor (Cron every minute → Aura Internal Process)"
    );

    const cronNodes = (workflow.nodes ?? []).filter(
      (node) => node.type === "n8n-nodes-base.cron"
    );
    expect(cronNodes).toHaveLength(1);

    const httpNodes = (workflow.nodes ?? []).filter(
      (node) => node.type === "n8n-nodes-base.httpRequest"
    );
    expect(httpNodes).toHaveLength(1);

    const httpNode = getHttpProcessNode(workflow);
    expect(httpNode?.name).toBe("HTTP Process");
    expect(httpNode?.parameters?.method).toBe("POST");
    expect(httpNode?.parameters?.url).toBe(
      "={{ ($env.AURA_API_BASE || 'http://host.docker.internal:3000') + '/internal/n8n/alert-notifications/process' }}"
    );
    expect(httpNode?.parameters?.jsonBody).toBe("={{ { limit: 25 } }}");

    const headers =
      (httpNode?.parameters?.headerParameters as { parameters?: Array<{ name?: string; value?: string }> } | undefined)
        ?.parameters ?? [];
    expect(headers).toEqual([
      {
        name: "x-aura-webhook-key",
        value: "={{$env.AURA_WEBHOOK_KEY}}",
      },
    ]);
    expect(String(httpNode?.parameters?.jsonBody)).not.toContain("force");
    expect(String(httpNode?.parameters?.jsonBody)).not.toContain("now");
  });

  it("defines a bounded reconcile cron workflow that calls the internal reconcile route", () => {
    const fileName =
      "10 - Alert Notification Reconcile (Cron every 5 minutes → Aura Internal Reconcile).json";
    const workflow = readWorkflow(fileName);

    expect(workflow.name).toBe(
      "10 - Alert Notification Reconcile (Cron every 5 minutes → Aura Internal Reconcile)"
    );

    const cronNodes = (workflow.nodes ?? []).filter(
      (node) => node.type === "n8n-nodes-base.cron"
    );
    expect(cronNodes).toHaveLength(1);

    const httpNodes = (workflow.nodes ?? []).filter(
      (node) => node.type === "n8n-nodes-base.httpRequest"
    );
    expect(httpNodes).toHaveLength(1);

    const httpNode = getHttpProcessNode(workflow);
    expect(httpNode?.name).toBe("HTTP Reconcile");
    expect(httpNode?.parameters?.method).toBe("POST");
    expect(httpNode?.parameters?.url).toBe(
      "={{ ($env.AURA_API_BASE || 'http://host.docker.internal:3000') + '/internal/n8n/alert-notifications/reconcile' }}"
    );
    expect(httpNode?.parameters?.jsonBody).toBe("={{ { limit: 25 } }}");

    const headers =
      (httpNode?.parameters?.headerParameters as { parameters?: Array<{ name?: string; value?: string }> } | undefined)
        ?.parameters ?? [];
    expect(headers).toEqual([
      {
        name: "x-aura-webhook-key",
        value: "={{$env.AURA_WEBHOOK_KEY}}",
      },
    ]);
    expect(String(httpNode?.parameters?.jsonBody)).not.toContain("force");
    expect(String(httpNode?.parameters?.jsonBody)).not.toContain("now");
  });
});
