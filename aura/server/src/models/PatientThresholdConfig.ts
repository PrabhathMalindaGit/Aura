import { Schema, model } from "mongoose";

const updatedBySchema = new Schema(
  {
    clinicianId: {
      type: String,
      required: true,
      trim: true,
    },
    name: {
      type: String,
      trim: true,
    },
  },
  { _id: false }
);

const patientThresholdConfigSchema = new Schema(
  {
    patientId: {
      type: String,
      required: true,
      trim: true,
    },
    painHighThreshold: {
      type: Number,
      required: true,
      min: 0,
      max: 10,
    },
    missedCheckinDays: {
      type: Number,
      required: true,
      min: 1,
      max: 14,
    },
    responseDelayHours: {
      type: Number,
      required: true,
      min: 1,
      max: 168,
    },
    safetyFlaggedResponseDelayHours: {
      type: Number,
      required: true,
      min: 1,
      max: 168,
    },
    rationale: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    version: {
      type: Number,
      default: 1,
      min: 1,
    },
    updatedBy: {
      type: updatedBySchema,
      required: true,
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

patientThresholdConfigSchema.index({ patientId: 1 }, { unique: true });
patientThresholdConfigSchema.index({ demoTag: 1 });

const PatientThresholdConfig = model(
  "PatientThresholdConfig",
  patientThresholdConfigSchema
);

export default PatientThresholdConfig;
