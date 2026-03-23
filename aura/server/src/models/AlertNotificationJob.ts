import { Schema, model } from "mongoose";

const alertNotificationJobSchema = new Schema(
  {
    alertId: {
      type: String,
      required: true,
      trim: true,
    },
    patientId: {
      type: String,
      required: true,
      trim: true,
    },
    channel: {
      type: String,
      enum: ["telegram"],
      default: "telegram",
    },
    state: {
      type: String,
      enum: [
        "queued",
        "sending",
        "awaiting_callback",
        "retry_scheduled",
        "reconciliation_needed",
        "delivered",
        "failed",
        "skipped",
      ],
      default: "queued",
    },
    dispatchKind: {
      type: String,
      enum: ["initial", "retry"],
      default: "initial",
    },
    attemptCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    nextAttemptAt: {
      type: Date,
    },
    lastAttemptedAt: {
      type: Date,
    },
    lastRequestedAt: {
      type: Date,
    },
    callbackDeadlineAt: {
      type: Date,
    },
    currentAttemptKey: {
      type: String,
      trim: true,
    },
    target: {
      type: String,
      trim: true,
    },
    messageId: {
      type: String,
      trim: true,
    },
    lastError: {
      type: String,
      trim: true,
    },
    lastCallbackStatus: {
      type: String,
      enum: ["attempted", "sent", "failed", "skipped"],
    },
    lastCallbackAt: {
      type: Date,
    },
    reasonCodes: {
      type: [String],
      default: [],
    },
    requestedBy: {
      type: String,
      trim: true,
    },
    requestedByName: {
      type: String,
      trim: true,
    },
    requestReason: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

alertNotificationJobSchema.index({ alertId: 1, channel: 1 }, { unique: true });
alertNotificationJobSchema.index({ state: 1, nextAttemptAt: 1, updatedAt: 1 });
alertNotificationJobSchema.index({ callbackDeadlineAt: 1, state: 1 });

const AlertNotificationJob = model(
  "AlertNotificationJob",
  alertNotificationJobSchema
);

export default AlertNotificationJob;
