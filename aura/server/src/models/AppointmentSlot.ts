import { Schema, model } from "mongoose";

const appointmentSlotSchema = new Schema(
  {
    clinicianId: {
      type: String,
      required: true,
      trim: true,
    },
    startsAt: {
      type: Date,
      required: true,
      index: true,
    },
    endsAt: {
      type: Date,
      required: true,
      validate: {
        validator(this: { startsAt?: Date }, value: Date): boolean {
          if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
            return false;
          }
          if (!(this.startsAt instanceof Date) || Number.isNaN(this.startsAt.getTime())) {
            return false;
          }
          return value.getTime() > this.startsAt.getTime();
        },
        message: "endsAt must be after startsAt",
      },
    },
    modality: {
      type: String,
      enum: ["video"],
      default: "video",
      required: true,
    },
    meetingLink: {
      type: String,
      trim: true,
      maxlength: 1024,
    },
    status: {
      type: String,
      enum: ["available", "closed"],
      default: "available",
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

appointmentSlotSchema.index({ clinicianId: 1, startsAt: 1 }, { unique: true });
appointmentSlotSchema.index({ status: 1, startsAt: 1 });
appointmentSlotSchema.index({ demoTag: 1 });

const AppointmentSlot = model("AppointmentSlot", appointmentSlotSchema);

export default AppointmentSlot;
