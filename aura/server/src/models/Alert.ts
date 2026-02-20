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
  },
  {
    timestamps: true,
  }
);

alertSchema.index({ status: 1, createdAt: -1 });
alertSchema.index({ patientId: 1, createdAt: -1 });

const Alert = model("Alert", alertSchema);

export default Alert;
