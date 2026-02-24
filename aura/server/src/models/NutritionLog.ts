import { Schema, model } from "mongoose";

const nutritionLogSchema = new Schema(
  {
    patientId: {
      type: String,
      required: true,
      trim: true,
    },
    date: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },
    protein: {
      type: String,
      enum: ["low", "ok", "high"],
      required: true,
    },
    fruitVegServings: {
      type: Number,
      required: true,
      min: 0,
      max: 6,
    },
    antiInflammatoryFocus: {
      type: Boolean,
      required: true,
    },
    mealRegularity: {
      type: String,
      enum: ["irregular", "mostly", "regular"],
      required: true,
    },
    appetite: {
      type: String,
      enum: ["low", "normal", "high"],
      required: false,
    },
    notes: {
      type: String,
      maxlength: 280,
      required: false,
    },
    source: {
      type: String,
      enum: ["manual"],
      default: "manual",
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

nutritionLogSchema.index({ patientId: 1, date: 1, createdAt: 1 });
nutritionLogSchema.index({ demoTag: 1 });

const NutritionLog = model("NutritionLog", nutritionLogSchema);

export default NutritionLog;
