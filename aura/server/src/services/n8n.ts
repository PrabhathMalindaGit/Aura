import axios from "axios";

import { env } from "../env";
import { logger } from "../utils/logger";

export type AlertCreatedPayload = {
  type: "ALERT_CREATED";
  patientId: string;
  alertId: string;
  risk: "high";
  reason: string[];
  timestamp: string;
};

export async function emitAlertCreated(
  payload: AlertCreatedPayload
): Promise<boolean> {
  try {
    await axios.post(env.N8N_WEBHOOK_ALERT, payload, {
      timeout: 4000,
      headers: {
        "Content-Type": "application/json",
      },
    });
    return true;
  } catch (error) {
    logger.error("n8n webhook delivery failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
