import { Schema, model } from "mongoose";

const patientSchema = new Schema(
  {
    patientId: {
      type: String,
      required: true,
      trim: true,
    },
    displayName: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ["active", "on_hold", "discharged", "inactive"],
      default: "active",
    },
    clinicianId: {
      type: String,
      trim: true,
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

patientSchema.index({ patientId: 1 }, { unique: true });
patientSchema.index({ status: 1 });
patientSchema.index({ clinicianId: 1, status: 1 });
patientSchema.index({ demoTag: 1 });

const Patient = model("Patient", patientSchema);

export default Patient;
