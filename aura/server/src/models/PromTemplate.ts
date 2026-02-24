import { Schema, model } from "mongoose";

const promBandSchema = new Schema(
  {
    key: {
      type: String,
      required: true,
      enum: ["green", "amber", "red"],
    },
    min: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    max: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    label: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
  },
  { _id: false }
);

const promQuestionLabelsSchema = new Schema(
  {
    minLabel: {
      type: String,
      trim: true,
      maxlength: 120,
    },
    maxLabel: {
      type: String,
      trim: true,
      maxlength: 120,
    },
  },
  { _id: false }
);

const promQuestionSchema = new Schema(
  {
    id: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
    },
    type: {
      type: String,
      required: true,
      enum: ["likert"],
      default: "likert",
    },
    min: {
      type: Number,
      required: true,
      min: 0,
      max: 10,
    },
    max: {
      type: Number,
      required: true,
      min: 0,
      max: 10,
    },
    labels: {
      type: promQuestionLabelsSchema,
      default: undefined,
    },
    required: {
      type: Boolean,
      default: true,
    },
    reverse: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false }
);

const promScoringSchema = new Schema(
  {
    method: {
      type: String,
      enum: ["sum"],
      default: "sum",
      required: true,
    },
    minRaw: {
      type: Number,
      required: true,
      min: 0,
    },
    maxRaw: {
      type: Number,
      required: true,
      min: 0,
    },
    normalizeTo100: {
      type: Boolean,
      default: true,
    },
    bands: {
      type: [promBandSchema],
      required: true,
      validate: {
        validator: (value: unknown[]) => Array.isArray(value) && value.length >= 1,
        message: "scoring.bands must include at least one band",
      },
    },
  },
  { _id: false }
);

const promTemplateSchema = new Schema(
  {
    key: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 180,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 400,
    },
    version: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
    questions: {
      type: [promQuestionSchema],
      required: true,
      validate: {
        validator: (value: Array<{ id?: string }>) => {
          if (!Array.isArray(value) || value.length === 0 || value.length > 30) {
            return false;
          }

          const ids = new Set<string>();
          for (const question of value) {
            const id = typeof question.id === "string" ? question.id.trim() : "";
            if (!id || ids.has(id)) {
              return false;
            }
            ids.add(id);
          }
          return true;
        },
        message: "questions must include unique question IDs and contain 1..30 items",
      },
    },
    scoring: {
      type: promScoringSchema,
      required: true,
      validate: {
        validator: (value: { minRaw?: number; maxRaw?: number; bands?: Array<{ min?: number; max?: number }> }) => {
          if (!value || typeof value.minRaw !== "number" || typeof value.maxRaw !== "number") {
            return false;
          }

          if (value.maxRaw < value.minRaw) {
            return false;
          }

          if (!Array.isArray(value.bands) || value.bands.length === 0) {
            return false;
          }

          return value.bands.every(
            (band) =>
              typeof band.min === "number" &&
              typeof band.max === "number" &&
              band.min >= 0 &&
              band.max >= band.min
          );
        },
        message: "scoring config is invalid",
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

promTemplateSchema.index({ key: 1 }, { unique: true });
promTemplateSchema.index({ demoTag: 1 });

const PromTemplate = model("PromTemplate", promTemplateSchema);

export default PromTemplate;
