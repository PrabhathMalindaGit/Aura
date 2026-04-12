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

const patientRecoverySupportConfigSchema = new Schema(
  {
    patientId: {
      type: String,
      required: true,
      trim: true,
    },
    checkinMode: {
      type: String,
      enum: ["standard", "adaptive", "force_full"],
      default: "standard",
      required: true,
    },
    nudgesEnabled: {
      type: Boolean,
      default: false,
      required: true,
    },
    rationale: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    temporaryForceFullUntil: {
      type: Date,
      default: null,
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

patientRecoverySupportConfigSchema.index({ patientId: 1 }, { unique: true });
patientRecoverySupportConfigSchema.index({ demoTag: 1 });

const PatientRecoverySupportConfig = model(
  "PatientRecoverySupportConfig",
  patientRecoverySupportConfigSchema
);

export default PatientRecoverySupportConfig;
