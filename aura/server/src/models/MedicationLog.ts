import { Schema, model } from "mongoose";

const medicationLogSchema = new Schema(
  {
    patientId: {
      type: String,
      required: true,
      trim: true,
    },
    medicationId: {
      type: Schema.Types.ObjectId,
      ref: "Medication",
      required: true,
    },
    date: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },
    time: {
      type: String,
      required: true,
      match: /^([01]\d|2[0-3]):([0-5]\d)$/,
    },
    status: {
      type: String,
      enum: ["taken", "skipped"],
      required: true,
    },
    note: {
      type: String,
      maxlength: 280,
      required: false,
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

medicationLogSchema.index(
  { patientId: 1, medicationId: 1, date: 1, time: 1 },
  { unique: true }
);
medicationLogSchema.index({ patientId: 1, date: 1, createdAt: 1 });
medicationLogSchema.index({ demoTag: 1 });

const MedicationLog = model("MedicationLog", medicationLogSchema);

export default MedicationLog;
