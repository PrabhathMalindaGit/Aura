import axios from "axios";

import { env } from "../env";
import type { RequestCorrelationContext } from "../middleware/requestContext";
import { REQUEST_ID_HEADER } from "../middleware/requestContext";
import { logger } from "../utils/logger";

export type AlertCreatedPayload = {
  type: "ALERT_CREATED";
  patientId: string;
  alertId: string;
  risk: "high";
  reason: string[];
  timestamp: string;
};

export type RetryNotificationRequestedPayload = {
  type: "RETRY_NOTIFICATION_REQUESTED";
  patientId: string;
  alertId: string;
  channel: "telegram";
  requestedBy: string;
  requestedByName?: string;
  timestamp: string;
};

type N8nEmitContext = RequestCorrelationContext & {
  workflow?: string;
};

function buildHeaders(context?: N8nEmitContext): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(context?.requestId ? { [REQUEST_ID_HEADER]: context.requestId } : {}),
  };
}

export async function emitAlertCreated(
  payload: AlertCreatedPayload,
  context?: N8nEmitContext
): Promise<boolean> {
  try {
    await axios.post(env.N8N_WEBHOOK_ALERT, payload, {
      timeout: 4000,
      headers: buildHeaders(context),
    });
    logger.info("n8n.alert_created.delivered", {
      requestId: context?.requestId,
      workflow: context?.workflow,
      alertId: payload.alertId,
      patientId: payload.patientId,
    });
    return true;
  } catch (error) {
    logger.error("n8n.alert_created.failed", {
      requestId: context?.requestId,
      workflow: context?.workflow,
      alertId: payload.alertId,
      patientId: payload.patientId,
      message: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export async function emitNotificationRetryRequested(
  payload: RetryNotificationRequestedPayload,
  context?: N8nEmitContext
): Promise<boolean> {
  if (!env.N8N_RETRY_WEBHOOK_URL) {
    return false;
  }

  try {
    await axios.post(env.N8N_RETRY_WEBHOOK_URL, payload, {
      timeout: 4000,
      headers: buildHeaders(context),
    });
    logger.info("n8n.retry_notification.delivered", {
      requestId: context?.requestId,
      workflow: context?.workflow,
      alertId: payload.alertId,
      patientId: payload.patientId,
    });
    return true;
  } catch (error) {
    logger.error("n8n.retry_notification.failed", {
      requestId: context?.requestId,
      workflow: context?.workflow,
      alertId: payload.alertId,
      patientId: payload.patientId,
      message: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
