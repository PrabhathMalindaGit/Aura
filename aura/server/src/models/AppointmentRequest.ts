import { Schema, model } from "mongoose";

const reviewedBySchema = new Schema(
  {
    clinicianId: {
      type: String,
      required: true,
      trim: true,
    },
    name: {
      type: String,
      trim: true,
      maxlength: 120,
    },
  },
  { _id: false }
);

const appointmentRequestSchema = new Schema(
  {
    slotId: {
      type: Schema.Types.ObjectId,
      ref: "AppointmentSlot",
      required: true,
      index: true,
    },
    patientId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "canceled"],
      default: "pending",
      required: true,
      index: true,
    },
    note: {
      type: String,
      trim: true,
      maxlength: 280,
    },
    reviewedBy: {
      type: reviewedBySchema,
      default: undefined,
    },
    reviewedAt: {
      type: Date,
      default: null,
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

appointmentRequestSchema.index({ slotId: 1, patientId: 1 }, { unique: true });
appointmentRequestSchema.index({ patientId: 1, status: 1, createdAt: -1 });
appointmentRequestSchema.index({ slotId: 1, status: 1, createdAt: -1 });
appointmentRequestSchema.index({ demoTag: 1 });

const AppointmentRequest = model("AppointmentRequest", appointmentRequestSchema);

export default AppointmentRequest;
