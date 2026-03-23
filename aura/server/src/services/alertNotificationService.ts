import mongoose from "mongoose";

import type { RequestCorrelationContext } from "../middleware/requestContext";
import Alert from "../models/Alert";
import AlertNotificationJob from "../models/AlertNotificationJob";
import CareEvent from "../models/CareEvent";
import type { NotificationStatusCallbackBody } from "../types/events";
import { logger } from "../utils/logger";
import { sanitizeNotificationError } from "../utils/sanitize";
import {
  emitAlertCreated,
  emitNotificationRetryRequested,
} from "./n8n";

export const ALERT_NOTIFICATION_CHANNEL = "telegram" as const;
const RETRY_AFTER_MS = 60_000;
const CALLBACK_DEADLINE_MS = 5 * 60_000;
const MAX_DELIVERY_ATTEMPTS = 4;
export const NOTIFICATION_RETRY_THROTTLE_MS = 15_000;
export const NOTIFICATION_RETRY_AFTER_SECONDS = 15;

export type AlertNotificationState =
  | "queued"
  | "sending"
  | "awaiting_callback"
  | "retry_scheduled"
  | "reconciliation_needed"
  | "delivered"
  | "failed"
  | "skipped";

export type AlertNotificationActor = {
  id: string;
  name?: string;
};

type AlertDocumentLike = {
  _id: unknown;
  patientId: string;
  reason?: unknown;
  notification?: unknown;
};

type AlertNotificationSnapshot = {
  channel: "telegram";
  status: "unknown" | "sent" | "failed" | "skipped";
  attemptedAt?: Date;
  sentAt?: Date;
  failedAt?: Date;
  target?: string;
  messageId?: string;
  error?: string;
  retryCount: number;
};

export class AlertNotificationRetryThrottleError extends Error {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number = NOTIFICATION_RETRY_AFTER_SECONDS) {
    super("Notification retry requested too soon");
    this.name = "AlertNotificationRetryThrottleError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function toLogId(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }

  return String(value);
}

function buildNotificationLogContext(
  jobLike: {
    _id?: unknown;
    alertId?: unknown;
    patientId?: unknown;
    currentAttemptKey?: unknown;
    dispatchKind?: unknown;
  },
  context?: RequestCorrelationContext,
  extra?: Record<string, unknown>
): Record<string, unknown> {
  return {
    requestId: context?.requestId,
    jobId: toLogId(jobLike._id),
    alertId: toLogId(jobLike.alertId),
    patientId: toLogId(jobLike.patientId),
    attemptKey: toLogId(jobLike.currentAttemptKey),
    dispatchKind: toStringValue(jobLike.dispatchKind),
    ...(extra ?? {}),
  };
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    error instanceof mongoose.Error &&
    "code" in error &&
    typeof error.code === "number" &&
    error.code === 11000
  );
}

function toDate(value: unknown): Date | undefined {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value;
  }

  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return undefined;
}

