import { Schema, model } from "mongoose";

const plannedSchema = new Schema(
  {
    sets: {
      type: Number,
      min: 0,
      max: 10,
    },
    reps: {
      type: Number,
      min: 0,
      max: 100,
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
  },
  { _id: false }
);

const exerciseSessionItemSchema = new Schema(
  {
    itemKey: {
      type: String,
      required: true,
      trim: true,
    },
    nameSnapshot: {
      type: String,
      required: true,
      trim: true,
    },
    order: {
      type: Number,
      required: true,
      min: 0,
      max: 1000,
    },
    planned: {
      type: plannedSchema,
      default: undefined,
    },
    completed: {
      type: Boolean,
      required: true,
      default: false,
    },
    setsDone: {
      type: Number,
      min: 0,
      max: 20,
    },
    repsDone: {
      type: Number,
      min: 0,
      max: 200,
    },
    difficulty: {
      type: String,
      enum: ["easy", "ok", "hard"],
    },
    painDuring: {
      type: Number,
      min: 0,
      max: 5,
    },
    note: {
      type: String,
      trim: true,
      maxlength: 280,
    },
    completedAt: {
      type: Date,
    },
  },
  { _id: false }
);

const exerciseSessionSchema = new Schema(
  {
    patientId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    planPatientId: {
      type: String,
      trim: true,
    },
    planVersion: {
      type: Number,
      min: 1,
    },
    planTitle: {
      type: String,
      trim: true,
      maxlength: 160,
    },
    planDayOfWeek: {
      type: Number,
      min: 0,
      max: 6,
    },
    startedAt: {
      type: Date,
      required: true,
    },
    endedAt: {
      type: Date,
      required: true,
    },
    durationSeconds: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ["completed", "abandoned"],
      default: "completed",
    },
    exercises: {
      type: [exerciseSessionItemSchema],
      required: true,
      validate: {
        validator: (value: unknown[]) =>
          Array.isArray(value) && value.length >= 1 && value.length <= 50,
        message: "exercises must contain 1..50 entries",
      },
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

exerciseSessionSchema.index({ patientId: 1, startedAt: -1 });
exerciseSessionSchema.index({ demoTag: 1 });

const ExerciseSession = model("ExerciseSession", exerciseSessionSchema);

export default ExerciseSession;
