import mongoose from "mongoose";
import request from "supertest";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";

import app from "../src/app";
import { env } from "../src/env";
import AlertNotificationJob from "../src/models/AlertNotificationJob";

describe("GET /internal/ops/summary", () => {
  let mongoServer: MongoMemoryServer | null = null;
  const mutableEnv = env as unknown as { AURA_WEBHOOK_KEY: string };
  const originalWebhookKey = mutableEnv.AURA_WEBHOOK_KEY;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  afterAll(async () => {
    mutableEnv.AURA_WEBHOOK_KEY = originalWebhookKey;
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  beforeEach(async () => {
    mutableEnv.AURA_WEBHOOK_KEY = "test-webhook-key";
    await AlertNotificationJob.deleteMany({});
  });

  it("requires the webhook key", async () => {
    const response = await request(app).get("/internal/ops/summary");

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      ok: false,
      error: "UNAUTHORIZED",
    });
  });

  it("returns notification-only pipeline counts", async () => {
    const now = Date.now();
    await AlertNotificationJob.create([
      {
        alertId: "alert-queued",
        patientId: "p1",
        channel: "telegram",
        state: "queued",
      },
      {
        alertId: "alert-awaiting-future",
        patientId: "p2",
        channel: "telegram",
        state: "awaiting_callback",
        callbackDeadlineAt: new Date(now + 60 * 60 * 1000),
      },
      {
        alertId: "alert-awaiting-past",
        patientId: "p3",
        channel: "telegram",
        state: "awaiting_callback",
        callbackDeadlineAt: new Date(now - 60 * 60 * 1000),
      },
      {
        alertId: "alert-retry",
        patientId: "p4",
        channel: "telegram",
        state: "retry_scheduled",
      },
      {
        alertId: "alert-reconcile",
        patientId: "p5",
        channel: "telegram",
        state: "reconciliation_needed",
      },
      {
        alertId: "alert-failed",
        patientId: "p6",
        channel: "telegram",
        state: "failed",
      },
      {
        alertId: "alert-delivered",
        patientId: "p7",
        channel: "telegram",
        state: "delivered",
      },
    ]);

    const response = await request(app)
      .get("/internal/ops/summary")
      .set("x-aura-webhook-key", "test-webhook-key");

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.generatedAt).toEqual(expect.any(String));
    expect(response.body.notificationPipeline).toEqual({
      queued: 1,
      awaitingCallback: 2,
      awaitingCallbackPastDeadline: 1,
      retryScheduled: 1,
      reconciliationNeeded: 1,
      failed: 1,
    });
    expect(Object.keys(response.body).sort()).toEqual(
      ["generatedAt", "notificationPipeline", "ok"].sort()
    );
    expect(Object.keys(response.body.notificationPipeline).sort()).toEqual(
      [
        "queued",
        "awaitingCallback",
        "awaitingCallbackPastDeadline",
        "retryScheduled",
        "reconciliationNeeded",
        "failed",
      ].sort()
    );
    expect(JSON.stringify(response.body)).not.toContain("patientId");
  });
});
