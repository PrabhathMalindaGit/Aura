import { Router } from "express";
import { z } from "zod";

import CareEvent from "../models/CareEvent";
import { getRequestIdFromResponse } from "../middleware/requestContext";
import { validateBody } from "../middleware/validate";
import { applyNotificationCallback } from "../services/alertNotificationService";
import { FOLLOW_THROUGH_WORKFLOW_VALUES } from "../services/followThroughAutomationService";
import type {
  NotificationStatusCallbackBody,
  NotificationStatusCallbackStatus,
  NotificationStatusSummary,
} from "../types/events";
import { isObjectId } from "../utils/ids";
import { logger } from "../utils/logger";
import { sanitizeNotificationError } from "../utils/sanitize";
import { requireWebhookKey } from "../utils/webhookAuth";

const router = Router();

const notificationStatusCallbackSchema = z.object({
  alertId: z.string().trim().min(1),
  channel: z.literal("telegram"),
  status: z.enum(["attempted", "sent", "failed", "skipped"]),
  timestamp: z.string().optional(),
  attemptedAt: z.string().optional(),
  messageId: z.string().trim().min(1).max(200).optional(),
  providerMessageId: z.string().trim().min(1).max(200).optional(),
  attemptKey: z.string().trim().min(1).max(200).optional(),
  target: z.string().trim().min(1).max(200).optional(),
  error: z.string().max(1000).optional(),
  meta: z
    .object({
      workflow: z.string().trim().min(1).max(32).optional(),
      executionId: z.string().trim().min(1).max(120).optional(),
    })
    .optional(),
});

const automationStatusCallbackSchema = z.object({
  workflow: z.enum(FOLLOW_THROUGH_WORKFLOW_VALUES),
  status: z.enum(["attempted", "sent", "failed", "skipped"]),
  channel: z.enum(["telegram", "internal_demo", "none"]),
  timestamp: z.string().optional(),
  target: z.string().trim().min(1).max(200).optional(),
  error: z.string().max(1000).optional(),
  items: z
    .array(
      z.object({
        dedupeKey: z.string().trim().min(1).max(200),
        patientId: z.string().trim().min(1).max(120).optional(),
        taskId: z.string().trim().min(1).max(120).optional(),
        appointmentRequestId: z.string().trim().min(1).max(120).optional(),
        communicationReviewId: z.string().trim().min(1).max(120).optional(),
        linkedEntityType: z.string().trim().min(1).max(80).optional(),
        linkedEntityId: z.string().trim().min(1).max(120).optional(),
        title: z.string().trim().min(1).max(200).optional(),
      })
    )
    .max(100)
    .default([]),
  meta: z
    .object({
      executionId: z.string().trim().min(1).max(120).optional(),
      workflowId: z.string().trim().min(1).max(120).optional(),
    })
    .optional(),
});

const CARE_EVENT_TYPE_BY_STATUS: Record<NotificationStatusCallbackStatus, string> = {
  attempted: "NOTIFICATION_ATTEMPTED",
  sent: "NOTIFICATION_SENT",
  failed: "NOTIFICATION_FAILED",
  skipped: "NOTIFICATION_SKIPPED",
};
const AUTOMATION_STATUS_EVENT_TYPE = "AUTOMATION_STATUS";

const MIN_CALLBACK_TIMESTAMP_MS = Date.UTC(2000, 0, 1, 0, 0, 0, 0);
const MAX_CALLBACK_FUTURE_DRIFT_MS = 24 * 60 * 60 * 1000;

type NormalizedNotification = {
  channel: "telegram" | "email" | "slack" | "sms" | "none";
  status: "unknown" | "sent" | "failed" | "skipped";
  attemptedAt?: Date;
  sentAt?: Date;
  failedAt?: Date;
  target?: string;
  messageId?: string;
  error?: string;
  retryCount: number;
};

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

function toIsoOrNull(value?: Date): string | null {
  if (!value) {
    return null;
  }
  return value.toISOString();
}

function toNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed;
}

function toRetryCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return 0;
  }
  return value;
}

function normalizeNotification(raw: unknown): NormalizedNotification {
  const source =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const channelValue = toNonEmptyString(source.channel);
  const statusValue = toNonEmptyString(source.status);

  return {
    channel:
      channelValue === "email" ||
      channelValue === "slack" ||
      channelValue === "sms" ||
      channelValue === "none" ||
      channelValue === "telegram"
        ? channelValue
        : "telegram",
    status:
      statusValue === "sent" ||
      statusValue === "failed" ||
      statusValue === "skipped" ||
      statusValue === "unknown"
        ? statusValue
        : "unknown",
    attemptedAt: toDate(source.attemptedAt),
    sentAt: toDate(source.sentAt),
    failedAt: toDate(source.failedAt),
    target: toNonEmptyString(source.target),
    messageId: toNonEmptyString(source.messageId),
    error: toNonEmptyString(source.error),
    retryCount: toRetryCount(source.retryCount),
  };
}

