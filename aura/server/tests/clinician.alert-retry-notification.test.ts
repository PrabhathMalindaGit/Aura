import mongoose from "mongoose";
import request from "supertest";
import axios from "axios";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";

import app from "../src/app";
import { env } from "../src/env";
import Alert from "../src/models/Alert";
import CareEvent from "../src/models/CareEvent";

describe("POST /clinician/alerts/:id/retry-notification", () => {
  let mongoServer: MongoMemoryServer | null = null;
  const mutableEnv = env as unknown as { N8N_RETRY_WEBHOOK_URL: string };
  const originalRetryWebhookUrl = mutableEnv.N8N_RETRY_WEBHOOK_URL;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  afterAll(async () => {
    mutableEnv.N8N_RETRY_WEBHOOK_URL = originalRetryWebhookUrl;
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-02T10:00:00.000Z"));
    mutableEnv.N8N_RETRY_WEBHOOK_URL = "";
    vi.restoreAllMocks();

    await Promise.all([Alert.deleteMany({}), CareEvent.deleteMany({})]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function createAlert() {
    return Alert.create({
      patientId: "p1",
      reason: "pain_spike",
      source: { type: "checkin", sourceId: "source-1" },
      status: "open",
      notification: {
        channel: "telegram",
        status: "failed",
        attemptedAt: new Date("2026-04-02T09:00:00.000Z"),
        failedAt: new Date("2026-04-02T09:00:00.000Z"),
        error: "N8N_WEBHOOK_DELIVERY_FAILED",
        retryCount: 0,
      },
    });
  }

  it("records retry request, increments retryCount, and returns queued", async () => {
    const alert = await createAlert();

    const response = await request(app)
      .post(`/clinician/alerts/${String(alert._id)}/retry-notification`)
      .send({ requestedBy: "c1" });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.status).toBe("queued");
    expect(response.body.alert.notification.status).toBe("unknown");

    const updated = await Alert.findById(alert._id).lean();
    expect(updated?.notification?.retryCount).toBe(1);
    expect(updated?.notification?.status).toBe("unknown");
    expect(updated?.notification?.attemptedAt).toBeTruthy();

    const requestedEvents = await CareEvent.find({
      alertId: String(alert._id),
      type: "NOTIFICATION_RETRY_REQUESTED",
    }).lean();

    expect(requestedEvents).toHaveLength(1);
    expect(requestedEvents[0]?.payload).toMatchObject({
      channel: "telegram",
      requestedBy: "c1",
      retryCount: 1,
    });
  });

  it("returns 429 when retried within throttle window", async () => {
    const alert = await createAlert();

    const first = await request(app)
      .post(`/clinician/alerts/${String(alert._id)}/retry-notification`)
      .send({ requestedBy: "c1" });

    const second = await request(app)
      .post(`/clinician/alerts/${String(alert._id)}/retry-notification`)
      .send({ requestedBy: "c1" });

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(second.body.ok).toBe(false);
    expect(second.body.error).toBe("TOO_MANY_REQUESTS");
    expect(second.body.retryAfterSeconds).toBe(15);
  });

  it("returns 400 for invalid id", async () => {
    const response = await request(app)
      .post("/clinician/alerts/not-an-id/retry-notification")
      .send({ requestedBy: "c1" });

    expect(response.status).toBe(400);
    expect(response.body.ok).toBe(false);
    expect(response.body.error).toBe("VALIDATION_ERROR");
  });

  it("returns 404 when alert does not exist", async () => {
    const missingId = new mongoose.Types.ObjectId().toString();

    const response = await request(app)
      .post(`/clinician/alerts/${missingId}/retry-notification`)
      .send({ requestedBy: "c1" });

    expect(response.status).toBe(404);
    expect(response.body.ok).toBe(false);
    expect(response.body.error).toBe("NOT_FOUND");
  });

  it("emits webhook delivered event when retry webhook succeeds", async () => {
    const alert = await createAlert();
    mutableEnv.N8N_RETRY_WEBHOOK_URL = "http://localhost:5678/webhook/retry";

    const postSpy = vi.spyOn(axios, "post").mockResolvedValue({ data: {} });

    const response = await request(app)
      .post(`/clinician/alerts/${String(alert._id)}/retry-notification`)
      .send({ requestedBy: "c1", requestedByName: "Dr One" });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(postSpy).toHaveBeenCalledTimes(1);

    const deliveredEvents = await CareEvent.find({
      alertId: String(alert._id),
      type: "NOTIFICATION_RETRY_WEBHOOK_DELIVERED",
    }).lean();

    expect(deliveredEvents).toHaveLength(1);
  });

  it("marks alert failed and emits webhook failed event when retry webhook fails", async () => {
    const alert = await createAlert();
    mutableEnv.N8N_RETRY_WEBHOOK_URL = "http://localhost:5678/webhook/retry";

    vi.spyOn(axios, "post").mockRejectedValue(new Error("network error"));

    const response = await request(app)
      .post(`/clinician/alerts/${String(alert._id)}/retry-notification`)
      .send({ requestedBy: "c1", reason: "manual retry" });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.status).toBe("queued");

    const updated = await Alert.findById(alert._id).lean();
    expect(updated?.notification?.status).toBe("failed");
    expect(updated?.notification?.error).toBe("N8N_RETRY_WEBHOOK_FAILED");
    expect(updated?.notification?.failedAt).toBeTruthy();

    const failedEvents = await CareEvent.find({
      alertId: String(alert._id),
      type: "NOTIFICATION_RETRY_WEBHOOK_FAILED",
    }).lean();

    expect(failedEvents).toHaveLength(1);
  });
});
