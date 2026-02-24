import { Schema, model } from "mongoose";

const medicationSchema = new Schema(
  {
    patientId: {
      type: String,
      required: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    type: {
      type: String,
      enum: ["medication", "supplement"],
      default: "medication",
      required: true,
    },
    instructions: {
      type: String,
      trim: true,
      maxlength: 280,
      required: false,
    },
    active: {
      type: Boolean,
      default: true,
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

medicationSchema.index({ patientId: 1, active: 1, createdAt: -1 });
medicationSchema.index({ demoTag: 1 });

const Medication = model("Medication", medicationSchema);

export default Medication;
