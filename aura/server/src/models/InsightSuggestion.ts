import { Schema, model } from "mongoose";

const insightEvidenceSchema = new Schema(
  {
    checkinsCount: {
      type: Number,
      min: 0,
    },
    avgPain: {
      type: Number,
      min: 0,
      max: 10,
    },
    avgMood: {
      type: Number,
      min: 1,
      max: 5,
    },
    sleepAvgHours: {
      type: Number,
      min: 0,
      max: 24,
    },
    hydrationAvgMl: {
      type: Number,
      min: 0,
    },
    medsAdherencePct: {
      type: Number,
      min: 0,
      max: 100,
    },
    sessionsCount: {
      type: Number,
      min: 0,
    },
    promsDueNow: {
      type: Number,
      min: 0,
    },
    promsLatestScore: {
      type: Number,
      min: 0,
      max: 100,
    },
    highRiskAlertsCount: {
      type: Number,
      min: 0,
    },
  },
  { _id: false }
);

const reviewedBySchema = new Schema(
  {
    clinicianId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    name: {
      type: String,
      trim: true,
      maxlength: 120,
    },
  },
  { _id: false }
);

const insightSuggestionSchema = new Schema(
  {
    patientId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
      index: true,
    },
    windowDays: {
      type: Number,
      required: true,
      min: 1,
      max: 60,
      default: 14,
    },
    windowStart: {
      type: Date,
      required: true,
    },
    windowEnd: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      required: true,
      default: "pending",
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 280,
    },
    category: {
      type: String,
      enum: [
        "adherence",
        "symptoms",
        "recovery",
        "safety",
        "habits",
        "questionnaires",
      ],
      required: true,
    },
    confidence: {
      type: String,
      enum: ["low", "medium", "high"],
      required: true,
    },
    priority: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    fingerprint: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    evidence: {
      type: insightEvidenceSchema,
      default: undefined,
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

insightSuggestionSchema.index({ patientId: 1, status: 1, createdAt: -1 });
insightSuggestionSchema.index({ patientId: 1, fingerprint: 1 }, { unique: true });
insightSuggestionSchema.index({ demoTag: 1 });

const InsightSuggestion = model("InsightSuggestion", insightSuggestionSchema);

export default InsightSuggestion;
