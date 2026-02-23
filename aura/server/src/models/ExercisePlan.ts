import { Schema, model } from "mongoose";

const exercisePlanItemSchema = new Schema(
  {
    key: {
      type: String,
      required: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    instructions: {
      type: String,
      required: true,
      trim: true,
    },
    sets: {
      type: Number,
      min: 0,
      max: 10,
    },
    reps: {
      type: Number,
      min: 0,
      max: 50,
    },
    holdSeconds: {
      type: Number,
      min: 0,
      max: 600,
    },
    restSeconds: {
      type: Number,
      min: 0,
      max: 600,
    },
    intensity: {
      type: String,
      enum: ["easy", "moderate", "hard"],
    },
    videoUrl: {
      type: String,
      trim: true,
    },
    contraindications: {
      type: [String],
      default: undefined,
    },
    order: {
      type: Number,
      required: true,
      min: 0,
      max: 1000,
    },
  },
  { _id: false }
);

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

const exercisePlanSchema = new Schema(
  {
    patientId: {
      type: String,
      required: true,
      trim: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    timezone: {
      type: String,
      trim: true,
    },
    daysOfWeek: {
      type: [Number],
      required: true,
      validate: {
        validator: (value: number[]) =>
          Array.isArray(value) &&
          value.length > 0 &&
          value.every((day) => Number.isInteger(day) && day >= 0 && day <= 6),
        message: "daysOfWeek must contain weekday numbers 0..6",
      },
    },
    items: {
      type: [exercisePlanItemSchema],
      required: true,
      validate: {
        validator: (value: unknown[]) => Array.isArray(value) && value.length <= 30,
        message: "items must contain at most 30 entries",
      },
    },
    version: {
      type: Number,
      default: 1,
      min: 1,
    },
    updatedBy: {
      type: updatedBySchema,
      default: undefined,
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

exercisePlanSchema.index({ patientId: 1 }, { unique: true });
exercisePlanSchema.index({ demoTag: 1 });

const ExercisePlan = model("ExercisePlan", exercisePlanSchema);

export default ExercisePlan;
