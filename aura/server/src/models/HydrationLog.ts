import { Schema, model } from "mongoose";

const hydrationLogSchema = new Schema(
  {
    patientId: {
      type: String,
      required: true,
      trim: true,
    },
    date: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },
    amountMl: {
      type: Number,
      required: true,
      min: 10,
      max: 5000,
    },
    clientMutationId: {
      type: String,
      trim: true,
    },
    source: {
      type: String,
      enum: ["manual"],
      default: "manual",
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

hydrationLogSchema.index({ patientId: 1, date: 1, createdAt: 1 });
hydrationLogSchema.index(
  { patientId: 1, clientMutationId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      clientMutationId: { $exists: true, $type: "string" },
    },
  }
);
hydrationLogSchema.index({ demoTag: 1 });

const HydrationLog = model("HydrationLog", hydrationLogSchema);

export default HydrationLog;
