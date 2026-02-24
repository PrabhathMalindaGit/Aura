import { Schema, model } from "mongoose";

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

const promQuestionSnapshotSchema = new Schema(
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

const promAnswerSchema = new Schema(
  {
    questionId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    value: {
      type: Number,
      required: true,
      min: 0,
      max: 10,
      validate: {
        validator: (input: number) => Number.isInteger(input),
        message: "answers.value must be an integer",
      },
    },
  },
  { _id: false }
);

const promScoreSchema = new Schema(
  {
    raw: {
      type: Number,
      required: true,
      min: 0,
    },
    normalized: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    bandKey: {
      type: String,
      required: true,
      enum: ["green", "amber", "red"],
    },
    bandLabel: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
  },
  { _id: false }
);

const promInstanceSchema = new Schema(
  {
    patientId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
      index: true,
    },
    templateKey: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    templateVersion: {
      type: Number,
      required: true,
      min: 1,
    },
    titleSnapshot: {
      type: String,
      required: true,
      trim: true,
      maxlength: 180,
    },
    questionsSnapshot: {
      type: [promQuestionSnapshotSchema],
      required: true,
      validate: {
        validator: (value: unknown[]) => Array.isArray(value) && value.length >= 1 && value.length <= 50,
        message: "questionsSnapshot must include 1..50 questions",
      },
    },
    dueAt: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ["due", "completed"],
      default: "due",
      index: true,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    answers: {
      type: [promAnswerSchema],
      default: [],
    },
    score: {
      type: promScoreSchema,
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

promInstanceSchema.index({ patientId: 1, status: 1, dueAt: 1 });
promInstanceSchema.index({ patientId: 1, completedAt: -1 });
promInstanceSchema.index({ demoTag: 1 });

const PromInstance = model("PromInstance", promInstanceSchema);

export default PromInstance;