function normalizeTimestamp(
  rawTimestamp: string | undefined,
  now: Date
): { ok: true; value: Date } | { ok: false } {
  if (!rawTimestamp) {
    return {
      ok: true,
      value: now,
    };
  }

  const parsed = new Date(rawTimestamp);
  if (Number.isNaN(parsed.getTime())) {
    return {
      ok: false,
    };
  }

  const maxAllowedMs = now.getTime() + MAX_CALLBACK_FUTURE_DRIFT_MS;
  if (parsed.getTime() < MIN_CALLBACK_TIMESTAMP_MS || parsed.getTime() > maxAllowedMs) {
    return {
      ok: true,
      value: now,
    };
  }

  return {
    ok: true,
    value: parsed,
  };
}

function notificationSnapshot(notification: NormalizedNotification): NotificationStatusSummary {
  return {
    channel: "telegram",
    status: notification.status,
    attemptedAt: toIsoOrNull(notification.attemptedAt),
    sentAt: toIsoOrNull(notification.sentAt),
    failedAt: toIsoOrNull(notification.failedAt),
    target: notification.target ?? null,
    messageId: notification.messageId ?? null,
    error: notification.error ?? null,
    retryCount: notification.retryCount,
  };
}

function buildNotificationEventKey(
  status: NotificationStatusCallbackStatus,
  alertId: string,
  timestamp: Date,
  messageId?: string
): string {
  const roundedTimestamp = new Date(Math.floor(timestamp.getTime() / 1000) * 1000);
  return `notif:${status}:${alertId}:${roundedTimestamp.toISOString()}:${messageId ?? ""}`;
}

function buildAutomationEventKey(
  workflow: string,
  status: string,
  dedupeKey: string
): string {
  return `automation:${workflow}:${status}:${dedupeKey}`;
}

function mapAlertNotificationResponse(alert: { _id: unknown; patientId: unknown; notification?: unknown }) {
  const notification = normalizeNotification(alert.notification);

  return {
    _id: String(alert._id ?? ""),
    patientId: toNonEmptyString(alert.patientId) ?? "",
    notification: notificationSnapshot(notification),
  };
}

async function writeNotificationEventIfMissing(params: {
  alertId: string;
  patientId: string;
  status: NotificationStatusCallbackStatus;
  timestamp: Date;
  target?: string;
  messageId?: string;
  error?: string;
  meta?: NotificationStatusCallbackBody["meta"];
}): Promise<string | null> {
  const eventType = CARE_EVENT_TYPE_BY_STATUS[params.status];
  const eventKey = buildNotificationEventKey(
    params.status,
    params.alertId,
    params.timestamp,
    params.messageId
  );

  const existing = await CareEvent.exists({
    type: eventType,
    alertId: params.alertId,
    "payload.eventKey": eventKey,
  });

  if (existing) {
    return null;
  }

  await CareEvent.create({
    type: eventType,
    patientId: params.patientId,
    alertId: params.alertId,
    payload: {
      channel: "telegram",
      status: params.status,
      target: params.target,
      messageId: params.messageId,
      error: params.error,
      eventKey,
      ...(params.meta ? { meta: params.meta } : {}),
    },
    createdAt: params.timestamp,
    updatedAt: params.timestamp,
  });

  return eventType;
}

