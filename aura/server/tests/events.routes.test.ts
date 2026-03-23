import mongoose from "mongoose";
import request from "supertest";
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
import AlertNotificationJob from "../src/models/AlertNotificationJob";
import CareEvent from "../src/models/CareEvent";

describe("POST /events/notification-status", () => {
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
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T12:00:00.000Z"));
    mutableEnv.AURA_WEBHOOK_KEY = "test-webhook-key";
    await Promise.all([
      Alert.deleteMany({}),
      AlertNotificationJob.deleteMany({}),
      CareEvent.deleteMany({}),
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function createAlert() {
    return Alert.create({
      patientId: "p1",
      reason: "PAIN_GE_THRESHOLD",
      source: {
        type: "checkin",
        sourceId: new mongoose.Types.ObjectId().toString(),
      },
      status: "open",
      notification: {
        channel: "telegram",
        status: "unknown",
        retryCount: 0,
      },
    });
  }

  it("returns 401 for missing or invalid webhook key", async () => {
    const alert = await createAlert();
    const payload = {
      alertId: String(alert._id),
      channel: "telegram",
      status: "attempted",
    };

    const missingHeaderResponse = await request(app)
      .post("/events/notification-status")
      .send(payload);
    const wrongHeaderResponse = await request(app)
      .post("/events/notification-status")
      .set("x-aura-webhook-key", "wrong-key")
      .send(payload);

    expect(missingHeaderResponse.status).toBe(401);
    expect(missingHeaderResponse.body.error).toBe("UNAUTHORIZED");
    expect(wrongHeaderResponse.status).toBe(401);
    expect(wrongHeaderResponse.body.error).toBe("UNAUTHORIZED");
  });

  it("returns 400 for invalid alertId", async () => {
    const response = await request(app)
      .post("/events/notification-status")
      .set("x-aura-webhook-key", "test-webhook-key")
      .send({
        alertId: "invalid-id",
        channel: "telegram",
        status: "sent",
      });

    expect(response.status).toBe(400);
    expect(response.body.ok).toBe(false);
    expect(response.body.error).toBe("VALIDATION_ERROR");
  });

  it("returns 404 when alert does not exist", async () => {
    const response = await request(app)
      .post("/events/notification-status")
      .set("x-aura-webhook-key", "test-webhook-key")
      .send({
        alertId: new mongoose.Types.ObjectId().toString(),
        channel: "telegram",
        status: "sent",
      });

    expect(response.status).toBe(404);
    expect(response.body.ok).toBe(false);
    expect(response.body.error).toBe("NOT_FOUND");
  });

  it("writes sent status once and remains idempotent for duplicate payload", async () => {
    const alert = await createAlert();
    const requestId = "req-events-1";
    const payload = {
      alertId: String(alert._id),
      channel: "telegram",
      status: "sent",
      timestamp: "2026-05-01T11:45:30.000Z",
      messageId: "telegram-message-1",
      target: "telegram:group:-100123",
      meta: {
        workflow: "01",
        executionId: "exec-1",
      },
    } as const;

    const first = await request(app)
      .post("/events/notification-status")
      .set("x-request-id", requestId)
      .set("x-aura-webhook-key", "test-webhook-key")
      .send(payload);
    const second = await request(app)
      .post("/events/notification-status")
      .set("x-aura-webhook-key", "test-webhook-key")
      .send(payload);

    expect(first.status).toBe(200);
    expect(first.body.ok).toBe(true);
    expect(first.headers["x-request-id"]).toBe(requestId);
    expect(first.body.alert.notification.status).toBe("sent");
    expect(first.body.alert.notification.sentAt).toBe("2026-05-01T11:45:30.000Z");
    expect(first.body.writtenEvents).toContain("NOTIFICATION_SENT");

    expect(second.status).toBe(200);
    expect(second.body.ok).toBe(true);

    const job = await AlertNotificationJob.findOne({
      alertId: String(alert._id),
      channel: "telegram",
    }).lean();
    expect(job?.state).toBe("delivered");
    expect(job?.messageId).toBe("telegram-message-1");

    const sentEvents = await CareEvent.find({
      alertId: String(alert._id),
      type: "NOTIFICATION_SENT",
    }).lean();
    expect(sentEvents).toHaveLength(1);
  });

  it("sanitizes failed notification errors before persistence", async () => {
    const alert = await createAlert();
    const rawError =
      "Telegram request failed: https://api.telegram.org/bot123456:ABCDEFGHIJKLMNOPQRSTUVWXYZ/sendMessage token=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

    const response = await request(app)
      .post("/events/notification-status")
      .set("x-aura-webhook-key", "test-webhook-key")
      .send({
        alertId: String(alert._id),
        channel: "telegram",
        status: "failed",
        timestamp: "2026-05-01T11:46:00.000Z",
        error: rawError,
      });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.alert.notification.status).toBe("failed");

    const updated = await Alert.findById(alert._id).lean();
    const storedError = updated?.notification?.error ?? "";
    expect(typeof storedError).toBe("string");
    expect(storedError.length).toBeLessThanOrEqual(200);
    expect(storedError).not.toContain("http");
    expect(storedError).not.toContain("ABCDEFGHIJKLMNOPQRSTUVWXYZ");

    const failedEvents = await CareEvent.find({
      alertId: String(alert._id),
      type: "NOTIFICATION_FAILED",
    }).lean();
    expect(failedEvents).toHaveLength(1);

    const job = await AlertNotificationJob.findOne({
      alertId: String(alert._id),
      channel: "telegram",
    }).lean();
    expect(job?.state).toBe("failed");
    expect(job?.lastError).toBe(storedError);
  });

  it("ignores stale status updates that are older than the latest notification timestamp", async () => {
    const alert = await createAlert();

    const sentResponse = await request(app)
      .post("/events/notification-status")
      .set("x-aura-webhook-key", "test-webhook-key")
      .send({
        alertId: String(alert._id),
        channel: "telegram",
        status: "sent",
        timestamp: "2026-05-01T11:50:00.000Z",
      });

    const staleFailedResponse = await request(app)
      .post("/events/notification-status")
      .set("x-aura-webhook-key", "test-webhook-key")
      .send({
        alertId: String(alert._id),
        channel: "telegram",
        status: "failed",
        timestamp: "2026-05-01T11:40:00.000Z",
        error: "network timeout",
      });

    expect(sentResponse.status).toBe(200);
    expect(staleFailedResponse.status).toBe(200);
    expect(staleFailedResponse.body.writtenEvents).toEqual([]);

    const updated = await Alert.findById(alert._id).lean();
    expect(updated?.notification?.status).toBe("sent");
    expect(updated?.notification?.sentAt?.toISOString()).toBe(
      "2026-05-01T11:50:00.000Z"
    );

    const failedEvents = await CareEvent.find({
      alertId: String(alert._id),
      type: "NOTIFICATION_FAILED",
    }).lean();
    expect(failedEvents).toHaveLength(0);
  });

  it("prefers attemptKey when present and ignores callbacks for a different active attempt", async () => {
    const alert = await createAlert();
    await AlertNotificationJob.create({
      alertId: String(alert._id),
      patientId: "p1",
      channel: "telegram",
      state: "awaiting_callback",
      dispatchKind: "retry",
      attemptCount: 2,
      currentAttemptKey: "attempt-2",
      lastAttemptedAt: new Date("2026-05-01T11:55:00.000Z"),
      callbackDeadlineAt: new Date("2026-05-01T12:00:00.000Z"),
    });

    const stale = await request(app)
      .post("/events/notification-status")
      .set("x-aura-webhook-key", "test-webhook-key")
      .send({
        alertId: String(alert._id),
        channel: "telegram",
        status: "sent",
        timestamp: "2026-05-01T11:56:00.000Z",
        attemptKey: "attempt-1",
      });

    expect(stale.status).toBe(200);
    expect(stale.body.writtenEvents).toEqual([]);

    const fresh = await request(app)
      .post("/events/notification-status")
      .set("x-aura-webhook-key", "test-webhook-key")
      .send({
        alertId: String(alert._id),
        channel: "telegram",
        status: "sent",
        timestamp: "2026-05-01T11:57:00.000Z",
        attemptKey: "attempt-2",
        messageId: "telegram-message-2",
      });

    expect(fresh.status).toBe(200);
    expect(fresh.body.alert.notification.status).toBe("sent");

    const job = await AlertNotificationJob.findOne({
      alertId: String(alert._id),
      channel: "telegram",
    }).lean();
    expect(job?.state).toBe("delivered");
    expect(job?.messageId).toBe("telegram-message-2");
  });
});

describe("POST /events/automation-status", () => {
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
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-02T09:00:00.000Z"));
    mutableEnv.AURA_WEBHOOK_KEY = "test-webhook-key";
    await CareEvent.deleteMany({});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("requires webhook authentication", async () => {
    const response = await request(app).post("/events/automation-status").send({
      workflow: "task_reminder_timing",
      status: "sent",
      channel: "telegram",
      items: [{ dedupeKey: "task:1" }],
    });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("UNAUTHORIZED");
  });

  it("writes automation status events once per dedupe key and remains idempotent", async () => {
    const payload = {
      workflow: "task_reminder_timing",
      status: "sent",
      channel: "telegram",
      timestamp: "2026-05-02T08:30:00.000Z",
      target: "telegram:-100123",
      items: [
        {
          dedupeKey: "task-reminder:abc:overdue:1",
          patientId: "p1",
          taskId: "task-1",
          linkedEntityType: "task",
          linkedEntityId: "task-1",
          title: "Complete your rehab check-in",
        },
      ],
      meta: {
        executionId: "exec-123",
        workflowId: "wf-04",
      },
    } as const;

    const first = await request(app)
      .post("/events/automation-status")
      .set("x-aura-webhook-key", "test-webhook-key")
      .send(payload);
    const second = await request(app)
      .post("/events/automation-status")
      .set("x-aura-webhook-key", "test-webhook-key")
      .send(payload);

    expect(first.status).toBe(200);
    expect(first.body.ok).toBe(true);
    expect(first.body.writtenEvents).toHaveLength(1);

    expect(second.status).toBe(200);
    expect(second.body.ok).toBe(true);
    expect(second.body.writtenEvents).toEqual([]);

    const stored = await CareEvent.find({ type: "AUTOMATION_STATUS" }).lean();
    expect(stored).toHaveLength(1);
    expect(stored[0].patientId).toBe("p1");
    expect(stored[0].payload).toMatchObject({
      workflow: "task_reminder_timing",
      status: "sent",
      dedupeKey: "task-reminder:abc:overdue:1",
      taskId: "task-1",
    });
  });
});
