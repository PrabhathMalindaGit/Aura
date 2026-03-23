import mongoose from "mongoose";
import {
  afterAll,
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

import Alert from "../src/models/Alert";
import AlertNotificationJob from "../src/models/AlertNotificationJob";
import {
  applyNotificationCallback,
  dispatchJob,
  enqueueInitialAlertNotification,
  ensureJobForLegacyAlert,
  reconcileStaleJobs,
  requestAlertNotificationRetry,
  syncAlertNotificationSnapshot,
} from "../src/services/alertNotificationService";
import {
  emitAlertCreated,
  emitNotificationRetryRequested,
} from "../src/services/n8n";
import { logger } from "../src/utils/logger";

describe("alertNotificationService", () => {
  let mongoServer: MongoMemoryServer | null = null;
  let infoSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-01T09:00:00.000Z"));
    vi.restoreAllMocks();
    infoSpy = vi.spyOn(logger, "info").mockImplementation(() => {});
    warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
    vi.mocked(emitAlertCreated).mockReset();
    vi.mocked(emitNotificationRetryRequested).mockReset();
    vi.mocked(emitAlertCreated).mockResolvedValue(true);
    vi.mocked(emitNotificationRetryRequested).mockResolvedValue(true);

    await Promise.all([Alert.deleteMany({}), AlertNotificationJob.deleteMany({})]);
  });

  async function createAlert(
    overrides: Partial<{
      patientId: string;
      notification: Record<string, unknown>;
      reason: string;
    }> = {}
  ) {
    return Alert.create({
      patientId: overrides.patientId ?? "p1",
      reason: overrides.reason ?? "PAIN_GE_THRESHOLD",
      source: {
        type: "checkin",
        sourceId: new mongoose.Types.ObjectId().toString(),
      },
      status: "open",
      notification:
        overrides.notification ?? {
          channel: "telegram",
          status: "unknown",
          retryCount: 0,
        },
    });
  }

  it("creates one durable job for a new high-risk alert", async () => {
    const alert = await createAlert();

    const job = await enqueueInitialAlertNotification({
      alert: {
        _id: alert._id,
        patientId: alert.patientId,
        reason: ["PAIN_GE_THRESHOLD"],
      },
      reasonCodes: ["PAIN_GE_THRESHOLD"],
      requestId: "req-enqueue-1",
    });

    expect(job.alertId).toBe(String(alert._id));
    expect(job.state).toBe("queued");
    expect(await AlertNotificationJob.countDocuments()).toBe(1);
    expect(infoSpy).toHaveBeenCalledWith(
      "notification.job.enqueued",
      expect.objectContaining({
        requestId: "req-enqueue-1",
        alertId: String(alert._id),
        jobId: String(job._id),
        patientId: alert.patientId,
        dispatchKind: "initial",
        state: "queued",
      })
    );
  });

  it("enforces unique alertId + channel integrity for initial enqueue", async () => {
    const alert = await createAlert();

    const [first, second] = await Promise.all([
      enqueueInitialAlertNotification({
        alert: {
          _id: alert._id,
          patientId: alert.patientId,
          reason: ["PAIN_GE_THRESHOLD"],
        },
        reasonCodes: ["PAIN_GE_THRESHOLD"],
      }),
      enqueueInitialAlertNotification({
        alert: {
          _id: alert._id,
          patientId: alert.patientId,
          reason: ["PAIN_GE_THRESHOLD"],
        },
        reasonCodes: ["PAIN_GE_THRESHOLD"],
      }),
    ]);

    expect(String(first._id)).toBe(String(second._id));
    expect(
      await AlertNotificationJob.countDocuments({
        alertId: String(alert._id),
        channel: "telegram",
      })
    ).toBe(1);
  });

  it("manual retry lazily hydrates and reuses the same durable job", async () => {
    const alert = await createAlert({
      notification: {
        channel: "telegram",
        status: "failed",
        attemptedAt: new Date("2026-07-01T08:30:00.000Z"),
        failedAt: new Date("2026-07-01T08:30:00.000Z"),
        error: "N8N_WEBHOOK_DELIVERY_FAILED",
        retryCount: 0,
      },
    });

    const first = await requestAlertNotificationRetry({
      alert: {
        _id: alert._id,
        patientId: alert.patientId,
        reason: alert.reason,
        notification: alert.notification,
      },
      actor: { id: "c1", name: "Dr One" },
      reason: "manual retry",
    });

    vi.advanceTimersByTime(16_000);

    const second = await requestAlertNotificationRetry({
      alert: {
        _id: alert._id,
        patientId: alert.patientId,
        reason: alert.reason,
        notification: alert.notification,
      },
      actor: { id: "c1", name: "Dr One" },
      reason: "manual retry again",
    });

    expect(String(first._id)).toBe(String(second._id));
    expect(
      await AlertNotificationJob.countDocuments({
        alertId: String(alert._id),
        channel: "telegram",
      })
    ).toBe(1);
  });

  it("dispatchJob moves a queued job to awaiting_callback on success", async () => {
    const alert = await createAlert();
    const job = await enqueueInitialAlertNotification({
      alert: {
        _id: alert._id,
        patientId: alert.patientId,
        reason: ["PAIN_GE_THRESHOLD"],
      },
      reasonCodes: ["PAIN_GE_THRESHOLD"],
    });

    const delivered = await dispatchJob(String(job._id), undefined, {
      requestId: "req-dispatch-1",
    });

    expect(delivered).toBe(true);
    const updatedJob = await AlertNotificationJob.findById(job._id).lean();
    expect(updatedJob?.state).toBe("awaiting_callback");
    expect(updatedJob?.attemptCount).toBe(1);
    expect(updatedJob?.currentAttemptKey).toBeTruthy();

    const updatedAlert = await Alert.findById(alert._id).lean();
    expect(updatedAlert?.notification?.status).toBe("unknown");
    expect(updatedAlert?.notification?.attemptedAt).toBeTruthy();
    expect(infoSpy).toHaveBeenCalledWith(
      "notification.job.dispatched",
      expect.objectContaining({
        requestId: "req-dispatch-1",
        alertId: String(alert._id),
        jobId: String(job._id),
        patientId: alert.patientId,
        dispatchKind: "initial",
        state: "awaiting_callback",
      })
    );
  });

  it("dispatchJob leaves the job retryable when initial delivery fails", async () => {
    const alert = await createAlert();
    const job = await enqueueInitialAlertNotification({
      alert: {
        _id: alert._id,
        patientId: alert.patientId,
        reason: ["PAIN_GE_THRESHOLD"],
      },
      reasonCodes: ["PAIN_GE_THRESHOLD"],
    });
    vi.mocked(emitAlertCreated).mockResolvedValue(false);

    const delivered = await dispatchJob(String(job._id), undefined, {
      requestId: "req-dispatch-failed",
    });

    expect(delivered).toBe(false);
    const updatedJob = await AlertNotificationJob.findById(job._id).lean();
    expect(updatedJob?.state).toBe("retry_scheduled");
    expect(updatedJob?.attemptCount).toBe(1);
    expect(updatedJob?.lastError).toBe("N8N_WEBHOOK_DELIVERY_FAILED");
    expect(warnSpy).toHaveBeenCalledWith(
      "notification.job.dispatch_failed",
      expect.objectContaining({
        requestId: "req-dispatch-failed",
        alertId: String(alert._id),
        jobId: String(job._id),
        patientId: alert.patientId,
        dispatchKind: "initial",
        state: "retry_scheduled",
      })
    );
  });

  it("emits bounded identifier-only logs for callback lifecycle events", async () => {
    const alert = await createAlert();
    const job = await enqueueInitialAlertNotification({
      alert: {
        _id: alert._id,
        patientId: alert.patientId,
        reason: ["PAIN_GE_THRESHOLD"],
      },
      reasonCodes: ["PAIN_GE_THRESHOLD"],
      requestId: "req-callback-setup",
    });

    await dispatchJob(String(job._id), undefined, {
      requestId: "req-callback-dispatch",
    });

    const awaitingJob = await AlertNotificationJob.findById(job._id);
    expect(awaitingJob?.currentAttemptKey).toBeTruthy();

    await applyNotificationCallback({
      alertId: String(alert._id),
      body: {
        alertId: String(alert._id),
        channel: "telegram",
        status: "sent",
        attemptKey: awaitingJob?.currentAttemptKey,
        meta: {
          workflow: "01",
          executionId: "exec-1",
        },
      },
      callbackTimestamp: new Date("2026-07-01T09:02:00.000Z"),
      requestId: "req-callback-apply",
    });

    const callbackLog = infoSpy.mock.calls.find(
      ([event]) => event === "notification.callback.applied"
    );
    expect(callbackLog?.[1]).toEqual({
      requestId: "req-callback-apply",
      jobId: String(job._id),
      alertId: String(alert._id),
      patientId: alert.patientId,
      attemptKey: awaitingJob?.currentAttemptKey,
      dispatchKind: "initial",
      workflow: "01",
      executionId: "exec-1",
      state: "delivered",
      callbackStatus: "sent",
    });

    await applyNotificationCallback({
      alertId: String(alert._id),
      body: {
        alertId: String(alert._id),
        channel: "telegram",
        status: "sent",
        attemptKey: "wrong-attempt-key",
        meta: {
          workflow: "01",
          executionId: "exec-2",
        },
      },
      callbackTimestamp: new Date("2026-07-01T09:03:00.000Z"),
      requestId: "req-callback-stale",
    });

    const staleLog = infoSpy.mock.calls.find(
      ([event, meta]) =>
        event === "notification.callback.stale" &&
        (meta as Record<string, unknown>)?.requestId === "req-callback-stale"
    );
    expect(staleLog?.[1]).toEqual({
      requestId: "req-callback-stale",
      jobId: String(job._id),
      alertId: String(alert._id),
      patientId: alert.patientId,
      attemptKey: awaitingJob?.currentAttemptKey,
      dispatchKind: "initial",
      workflow: "01",
      executionId: "exec-2",
    });
  });

  it("callback with attemptKey updates the matching job and alert snapshot", async () => {
    const alert = await createAlert();
    const hydrated = await ensureJobForLegacyAlert({
      _id: alert._id,
      patientId: alert.patientId,
      reason: alert.reason,
      notification: alert.notification,
    });

    hydrated.state = "awaiting_callback";
    hydrated.dispatchKind = "retry";
    hydrated.currentAttemptKey = "attempt-1";
    hydrated.attemptCount = 1;
    hydrated.lastAttemptedAt = new Date("2026-07-01T08:50:00.000Z");
    hydrated.callbackDeadlineAt = new Date("2026-07-01T08:55:00.000Z");
    await hydrated.save();

    const result = await applyNotificationCallback({
      alertId: String(alert._id),
      body: {
        alertId: String(alert._id),
        channel: "telegram",
        status: "sent",
        attemptKey: "attempt-1",
      },
      callbackTimestamp: new Date("2026-07-01T08:52:00.000Z"),
      callbackMessageId: "telegram-message-1",
    });

    expect(result?.stale).toBe(false);
    const updatedJob = await AlertNotificationJob.findById(hydrated._id).lean();
    expect(updatedJob?.state).toBe("delivered");
    expect(updatedJob?.messageId).toBe("telegram-message-1");

    const updatedAlert = await Alert.findById(alert._id).lean();
    expect(updatedAlert?.notification?.status).toBe("sent");
    expect(updatedAlert?.notification?.messageId).toBe("telegram-message-1");
  });

  it("callback without attemptKey still works via timestamp fallback", async () => {
    const alert = await createAlert();

    const result = await applyNotificationCallback({
      alertId: String(alert._id),
      body: {
        alertId: String(alert._id),
        channel: "telegram",
        status: "failed",
      },
      callbackTimestamp: new Date("2026-07-01T08:45:00.000Z"),
    });

    expect(result?.stale).toBe(false);
    const updatedJob = await AlertNotificationJob.findOne({
      alertId: String(alert._id),
      channel: "telegram",
    }).lean();
    expect(updatedJob?.state).toBe("failed");

    const updatedAlert = await Alert.findById(alert._id).lean();
    expect(updatedAlert?.notification?.status).toBe("failed");
  });

  it("reconciliation marks stale awaiting_callback jobs for retry", async () => {
    const alert = await createAlert();
    const job = await ensureJobForLegacyAlert({
      _id: alert._id,
      patientId: alert.patientId,
      reason: alert.reason,
      notification: {
        channel: "telegram",
        status: "unknown",
        attemptedAt: new Date("2026-07-01T08:00:00.000Z"),
        retryCount: 0,
      },
    });

    job.state = "awaiting_callback";
    job.dispatchKind = "initial";
    job.attemptCount = 1;
    job.lastAttemptedAt = new Date("2026-07-01T08:00:00.000Z");
    job.callbackDeadlineAt = new Date("2026-07-01T08:05:00.000Z");
    await job.save();

    const result = await reconcileStaleJobs({
      limit: 10,
      now: new Date("2026-07-01T09:00:00.000Z"),
      requestId: "req-reconcile-1",
    });

    expect(result.reconciled).toBe(1);
    expect(result.scheduled).toBe(1);
    const updatedJob = await AlertNotificationJob.findById(job._id).lean();
    expect(updatedJob?.state).toBe("reconciliation_needed");
    expect(updatedJob?.nextAttemptAt?.toISOString()).toBe(
      "2026-07-01T09:00:00.000Z"
    );
    expect(infoSpy).toHaveBeenCalledWith("notification.jobs.reconciled", {
      requestId: "req-reconcile-1",
      reconciled: 1,
      scheduled: 1,
      failed: 0,
    });
  });

  it("syncAlertNotificationSnapshot keeps Alert.notification aligned with the durable job", async () => {
    const alert = await createAlert();
    await AlertNotificationJob.create({
      alertId: String(alert._id),
      patientId: alert.patientId,
      channel: "telegram",
      state: "failed",
      dispatchKind: "retry",
      attemptCount: 2,
      lastAttemptedAt: new Date("2026-07-01T08:45:00.000Z"),
      lastCallbackAt: new Date("2026-07-01T08:46:00.000Z"),
      lastError: "TELEGRAM_DELIVERY_FAILED",
    });

    await syncAlertNotificationSnapshot(String(alert._id));

    const updatedAlert = await Alert.findById(alert._id).lean();
    expect(updatedAlert?.notification?.status).toBe("failed");
    expect(updatedAlert?.notification?.retryCount).toBe(1);
    expect(updatedAlert?.notification?.error).toBe("TELEGRAM_DELIVERY_FAILED");
  });
});
