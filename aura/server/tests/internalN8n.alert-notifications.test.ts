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

vi.mock("../src/services/n8n", async () => {
  const actual = await vi.importActual<typeof import("../src/services/n8n")>(
    "../src/services/n8n"
  );

  return {
    ...actual,
    emitAlertCreated: vi.fn(async () => true),
    emitNotificationRetryRequested: vi.fn(async () => true),
  };
});

import app from "../src/app";
import { env } from "../src/env";
import Alert from "../src/models/Alert";
import AlertNotificationJob from "../src/models/AlertNotificationJob";
import {
  emitAlertCreated,
  emitNotificationRetryRequested,
} from "../src/services/n8n";

describe("internal n8n alert notification routes", () => {
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
    vi.setSystemTime(new Date("2026-07-05T09:00:00.000Z"));
    mutableEnv.AURA_WEBHOOK_KEY = "test-webhook-key";
    vi.restoreAllMocks();
    vi.mocked(emitAlertCreated).mockReset();
    vi.mocked(emitNotificationRetryRequested).mockReset();
    vi.mocked(emitAlertCreated).mockResolvedValue(true);
    vi.mocked(emitNotificationRetryRequested).mockResolvedValue(true);

    await Promise.all([Alert.deleteMany({}), AlertNotificationJob.deleteMany({})]);
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
    });
  }

  it("requires webhook key for alert notification process route", async () => {
    const alert = await createAlert();
    await AlertNotificationJob.create({
      alertId: String(alert._id),
      patientId: alert.patientId,
      channel: "telegram",
      state: "queued",
      dispatchKind: "initial",
      attemptCount: 0,
      nextAttemptAt: new Date("2026-07-05T08:59:00.000Z"),
      reasonCodes: ["PAIN_GE_THRESHOLD"],
    });

    const response = await request(app)
      .post("/internal/n8n/alert-notifications/process")
      .send({ limit: 10 });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("UNAUTHORIZED");
    expect(vi.mocked(emitAlertCreated)).not.toHaveBeenCalled();

    const job = await AlertNotificationJob.findOne({
      alertId: String(alert._id),
      channel: "telegram",
    }).lean();
    expect(job?.state).toBe("queued");
    expect(job?.attemptCount).toBe(0);
  });

  it("requires webhook key for alert notification reconcile route", async () => {
    const alert = await createAlert();
    await AlertNotificationJob.create({
      alertId: String(alert._id),
      patientId: alert.patientId,
      channel: "telegram",
      state: "awaiting_callback",
      dispatchKind: "initial",
      attemptCount: 1,
      lastAttemptedAt: new Date("2026-07-05T08:00:00.000Z"),
      callbackDeadlineAt: new Date("2026-07-05T08:05:00.000Z"),
      reasonCodes: ["PAIN_GE_THRESHOLD"],
    });

    const response = await request(app)
      .post("/internal/n8n/alert-notifications/reconcile")
      .send({ limit: 10 });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("UNAUTHORIZED");

    const job = await AlertNotificationJob.findOne({
      alertId: String(alert._id),
      channel: "telegram",
    }).lean();
    expect(job?.state).toBe("awaiting_callback");
    expect(job?.attemptCount).toBe(1);
  });

  it("processes due alert notification jobs through the shared dispatch path", async () => {
    const alert = await createAlert();
    await AlertNotificationJob.create({
      alertId: String(alert._id),
      patientId: alert.patientId,
      channel: "telegram",
      state: "queued",
      dispatchKind: "initial",
      attemptCount: 0,
      nextAttemptAt: new Date("2026-07-05T08:59:00.000Z"),
      reasonCodes: ["PAIN_GE_THRESHOLD"],
    });

    const response = await request(app)
      .post("/internal/n8n/alert-notifications/process")
      .set("x-aura-webhook-key", "test-webhook-key")
      .send({ limit: 10 });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.attempted).toBe(1);
    expect(response.body.delivered).toBe(1);

    const job = await AlertNotificationJob.findOne({
      alertId: String(alert._id),
      channel: "telegram",
    }).lean();
    expect(job?.state).toBe("awaiting_callback");
    expect(job?.attemptCount).toBe(1);
    expect(vi.mocked(emitAlertCreated)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(emitNotificationRetryRequested)).not.toHaveBeenCalled();
  });

  it("repeated process calls do not create duplicate active work for the same job", async () => {
    const alert = await createAlert();
    await AlertNotificationJob.create({
      alertId: String(alert._id),
      patientId: alert.patientId,
      channel: "telegram",
      state: "queued",
      dispatchKind: "initial",
      attemptCount: 0,
      nextAttemptAt: new Date("2026-07-05T08:59:00.000Z"),
      reasonCodes: ["PAIN_GE_THRESHOLD"],
    });

    const first = await request(app)
      .post("/internal/n8n/alert-notifications/process")
      .set("x-aura-webhook-key", "test-webhook-key")
      .send({ limit: 10 });
    const second = await request(app)
      .post("/internal/n8n/alert-notifications/process")
      .set("x-aura-webhook-key", "test-webhook-key")
      .send({ limit: 10 });

    expect(first.status).toBe(200);
    expect(first.body.attempted).toBe(1);
    expect(first.body.delivered).toBe(1);
    expect(second.status).toBe(200);
    expect(second.body.attempted).toBe(0);
    expect(second.body.delivered).toBe(0);
    expect(vi.mocked(emitAlertCreated)).toHaveBeenCalledTimes(1);

    const job = await AlertNotificationJob.findOne({
      alertId: String(alert._id),
      channel: "telegram",
    }).lean();
    expect(job?.state).toBe("awaiting_callback");
    expect(job?.attemptCount).toBe(1);
  });

  it("reconciles stale awaiting-callback jobs", async () => {
    const alert = await createAlert();
    await AlertNotificationJob.create({
      alertId: String(alert._id),
      patientId: alert.patientId,
      channel: "telegram",
      state: "awaiting_callback",
      dispatchKind: "initial",
      attemptCount: 1,
      lastAttemptedAt: new Date("2026-07-05T08:00:00.000Z"),
      callbackDeadlineAt: new Date("2026-07-05T08:05:00.000Z"),
      reasonCodes: ["PAIN_GE_THRESHOLD"],
    });

    const response = await request(app)
      .post("/internal/n8n/alert-notifications/reconcile")
      .set("x-aura-webhook-key", "test-webhook-key")
      .send({ limit: 10 });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.reconciled).toBe(1);
    expect(response.body.scheduled).toBe(1);

    const job = await AlertNotificationJob.findOne({
      alertId: String(alert._id),
      channel: "telegram",
    }).lean();
    expect(job?.state).toBe("reconciliation_needed");
  });

  it("repeated reconcile calls do not keep mutating already-reconciled jobs", async () => {
    const alert = await createAlert();
    await AlertNotificationJob.create({
      alertId: String(alert._id),
      patientId: alert.patientId,
      channel: "telegram",
      state: "awaiting_callback",
      dispatchKind: "initial",
      attemptCount: 1,
      lastAttemptedAt: new Date("2026-07-05T08:00:00.000Z"),
      callbackDeadlineAt: new Date("2026-07-05T08:05:00.000Z"),
      reasonCodes: ["PAIN_GE_THRESHOLD"],
    });

    const first = await request(app)
      .post("/internal/n8n/alert-notifications/reconcile")
      .set("x-aura-webhook-key", "test-webhook-key")
      .send({ limit: 10 });
    const second = await request(app)
      .post("/internal/n8n/alert-notifications/reconcile")
      .set("x-aura-webhook-key", "test-webhook-key")
      .send({ limit: 10 });

    expect(first.status).toBe(200);
    expect(first.body.reconciled).toBe(1);
    expect(first.body.scheduled).toBe(1);
    expect(second.status).toBe(200);
    expect(second.body.reconciled).toBe(0);
    expect(second.body.scheduled).toBe(0);
    expect(second.body.failed).toBe(0);

    const job = await AlertNotificationJob.findOne({
      alertId: String(alert._id),
      channel: "telegram",
    }).lean();
    expect(job?.state).toBe("reconciliation_needed");
  });
});
