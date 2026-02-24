import { Schema, model, Types } from "mongoose";

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

const medicationScheduleSchema = new Schema(
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
    times: {
      type: [String],
      required: true,
      validate: {
        validator: (value: string[]) =>
          Array.isArray(value) &&
          value.length >= 1 &&
          value.length <= 6 &&
          value.every((time) => timeRegex.test(time)),
        message: "times must contain 1..6 HH:MM values",
      },
    },
    daysOfWeek: {
      type: [Number],
      default: [0, 1, 2, 3, 4, 5, 6],
      validate: {
        validator: (value: number[]) =>
          Array.isArray(value) &&
          value.length > 0 &&
          value.every((day) => Number.isInteger(day) && day >= 0 && day <= 6),
        message: "daysOfWeek must contain values 0..6",
      },
    },
    startDate: {
      type: String,
      match: /^\d{4}-\d{2}-\d{2}$/,
      required: false,
    },
    endDate: {
      type: String,
      match: /^\d{4}-\d{2}-\d{2}$/,
      required: false,
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

medicationScheduleSchema.index({ patientId: 1, medicationId: 1 });
medicationScheduleSchema.index({ demoTag: 1 });

const MedicationSchedule = model("MedicationSchedule", medicationScheduleSchema);

export type MedicationScheduleDoc = {
  _id: Types.ObjectId;
  patientId: string;
  medicationId: Types.ObjectId;
  times: string[];
  daysOfWeek: number[];
  startDate?: string;
  endDate?: string;
};

export default MedicationSchedule;