function toStringValue(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function parseReasonCodes(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  if (typeof value !== "string") {
    return [];
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeAlertNotification(raw: unknown): AlertNotificationSnapshot {
  const source =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};

  const statusRaw = toStringValue(source.status);

  return {
    channel: ALERT_NOTIFICATION_CHANNEL,
    status:
      statusRaw === "sent" ||
      statusRaw === "failed" ||
      statusRaw === "skipped" ||
      statusRaw === "unknown"
        ? statusRaw
        : "unknown",
    attemptedAt: toDate(source.attemptedAt),
    sentAt: toDate(source.sentAt),
    failedAt: toDate(source.failedAt),
    target: toStringValue(source.target),
    messageId: toStringValue(source.messageId),
    error: toStringValue(source.error),
    retryCount:
      typeof source.retryCount === "number" &&
      Number.isFinite(source.retryCount) &&
      source.retryCount >= 0
        ? source.retryCount
        : 0,
  };
}

function stateFromLegacyNotification(
  notification: AlertNotificationSnapshot
): AlertNotificationState {
  if (notification.status === "sent") {
    return "delivered";
  }
  if (notification.status === "failed") {
    return "failed";
  }
  if (notification.status === "skipped") {
    return "skipped";
  }
  if (notification.attemptedAt) {
    return "awaiting_callback";
  }
  return "queued";
}

function attemptCountFromLegacyNotification(
  notification: AlertNotificationSnapshot
): number {
  if (notification.retryCount > 0) {
    return notification.retryCount + 1;
  }

  if (notification.attemptedAt || notification.sentAt || notification.failedAt) {
    return 1;
  }

  return 0;
}

function latestDate(...values: Array<Date | undefined>): Date | undefined {
  const candidates = values.filter((value): value is Date => Boolean(value));
  if (candidates.length === 0) {
    return undefined;
  }

  return candidates.reduce((latest, current) =>
    current.getTime() > latest.getTime() ? current : latest
  );
}

function mapJobStateToSnapshotStatus(
  state: AlertNotificationState
): AlertNotificationSnapshot["status"] {
  if (state === "delivered") {
    return "sent";
  }
  if (state === "failed") {
    return "failed";
  }
  if (state === "skipped") {
    return "skipped";
  }
  return "unknown";
}

function buildSnapshotFromJob(job: Record<string, unknown>): AlertNotificationSnapshot {
  const state = toStringValue(job.state) as AlertNotificationState | undefined;
  const lastAttemptedAt = toDate(job.lastAttemptedAt);
  const lastCallbackAt = toDate(job.lastCallbackAt);
  const attemptCount =
    typeof job.attemptCount === "number" &&
    Number.isFinite(job.attemptCount) &&
    job.attemptCount >= 0
      ? job.attemptCount
      : 0;

  return {
    channel: ALERT_NOTIFICATION_CHANNEL,
    status: mapJobStateToSnapshotStatus(state ?? "queued"),
    attemptedAt: lastAttemptedAt,
    sentAt: state === "delivered" ? lastCallbackAt ?? lastAttemptedAt : undefined,
    failedAt: state === "failed" ? lastCallbackAt ?? toDate(job.updatedAt) : undefined,
    target: toStringValue(job.target),
    messageId: toStringValue(job.messageId),
    error: toStringValue(job.lastError),
    retryCount: Math.max(attemptCount - 1, 0),
  };
}

function makeAttemptKey(): string {
  return new mongoose.Types.ObjectId().toString();
}

async function writeRetryCareEvent(
  alertId: string,
  patientId: string,
  type:
    | "NOTIFICATION_RETRY_REQUESTED"
    | "NOTIFICATION_RETRY_WEBHOOK_DELIVERED"
    | "NOTIFICATION_RETRY_WEBHOOK_FAILED",
  payload: Record<string, unknown>
): Promise<void> {
  try {
    await CareEvent.create({
      type,
      patientId,
      alertId,
      payload,
    });
  } catch (error) {
    logger.error("Alert notification retry care event write failed", {
      alertId,
      patientId,
      type,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function syncAlertNotificationSnapshot(alertId: string) {
  const [alert, job] = await Promise.all([
    Alert.findById(alertId),
    AlertNotificationJob.findOne({ alertId, channel: ALERT_NOTIFICATION_CHANNEL }).lean(),
  ]);

  if (!alert) {
    return null;
  }

  if (!job) {
    return alert;
  }

  // The job model is the source of truth; Alert.notification is the compatibility snapshot.
  const snapshot = buildSnapshotFromJob(job as Record<string, unknown>);
  const current = normalizeAlertNotification(alert.notification);
  const hasChanged =
    current.channel !== snapshot.channel ||
    current.status !== snapshot.status ||
    current.retryCount !== snapshot.retryCount ||
    current.attemptedAt?.getTime() !== snapshot.attemptedAt?.getTime() ||
    current.sentAt?.getTime() !== snapshot.sentAt?.getTime() ||
    current.failedAt?.getTime() !== snapshot.failedAt?.getTime() ||
    current.target !== snapshot.target ||
    current.messageId !== snapshot.messageId ||
    current.error !== snapshot.error;

  if (!hasChanged) {
    return alert;
  }

  alert.notification = {
    channel: snapshot.channel,
    status: snapshot.status,
    attemptedAt: snapshot.attemptedAt,
    sentAt: snapshot.sentAt,
    failedAt: snapshot.failedAt,
    target: snapshot.target,
    messageId: snapshot.messageId,
    error: snapshot.error,
    retryCount: snapshot.retryCount,
  } as typeof alert.notification;

  await alert.save();
  return alert;
}

export async function markAlertNotificationEnqueueFailure(params: {
  alertId: string;
  errorCode: string;
  failedAt?: Date;
}) {
  const alert = await Alert.findById(params.alertId);
  if (!alert) {
    return null;
  }

  alert.notification = {
    ...(alert.notification ?? {}),
    channel: ALERT_NOTIFICATION_CHANNEL,
    status: "failed",
    failedAt: params.failedAt ?? new Date(),
    error: params.errorCode,
  } as typeof alert.notification;
  await alert.save();
  return alert;
}

export async function ensureJobForLegacyAlert(
  alert: AlertDocumentLike,
  channel: typeof ALERT_NOTIFICATION_CHANNEL = ALERT_NOTIFICATION_CHANNEL
) {
  const existing = await AlertNotificationJob.findOne({
    alertId: String(alert._id),
    channel,
  });
  if (existing) {
    return existing;
  }

  const notification = normalizeAlertNotification(alert.notification);
  const lastAttemptedAt = latestDate(
    notification.attemptedAt,
    notification.sentAt,
    notification.failedAt
  );
  const callbackDeadlineAt =
    stateFromLegacyNotification(notification) === "awaiting_callback" && lastAttemptedAt
      ? new Date(lastAttemptedAt.getTime() + CALLBACK_DEADLINE_MS)
      : undefined;

  try {
    return await AlertNotificationJob.findOneAndUpdate(
      {
        alertId: String(alert._id),
        channel,
      },
      {
        $setOnInsert: {
          alertId: String(alert._id),
          patientId: alert.patientId,
          channel,
          state: stateFromLegacyNotification(notification),
          dispatchKind: "retry",
          attemptCount: attemptCountFromLegacyNotification(notification),
          lastAttemptedAt,
          callbackDeadlineAt,
          target: notification.target,
          messageId: notification.messageId,
          lastError: notification.error,
          lastCallbackStatus:
            notification.status === "sent"
              ? "sent"
              : notification.status === "failed"
                ? "failed"
                : notification.status === "skipped"
                  ? "skipped"
                  : notification.attemptedAt
                    ? "attempted"
                    : undefined,
          lastCallbackAt: latestDate(notification.sentAt, notification.failedAt),
          reasonCodes: parseReasonCodes(alert.reason),
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }
    );
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      const created = await AlertNotificationJob.findOne({
        alertId: String(alert._id),
        channel,
      });
      if (created) {
        return created;
      }
    }
    throw error;
  }
}

export async function enqueueInitialAlertNotification(params: {
  alert: AlertDocumentLike;
  reasonCodes: string[];
  now?: Date;
  requestId?: string;
}) {
  const now = params.now ?? new Date();
  try {
    const job = await AlertNotificationJob.findOneAndUpdate(
      {
        alertId: String(params.alert._id),
        channel: ALERT_NOTIFICATION_CHANNEL,
      },
      {
        $setOnInsert: {
          alertId: String(params.alert._id),
          patientId: params.alert.patientId,
          channel: ALERT_NOTIFICATION_CHANNEL,
          state: "queued",
          dispatchKind: "initial",
          attemptCount: 0,
          nextAttemptAt: now,
          reasonCodes: params.reasonCodes,
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }
    );

    await syncAlertNotificationSnapshot(String(params.alert._id));
    logger.info(
      "notification.job.enqueued",
      buildNotificationLogContext(
        {
          _id: job?._id,
          alertId: params.alert._id,
          patientId: params.alert.patientId,
          dispatchKind: "initial",
        },
        { requestId: params.requestId },
        {
          state: "queued",
        }
      )
    );
    return job;
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      const existing = await AlertNotificationJob.findOne({
        alertId: String(params.alert._id),
        channel: ALERT_NOTIFICATION_CHANNEL,
      });
      if (existing) {
        return existing;
      }
    }
    throw error;
  }
}

async function sendJobWebhook(
  job: Record<string, unknown>,
  now: Date,
  context?: RequestCorrelationContext
): Promise<boolean> {
  const dispatchKind = toStringValue(job.dispatchKind) === "retry" ? "retry" : "initial";
  const alertId = toStringValue(job.alertId) ?? "";
  const patientId = toStringValue(job.patientId) ?? "";
  const reasonCodes = Array.isArray(job.reasonCodes)
    ? job.reasonCodes.filter((value): value is string => typeof value === "string")
    : [];

  if (dispatchKind === "initial") {
    return emitAlertCreated({
      type: "ALERT_CREATED",
      patientId,
      alertId,
      risk: "high",
      reason: reasonCodes,
      timestamp: now.toISOString(),
    }, {
      requestId: context?.requestId,
      workflow: "alert_created",
    });
  }

  return emitNotificationRetryRequested({
    type: "RETRY_NOTIFICATION_REQUESTED",
    patientId,
    alertId,
    channel: ALERT_NOTIFICATION_CHANNEL,
    requestedBy: toStringValue(job.requestedBy) ?? "system",
    requestedByName: toStringValue(job.requestedByName),
    timestamp: now.toISOString(),
  }, {
    requestId: context?.requestId,
    workflow: "retry_notification_requested",
  });
}

export async function dispatchJob(
  jobId: string,
  now: Date = new Date(),
  context?: RequestCorrelationContext
): Promise<boolean> {
  const attemptKey = makeAttemptKey();

  const claimed = await AlertNotificationJob.findOneAndUpdate(
    {
      _id: jobId,
      state: { $in: ["queued", "retry_scheduled", "reconciliation_needed"] },
      $or: [
        { nextAttemptAt: { $exists: false } },
        { nextAttemptAt: null },
        { nextAttemptAt: { $lte: now } },
      ],
    },
    {
      $set: {
        state: "sending",
        currentAttemptKey: attemptKey,
        lastAttemptedAt: now,
        callbackDeadlineAt: new Date(now.getTime() + CALLBACK_DEADLINE_MS),
        lastError: undefined,
      },
      $inc: {
        attemptCount: 1,
      },
    },
    {
      new: true,
    }
  );

  if (!claimed) {
    return false;
  }

  const delivered = await sendJobWebhook(
    claimed.toObject() as Record<string, unknown>,
    now,
    context
  );
  const dispatchKind = claimed.dispatchKind === "retry" ? "retry" : "initial";

  if (delivered) {
    await AlertNotificationJob.updateOne(
      { _id: claimed._id, currentAttemptKey: attemptKey },
      {
        $set: {
          state: "awaiting_callback",
          nextAttemptAt: undefined,
          lastError: undefined,
        },
      }
    );
    await syncAlertNotificationSnapshot(String(claimed.alertId));

    if (dispatchKind === "retry") {
      await writeRetryCareEvent(
        String(claimed.alertId),
        claimed.patientId,
        "NOTIFICATION_RETRY_WEBHOOK_DELIVERED",
        {
          channel: ALERT_NOTIFICATION_CHANNEL,
          requestedBy: claimed.requestedBy ?? "system",
          retryCount: Math.max(claimed.attemptCount, 1),
        }
      );
    }

    logger.info(
      "notification.job.dispatched",
      buildNotificationLogContext(claimed, context, {
        state: "awaiting_callback",
      })
    );

    return true;
  }

  const willRetry = claimed.attemptCount < MAX_DELIVERY_ATTEMPTS;
  const errorCode =
    dispatchKind === "retry"
      ? "N8N_RETRY_WEBHOOK_FAILED"
      : "N8N_WEBHOOK_DELIVERY_FAILED";

  await AlertNotificationJob.updateOne(
    { _id: claimed._id, currentAttemptKey: attemptKey },
    {
      $set: {
        state: willRetry ? "retry_scheduled" : "failed",
        nextAttemptAt: willRetry ? new Date(now.getTime() + RETRY_AFTER_MS) : undefined,
        lastError: errorCode,
      },
    }
  );
  await syncAlertNotificationSnapshot(String(claimed.alertId));

  if (dispatchKind === "retry") {
    await writeRetryCareEvent(
      String(claimed.alertId),
      claimed.patientId,
      "NOTIFICATION_RETRY_WEBHOOK_FAILED",
      {
        channel: ALERT_NOTIFICATION_CHANNEL,
        requestedBy: claimed.requestedBy ?? "system",
        retryCount: Math.max(claimed.attemptCount, 1),
        error: errorCode,
      }
    );
  }

  logger.warn(
    "notification.job.dispatch_failed",
    buildNotificationLogContext(claimed, context, {
      state: willRetry ? "retry_scheduled" : "failed",
    })
  );

  return false;
}

export async function dispatchDueJobs(
  params: { limit?: number; now?: Date; requestId?: string } = {}
) {
  const now = params.now ?? new Date();
  const limit = params.limit ?? 25;
  // Initial send, manual retry, and reconciliation all flow through the same durable dispatch path.
  const dueJobs = await AlertNotificationJob.find({
    channel: ALERT_NOTIFICATION_CHANNEL,
    state: { $in: ["queued", "retry_scheduled", "reconciliation_needed"] },
    $or: [
      { nextAttemptAt: { $exists: false } },
      { nextAttemptAt: null },
      { nextAttemptAt: { $lte: now } },
    ],
  })
    .sort({ nextAttemptAt: 1, updatedAt: 1 })
    .limit(limit)
    .lean();

  let delivered = 0;
  let attempted = 0;
  for (const job of dueJobs) {
    attempted += 1;
    const result = await dispatchJob(String(job._id), now, {
      requestId: params.requestId,
    });
    if (result) {
      delivered += 1;
    }
  }

  return {
    attempted,
    delivered,
  };
}

export async function requestAlertNotificationRetry(params: {
  alert: AlertDocumentLike;
  actor: AlertNotificationActor;
  reason?: string;
  channel?: typeof ALERT_NOTIFICATION_CHANNEL;
  now?: Date;
  requestId?: string;
}) {
  const channel = params.channel ?? ALERT_NOTIFICATION_CHANNEL;
  const now = params.now ?? new Date();
  const job = await ensureJobForLegacyAlert(params.alert, channel);
  const throttleReferenceAt = latestDate(
    toDate(job.lastRequestedAt),
    toDate(job.lastAttemptedAt),
  );

  if (
    throttleReferenceAt &&
    now.getTime() - throttleReferenceAt.getTime() < NOTIFICATION_RETRY_THROTTLE_MS
  ) {
    throw new AlertNotificationRetryThrottleError();
  }

  const updated = await AlertNotificationJob.findByIdAndUpdate(
    job._id,
    {
      $set: {
        channel,
        state: "retry_scheduled",
        dispatchKind: "retry",
        nextAttemptAt: now,
        lastRequestedAt: now,
        requestedBy: params.actor.id,
        requestedByName: params.actor.name,
        requestReason: params.reason,
      },
    },
    {
      new: true,
    }
  );

  await syncAlertNotificationSnapshot(String(params.alert._id));
  await writeRetryCareEvent(
    String(params.alert._id),
    params.alert.patientId,
    "NOTIFICATION_RETRY_REQUESTED",
    {
      channel,
      requestedBy: params.actor.id,
      requestedByName: params.actor.name,
      reason: params.reason,
      retryCount: Math.max((updated?.attemptCount ?? job.attemptCount) - 1, 0),
    }
  );

  logger.info(
    "notification.job.retry_requested",
    buildNotificationLogContext(updated ?? job, { requestId: params.requestId }, {
      state: "retry_scheduled",
    })
  );

  return updated ?? job;
}

export async function reconcileStaleJobs(params: {
  limit?: number;
  now?: Date;
  force?: boolean;
  requestId?: string;
} = {}) {
  const now = params.now ?? new Date();
  const limit = params.limit ?? 25;
  const query = params.force
    ? { channel: ALERT_NOTIFICATION_CHANNEL, state: "awaiting_callback" }
    : {
        channel: ALERT_NOTIFICATION_CHANNEL,
        state: "awaiting_callback",
        callbackDeadlineAt: { $lte: now },
      };

  const jobs = await AlertNotificationJob.find(query).sort({ updatedAt: 1 }).limit(limit);
  let reconciled = 0;
  let scheduled = 0;
  let failed = 0;

  for (const job of jobs) {
    reconciled += 1;
    if (job.attemptCount >= MAX_DELIVERY_ATTEMPTS) {
      job.state = "failed";
      job.lastError = "CALLBACK_STALE_MAX_ATTEMPTS_EXCEEDED";
      job.nextAttemptAt = undefined;
      failed += 1;
    } else {
      job.state = "reconciliation_needed";
      job.dispatchKind = "retry";
      job.lastError = "CALLBACK_STALE";
      job.nextAttemptAt = now;
      scheduled += 1;
    }
    await job.save();
    await syncAlertNotificationSnapshot(String(job.alertId));
  }

  logger.info("notification.jobs.reconciled", {
    requestId: params.requestId,
    reconciled,
    scheduled,
    failed,
  });

  return {
    reconciled,
    scheduled,
    failed,
  };
}

export async function applyNotificationCallback(params: {
  alertId: string;
  body: NotificationStatusCallbackBody;
  callbackTimestamp: Date;
  callbackMessageId?: string;
  requestId?: string;
}) {
  const alert = await Alert.findById(params.alertId);
  if (!alert) {
    return null;
  }

  // Callback updates the durable job first, then refreshes Alert.notification.
  const job = await ensureJobForLegacyAlert({
    _id: alert._id,
    patientId: alert.patientId,
    reason: alert.reason,
    notification: alert.notification,
  });

  if (
    params.body.attemptKey &&
    job.currentAttemptKey &&
    params.body.attemptKey !== job.currentAttemptKey
  ) {
    const syncedAlert = await syncAlertNotificationSnapshot(String(alert._id));
    logger.info(
      "notification.callback.stale",
      buildNotificationLogContext(job, { requestId: params.requestId }, {
        workflow: params.body.meta?.workflow,
        executionId: params.body.meta?.executionId,
      })
    );
    return {
      alert: syncedAlert ?? alert,
      stale: true,
      shouldBackfillAttempted: false,
      sanitizedErrorForEvent: undefined,
    };
  }

  const latestKnownTimestamp = latestDate(job.lastCallbackAt, job.lastAttemptedAt);
  if (
    !params.body.attemptKey &&
    latestKnownTimestamp &&
    params.callbackTimestamp.getTime() < latestKnownTimestamp.getTime()
  ) {
    const syncedAlert = await syncAlertNotificationSnapshot(String(alert._id));
    logger.info(
      "notification.callback.stale",
      buildNotificationLogContext(job, { requestId: params.requestId }, {
        workflow: params.body.meta?.workflow,
        executionId: params.body.meta?.executionId,
      })
    );
    return {
      alert: syncedAlert ?? alert,
      stale: true,
      shouldBackfillAttempted: false,
      sanitizedErrorForEvent: undefined,
    };
  }

  const previousCallbackStatus = job.lastCallbackStatus;
  const hadAttemptTimestamp = Boolean(job.lastAttemptedAt);
  const sanitizedErrorForEvent =
    params.body.status === "failed"
      ? sanitizeNotificationError(params.body.error) ?? "TELEGRAM_DELIVERY_FAILED"
      : params.body.status === "skipped"
        ? sanitizeNotificationError(params.body.error)
        : undefined;

  if (params.body.target) {
    job.target = params.body.target;
  }
  if (params.callbackMessageId) {
    job.messageId = params.callbackMessageId;
  }

  job.lastCallbackStatus = params.body.status;
  job.lastCallbackAt = params.callbackTimestamp;

  if (!job.lastAttemptedAt) {
    job.lastAttemptedAt = params.callbackTimestamp;
  }

  if (params.body.status === "attempted") {
    if (job.state !== "delivered" && job.state !== "failed" && job.state !== "skipped") {
      job.state = "awaiting_callback";
    }
    job.callbackDeadlineAt = new Date(
      params.callbackTimestamp.getTime() + CALLBACK_DEADLINE_MS
    );
    job.lastError = undefined;
  }

  if (params.body.status === "sent") {
    job.state = "delivered";
    job.callbackDeadlineAt = undefined;
    job.lastError = undefined;
  }

  if (params.body.status === "failed") {
    job.state = "failed";
    job.callbackDeadlineAt = undefined;
    job.lastError = sanitizedErrorForEvent ?? "TELEGRAM_DELIVERY_FAILED";
  }

  if (params.body.status === "skipped") {
    job.state = "skipped";
    job.callbackDeadlineAt = undefined;
    job.lastError = sanitizedErrorForEvent;
  }

  await job.save();
  const syncedAlert = await syncAlertNotificationSnapshot(String(alert._id));

  logger.info(
    "notification.callback.applied",
    buildNotificationLogContext(job, { requestId: params.requestId }, {
      workflow: params.body.meta?.workflow,
      executionId: params.body.meta?.executionId,
      state: job.state,
      callbackStatus: params.body.status,
    })
  );

  return {
    alert: syncedAlert ?? alert,
    stale: false,
    shouldBackfillAttempted:
      params.body.status !== "attempted" &&
      previousCallbackStatus !== "attempted" &&
      !hadAttemptTimestamp,
    sanitizedErrorForEvent,
  };
}