router.post(
  "/events/notification-status",
  requireWebhookKey,
  validateBody(notificationStatusCallbackSchema),
  async (req, res) => {
    const body = req.body as NotificationStatusCallbackBody;
    const alertId = body.alertId;
    const requestId = getRequestIdFromResponse(res);
    const callbackTimestampRaw = body.timestamp ?? body.attemptedAt;
    const callbackMessageId = body.messageId ?? body.providerMessageId;

    if (!isObjectId(alertId)) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        details: [
          {
            path: "alertId",
            message: "Invalid alert id",
          },
        ],
      });
    }

    const now = new Date();
    const normalizedTimestamp = normalizeTimestamp(callbackTimestampRaw, now);
    if (!normalizedTimestamp.ok) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        details: [
          {
            path: "timestamp",
            message: "Invalid timestamp",
          },
        ],
      });
    }

    const callbackTimestamp = normalizedTimestamp.value;

    try {
      const callbackResult = await applyNotificationCallback({
        alertId,
        body,
        callbackTimestamp,
        callbackMessageId,
        requestId,
      });

      if (!callbackResult) {
        return res.status(404).json({
          ok: false,
          error: "NOT_FOUND",
        });
      }

      if (callbackResult.stale) {
        logger.info("notification.callback.route.stale", {
          requestId,
          alertId,
          attemptKey: body.attemptKey,
          workflow: body.meta?.workflow,
          executionId: body.meta?.executionId,
        });
        return res.json({
          ok: true,
          alert: mapAlertNotificationResponse(callbackResult.alert),
          writtenEvents: [],
        });
      }

      const writtenEvents: string[] = [];

      if (callbackResult.shouldBackfillAttempted) {
        const attemptedEvent = await writeNotificationEventIfMissing({
          alertId: String(callbackResult.alert._id),
          patientId: callbackResult.alert.patientId,
          status: "attempted",
          timestamp: callbackTimestamp,
          target: body.target,
          messageId: callbackMessageId,
          meta: body.meta,
        });
        if (attemptedEvent) {
          writtenEvents.push(attemptedEvent);
        }
      }

      const notificationEvent = await writeNotificationEventIfMissing({
        alertId: String(callbackResult.alert._id),
        patientId: callbackResult.alert.patientId,
        status: body.status,
        timestamp: callbackTimestamp,
        target: body.target,
        messageId: callbackMessageId,
        error: callbackResult.sanitizedErrorForEvent,
        meta: body.meta,
      });
      if (notificationEvent) {
        writtenEvents.push(notificationEvent);
      }

      logger.info("notification.callback.route.applied", {
        requestId,
        alertId,
        attemptKey: body.attemptKey,
        workflow: body.meta?.workflow,
        executionId: body.meta?.executionId,
      });

      return res.json({
        ok: true,
        alert: mapAlertNotificationResponse(callbackResult.alert),
        writtenEvents,
      });
    } catch (error) {
      logger.error("Notification status callback failed", {
        route: "POST /events/notification-status",
        requestId,
        alertId,
        status: body.status,
        message: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({
        ok: false,
        error: "INTERNAL_ERROR",
      });
    }
  }
);

router.post(
  "/events/automation-status",
  requireWebhookKey,
  validateBody(automationStatusCallbackSchema),
  async (req, res) => {
    const body = req.body as z.infer<typeof automationStatusCallbackSchema>;
    const requestId = getRequestIdFromResponse(res);
    const now = new Date();
    const normalizedTimestamp = normalizeTimestamp(body.timestamp, now);

    if (!normalizedTimestamp.ok) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        details: [
          {
            path: "timestamp",
            message: "Invalid timestamp",
          },
        ],
      });
    }

    const callbackTimestamp = normalizedTimestamp.value;

    try {
      const writtenEvents: string[] = [];

      for (const item of body.items) {
        const eventKey = buildAutomationEventKey(
          body.workflow,
          body.status,
          item.dedupeKey
        );

        const existing = await CareEvent.exists({
          type: AUTOMATION_STATUS_EVENT_TYPE,
          "payload.eventKey": eventKey,
        });
        if (existing) {
          continue;
        }

        await CareEvent.create({
          type: AUTOMATION_STATUS_EVENT_TYPE,
          patientId: item.patientId ?? "system",
          payload: {
            workflow: body.workflow,
            status: body.status,
            channel: body.channel,
            dedupeKey: item.dedupeKey,
            target: body.target,
            taskId: item.taskId,
            appointmentRequestId: item.appointmentRequestId,
            communicationReviewId: item.communicationReviewId,
            linkedEntityType: item.linkedEntityType,
            linkedEntityId: item.linkedEntityId,
            title: item.title,
            error: body.error ? sanitizeNotificationError(body.error) : undefined,
            eventKey,
            meta: body.meta,
          },
          createdAt: callbackTimestamp,
          updatedAt: callbackTimestamp,
        });

        writtenEvents.push(eventKey);
      }

      logger.info("automation.callback.route.applied", {
        requestId,
        workflow: body.workflow,
        executionId: body.meta?.executionId,
        writtenEventCount: writtenEvents.length,
      });

      return res.json({
        ok: true,
        writtenEvents,
      });
    } catch (error) {
      logger.error("Automation status callback failed", {
        route: "POST /events/automation-status",
        requestId,
        workflow: body.workflow,
        status: body.status,
        message: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({
        ok: false,
        error: "INTERNAL_ERROR",
      });
    }
  }
);

export default router;
