import { Schema, model } from "mongoose";

export const PATIENT_MEMORY_TYPES = [
  "goal",
  "preference",
  "barrier",
  "recent_pattern",
  "support_need",
] as const;

export const PATIENT_MEMORY_SOURCE_KINDS = [
  "low_risk_chat",
  "checkin_trend",
  "clinician_seed",
  "system_derived",
] as const;

export const PATIENT_MEMORY_SOURCE_QUALITIES = [
  "explicit",
  "inferred",
  "trend",
] as const;

export const PATIENT_MEMORY_STATUSES = ["active", "superseded"] as const;

const patientMemorySchema = new Schema(
  {
    patientId: {
      type: String,
      required: true,
      trim: true,
    },
    memoryType: {
      type: String,
      enum: PATIENT_MEMORY_TYPES,
      required: true,
    },
    summary: {
      type: String,
      required: true,
      trim: true,
      maxlength: 240,
    },
    sourceKind: {
      type: String,
      enum: PATIENT_MEMORY_SOURCE_KINDS,
      required: true,
    },
    sourceRefId: {
      type: String,
      trim: true,
    },
    sourceQuality: {
      type: String,
      enum: PATIENT_MEMORY_SOURCE_QUALITIES,
    },
    status: {
      type: String,
      enum: PATIENT_MEMORY_STATUSES,
      default: "active",
      required: true,
    },
    expiresAt: {
      type: Date,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

patientMemorySchema.index({ patientId: 1 });
patientMemorySchema.index({ patientId: 1, status: 1, updatedAt: -1 });
patientMemorySchema.index({ patientId: 1, memoryType: 1, status: 1 });
patientMemorySchema.index(
  { patientId: 1, memoryType: 1, summary: 1 },
  { unique: true }
);

const PatientMemory = model("PatientMemory", patientMemorySchema);

export default PatientMemory;
