import { Schema, model } from "mongoose";

const adherenceSchema = new Schema(
  {
    exercises: {
      type: Number,
      min: 0,
      max: 1,
      default: 0,
    },
    medication: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false }
);

const riskSchema = new Schema(
  {
    level: {
      type: String,
      enum: ["low", "high"],
      default: "low",
    },
    reasons: {
      type: [String],
      default: [],
    },
  },
  { _id: false }
);

const sleepSchema = new Schema(
  {
    hours: {
      type: Number,
      min: 0,
      max: 16,
    },
    quality: {
      type: Number,
      min: 1,
      max: 5,
    },
    disturbances: {
      type: Number,
      min: 0,
      max: 5,
    },
  },
  { _id: false }
);

const checkInSchema = new Schema(
  {
    patientId: {
      type: String,
      required: true,
      trim: true,
    },
    date: {
      type: String,
      required: true,
    },
    mood: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    pain: {
      type: Number,
      required: true,
      min: 0,
      max: 10,
    },
    adherence: {
      type: adherenceSchema,
      default: () => ({}),
    },
    notes: {
      type: String,
    },
    risk: {
      type: riskSchema,
      default: () => ({ level: "low", reasons: [] }),
    },
    sleep: {
      type: sleepSchema,
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

checkInSchema.index({ patientId: 1, date: 1 }, { unique: true });
checkInSchema.index({ patientId: 1, createdAt: -1 });
checkInSchema.index({ demoTag: 1 });

const CheckIn = model("CheckIn", checkInSchema);

export default CheckIn;
