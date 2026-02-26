import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";

import app from "../src/app";
import { env } from "../src/env";
import Alert from "../src/models/Alert";

describe("internal n8n routes", () => {
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
    await Alert.deleteMany({});
  });

  async function createAlert(overrides: Partial<{ status: "open" | "acknowledged" | "resolved" }> = {}) {
    return Alert.create({
      patientId: "p1",
      reason: "PAIN_GE_THRESHOLD",
      source: {
        type: "checkin",
        sourceId: new mongoose.Types.ObjectId().toString(),
      },
      status: overrides.status ?? "open",
    });
  }

  it("requires webhook key for list and patch endpoints", async () => {
    const alert = await createAlert();

    const listResponse = await request(app).get("/internal/n8n/alerts");
    const patchResponse = await request(app)
      .patch(`/internal/n8n/alerts/${String(alert._id)}`)
      .send({ status: "acknowledged" });

    expect(listResponse.status).toBe(401);
    expect(listResponse.body.error).toBe("UNAUTHORIZED");
    expect(patchResponse.status).toBe(401);
    expect(patchResponse.body.error).toBe("UNAUTHORIZED");
  });

  it("lists alerts by status with webhook key", async () => {
    await createAlert({ status: "open" });
    await createAlert({ status: "resolved" });

    const response = await request(app)
      .get("/internal/n8n/alerts")
      .query({ status: "open" })
      .set("x-aura-webhook-key", "test-webhook-key");

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(Array.isArray(response.body.alerts)).toBe(true);
    expect(response.body.alerts).toHaveLength(1);
    expect(response.body.alerts[0].status).toBe("open");
  });

  it("updates alert status through internal patch endpoint", async () => {
    const alert = await createAlert({ status: "open" });

    const response = await request(app)
      .patch(`/internal/n8n/alerts/${String(alert._id)}`)
      .set("x-aura-webhook-key", "test-webhook-key")
      .send({ status: "acknowledged" });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.alert.status).toBe("acknowledged");

    const updated = await Alert.findById(alert._id).lean();
    expect(updated?.status).toBe("acknowledged");
    expect(updated?.acknowledgedAt).toBeTruthy();
  });
});
