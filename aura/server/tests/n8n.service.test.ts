import axios from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("axios", () => ({
  default: {
    post: vi.fn(),
  },
}));

import { env } from "../src/env";
import {
  emitAlertCreated,
  emitNotificationRetryRequested,
} from "../src/services/n8n";

describe("n8n service client", () => {
  const mutableEnv = env as unknown as {
    N8N_WEBHOOK_ALERT: string;
    N8N_RETRY_WEBHOOK_URL: string;
  };
  const originalAlertUrl = mutableEnv.N8N_WEBHOOK_ALERT;
  const originalRetryUrl = mutableEnv.N8N_RETRY_WEBHOOK_URL;

  beforeEach(() => {
    mutableEnv.N8N_WEBHOOK_ALERT = "http://localhost:5678/webhook/alert-created";
    mutableEnv.N8N_RETRY_WEBHOOK_URL = "http://localhost:5678/webhook/alert-retry";
    vi.mocked(axios.post).mockReset();
    vi.mocked(axios.post).mockResolvedValue({ data: { ok: true } } as never);
  });

  afterEach(() => {
    mutableEnv.N8N_WEBHOOK_ALERT = originalAlertUrl;
    mutableEnv.N8N_RETRY_WEBHOOK_URL = originalRetryUrl;
  });

  it("propagates x-request-id on alert-created and retry webhook calls", async () => {
    await emitAlertCreated(
      {
        type: "ALERT_CREATED",
        patientId: "p1",
        alertId: "alert-1",
        risk: "high",
        reason: ["PAIN_GE_THRESHOLD"],
        timestamp: "2026-07-01T09:00:00.000Z",
      },
      {
        requestId: "req-n8n-1",
      }
    );
    await emitNotificationRetryRequested(
      {
        type: "RETRY_NOTIFICATION_REQUESTED",
        patientId: "p1",
        alertId: "alert-1",
        channel: "telegram",
        requestedBy: "clinician-1",
        timestamp: "2026-07-01T09:05:00.000Z",
      },
      {
        requestId: "req-n8n-2",
      }
    );

    expect(axios.post).toHaveBeenNthCalledWith(
      1,
      "http://localhost:5678/webhook/alert-created",
      expect.any(Object),
      expect.objectContaining({
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "x-request-id": "req-n8n-1",
        }),
      })
    );
    expect(axios.post).toHaveBeenNthCalledWith(
      2,
      "http://localhost:5678/webhook/alert-retry",
      expect.any(Object),
      expect.objectContaining({
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "x-request-id": "req-n8n-2",
        }),
      })
    );
  });
});
