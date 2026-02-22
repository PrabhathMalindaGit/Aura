import { Schema, model } from "mongoose";

const alertSourceSchema = new Schema(
  {
    type: {
      type: String,
      enum: ["checkin", "chat"],
      required: true,
    },
    sourceId: {
      type: String,
      required: true,
    },
  },
  { _id: false }
);

const notificationSchema = new Schema(
  {
    channel: {
      type: String,
      enum: ["telegram", "email", "slack", "sms", "none"],
      default: "telegram",
    },
    status: {
      type: String,
      enum: ["unknown", "sent", "failed", "skipped"],
      default: "unknown",
    },
    attemptedAt: {
      type: Date,
    },
    sentAt: {
      type: Date,
    },
    failedAt: {
      type: Date,
    },
    target: {
      type: String,
      trim: true,
    },
    messageId: {
      type: String,
      trim: true,
    },
    error: {
      type: String,
      trim: true,
    },
    retryCount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { _id: false }
);

const alertSchema = new Schema(
  {
    patientId: {
      type: String,
      required: true,
      trim: true,
    },
    risk: {
      type: String,
      enum: ["high"],
      default: "high",
    },
    reason: {
      type: String,
      required: true,
    },
    source: {
      type: alertSourceSchema,
      required: true,
    },
    status: {
      type: String,
      enum: ["open", "acknowledged", "resolved"],
      default: "open",
    },
    acknowledgedAt: {
      type: Date,
    },
    resolvedAt: {
      type: Date,
    },

    // Clinical semantics: seen indicates awareness; acknowledged indicates explicit action.
    seenAt: {
      type: Date,
    },
    seenBy: {
      type: [String],
      default: [],
    },

    // Assignment conflict checks will be enforced in route-layer updates.
    assignedTo: {
      type: String,
      trim: true,
    },
    assignedToName: {
      type: String,
      trim: true,
    },
    assignedAt: {
      type: Date,
    },

    riskAuto: {
      type: String,
      enum: ["low", "medium", "high"],
    },
    reasonsAuto: {
      type: [String],
      default: undefined,
    },
    riskFinal: {
      type: String,
      enum: ["low", "medium", "high"],
    },
    overrideReason: {
      type: String,
      trim: true,
    },
    overriddenBy: {
      type: String,
      trim: true,
    },
    overriddenByName: {
      type: String,
      trim: true,
    },
    overriddenAt: {
      type: Date,
    },

    // "unknown" means delivery has not been tracked/confirmed yet.
    notification: {
      type: notificationSchema,
      default: () => ({
        channel: "telegram",
        status: "unknown",
        retryCount: 0,
      }),
    },
    demoTag: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

alertSchema.index({ status: 1, createdAt: -1 });
alertSchema.index({ patientId: 1, createdAt: -1 });
alertSchema.index({ patientId: 1, status: 1, createdAt: -1 });
alertSchema.index({ assignedTo: 1, status: 1, createdAt: -1 });
alertSchema.index({ demoTag: 1 });

const Alert = model("Alert", alertSchema);

export default Alert;
