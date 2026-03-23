import AlertNotificationJob from "../models/AlertNotificationJob";
import { ALERT_NOTIFICATION_CHANNEL } from "./alertNotificationService";

export type NotificationPipelineSummary = {
  queued: number;
  awaitingCallback: number;
  awaitingCallbackPastDeadline: number;
  retryScheduled: number;
  reconciliationNeeded: number;
  failed: number;
};

export type OpsSummary = {
  generatedAt: string;
  notificationPipeline: NotificationPipelineSummary;
};

export async function buildOpsSummary(now: Date = new Date()): Promise<OpsSummary> {
  const baseQuery = {
    channel: ALERT_NOTIFICATION_CHANNEL,
  };

  const [
    queued,
    awaitingCallback,
    awaitingCallbackPastDeadline,
    retryScheduled,
    reconciliationNeeded,
    failed,
  ] = await Promise.all([
    AlertNotificationJob.countDocuments({ ...baseQuery, state: "queued" }),
    AlertNotificationJob.countDocuments({
      ...baseQuery,
      state: "awaiting_callback",
    }),
    AlertNotificationJob.countDocuments({
      ...baseQuery,
      state: "awaiting_callback",
      callbackDeadlineAt: { $lte: now },
    }),
    AlertNotificationJob.countDocuments({
      ...baseQuery,
      state: "retry_scheduled",
    }),
    AlertNotificationJob.countDocuments({
      ...baseQuery,
      state: "reconciliation_needed",
    }),
    AlertNotificationJob.countDocuments({ ...baseQuery, state: "failed" }),
  ]);

  return {
    generatedAt: now.toISOString(),
    notificationPipeline: {
      queued,
      awaitingCallback,
      awaitingCallbackPastDeadline,
      retryScheduled,
      reconciliationNeeded,
      failed,
    },
  };
}
