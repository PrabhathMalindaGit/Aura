import { Schema, model } from "mongoose";

const wearableDailySchema = new Schema(
  {
    patientId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    source: {
      type: String,
      enum: ["mock", "healthkit_stub", "googlefit_stub"],
      default: "mock",
      required: true,
    },
    date: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
      index: true,
    },
    steps: {
      type: Number,
      min: 0,
      max: 100000,
    },
    activeMinutes: {
      type: Number,
      min: 0,
      max: 300,
    },
    restingHr: {
      type: Number,
      min: 30,
      max: 220,
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

wearableDailySchema.index({ patientId: 1, source: 1, date: 1 }, { unique: true });
wearableDailySchema.index({ demoTag: 1 });

const WearableDaily = model("WearableDaily", wearableDailySchema);

export default WearableDaily;
