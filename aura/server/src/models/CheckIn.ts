import { Schema, model } from "mongoose";
import { BODY_MAP_PAIN_TYPES, BODY_MAP_REGIONS } from "../constants/bodyMap";
import {
  CHECK_IN_MEDICATION_STATUSES,
  CHECK_IN_SYMPTOM_FLAGS,
} from "../constants/checkin";

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
    medicationStatus: {
      type: String,
      enum: CHECK_IN_MEDICATION_STATUSES,
      default: undefined,
    },
    medicationReason: {
      type: String,
      trim: true,
    },
  },
  { _id: false }
);

const symptomsSchema = new Schema(
  {
    flags: {
      type: [String],
      enum: CHECK_IN_SYMPTOM_FLAGS,
      default: undefined,
    },
  },
  { _id: false }
);

const recoverySchema = new Schema(
  {
    difficultyLevel: {
      type: Number,
      min: 1,
      max: 5,
    },
    confidenceLevel: {
      type: Number,
      min: 1,
      max: 5,
    },
    mobilityLevel: {
      type: Number,
      min: 1,
      max: 5,
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

const supportSchema = new Schema(
  {
    stressLevel: {
      type: Number,
      min: 1,
      max: 5,
    },
    feelsSafe: {
      type: Boolean,
      default: undefined,
    },
    wantsFollowUp: {
      type: Boolean,
      default: undefined,
    },
    wantsExtraSupport: {
      type: Boolean,
      default: undefined,
    },
    needsUrgentHelp: {
      type: Boolean,
      default: undefined,
    },
  },
  { _id: false }
);

const dailySignalsSchema = new Schema(
  {
    hydrationLevel: {
      type: Number,
      min: 1,
      max: 5,
    },
    energyLevel: {
      type: Number,
      min: 1,
      max: 5,
    },
  },
  { _id: false }
);

const bodyMapRegionSchema = new Schema(
  {
    region: {
      type: String,
      enum: BODY_MAP_REGIONS,
      required: true,
    },
    intensity: {
      type: Number,
      min: 0,
      max: 10,
      required: true,
    },
    type: {
      type: String,
      enum: BODY_MAP_PAIN_TYPES,
      required: true,
    },
  },
  { _id: false }
);

const bodyMapSchema = new Schema(
  {
    primaryRegion: {
      type: String,
      enum: BODY_MAP_REGIONS,
      default: undefined,
    },
    regions: {
      type: [bodyMapRegionSchema],
      default: undefined,
      validate: [
        {
          validator: (value: unknown) =>
            !Array.isArray(value) || value.length <= 12,
          message: "bodyMap.regions must include at most 12 regions",
        },
        {
          validator: (value: unknown) => {
            if (!Array.isArray(value)) {
              return true;
            }
            const keys = value
              .map((item) =>
                item && typeof item === "object" && "region" in item
                  ? String((item as { region?: unknown }).region)
                  : ""
              )
              .filter(Boolean);
            return new Set(keys).size === keys.length;
          },
          message: "bodyMap.regions must not contain duplicate regions",
        },
      ],
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
    symptoms: {
      type: symptomsSchema,
      default: undefined,
    },
    recovery: {
      type: recoverySchema,
      default: undefined,
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
    support: {
      type: supportSchema,
      default: undefined,
    },
    dailySignals: {
      type: dailySignalsSchema,
      default: undefined,
    },
    bodyMap: {
      type: bodyMapSchema,
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
