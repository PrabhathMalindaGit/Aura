import { randomUUID } from "crypto";
import { Schema, model } from "mongoose";

export const COORDINATION_NEXT_STEP_VALUES = [
  "monitoring",
  "alerts",
  "communication",
  "tasks",
  "appointments",
  "plan",
] as const;

export const COORDINATION_FOLLOW_UP_OWNER_KIND_VALUES = [
  "unassigned",
  "clinician",
  "custom",
] as const;

export const COORDINATION_SUMMARY_MAX_LENGTH = 280;
export const COORDINATION_NOTE_MAX_LENGTH = 400;
export const COORDINATION_OWNER_LABEL_MAX_LENGTH = 80;
export const COORDINATION_NOTE_HISTORY_LIMIT = 12;
const COORDINATION_ACTOR_DISPLAY_NAME_MAX_LENGTH = 120;
const COORDINATION_ACTOR_ID_MAX_LENGTH = 120;

const authorSnapshotSchema = new Schema(
  {
    clinicianId: {
      type: String,
      required: true,
      trim: true,
      maxlength: COORDINATION_ACTOR_ID_MAX_LENGTH,
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
      maxlength: COORDINATION_ACTOR_DISPLAY_NAME_MAX_LENGTH,
    },
  },
  { _id: false }
);

const followUpOwnerSchema = new Schema(
  {
    kind: {
      type: String,
      enum: COORDINATION_FOLLOW_UP_OWNER_KIND_VALUES,
      required: true,
      default: "unassigned",
    },
    clinicianId: {
      type: String,
      trim: true,
      maxlength: COORDINATION_ACTOR_ID_MAX_LENGTH,
      validate: {
        validator(value: unknown) {
          if ((this as { kind?: string }).kind !== "clinician") {
            return true;
          }

          return typeof value === "string" && value.trim().length > 0;
        },
        message: "clinicianId is required when follow-up owner kind is clinician",
      },
    },
    displayName: {
      type: String,
      trim: true,
      maxlength: COORDINATION_ACTOR_DISPLAY_NAME_MAX_LENGTH,
      validate: {
        validator(value: unknown) {
          if ((this as { kind?: string }).kind !== "clinician") {
            return true;
          }

          return typeof value === "string" && value.trim().length > 0;
        },
        message: "displayName is required when follow-up owner kind is clinician",
      },
    },
    label: {
      type: String,
      trim: true,
      maxlength: COORDINATION_OWNER_LABEL_MAX_LENGTH,
      validate: {
        validator(value: unknown) {
          if ((this as { kind?: string }).kind !== "custom") {
            return true;
          }

          return typeof value === "string" && value.trim().length > 0;
        },
        message: "label is required when follow-up owner kind is custom",
      },
    },
  },
  { _id: false }
);

const currentHandoffSchema = new Schema(
  {
    summary: {
      type: String,
      trim: true,
      maxlength: COORDINATION_SUMMARY_MAX_LENGTH,
      default: "",
    },
    nextStep: {
      type: String,
      enum: COORDINATION_NEXT_STEP_VALUES,
      required: true,
      default: "monitoring",
    },
    followUpOwner: {
      type: followUpOwnerSchema,
      required: true,
      default: () => ({ kind: "unassigned" }),
    },
    linkedTaskId: {
      type: String,
      trim: true,
      maxlength: 120,
    },
    updatedBy: {
      type: authorSnapshotSchema,
      required: true,
    },
    updatedAt: {
      type: Date,
      required: true,
    },
  },
  { _id: false }
);

const noteHistoryItemSchema = new Schema(
  {
    id: {
      type: String,
      required: true,
      trim: true,
      default: () => randomUUID(),
    },
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: COORDINATION_NOTE_MAX_LENGTH,
    },
    createdBy: {
      type: authorSnapshotSchema,
      required: true,
    },
    createdAt: {
      type: Date,
      required: true,
    },
  },
  { _id: false }
);

const clinicianCoordinationSchema = new Schema(
  {
    patientId: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    currentHandoff: {
      type: currentHandoffSchema,
      default: undefined,
    },
    noteHistory: {
      type: [noteHistoryItemSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

clinicianCoordinationSchema.index({ patientId: 1 }, { unique: true });

const ClinicianCoordination = model(
  "ClinicianCoordination",
  clinicianCoordinationSchema
);

export default ClinicianCoordination;
