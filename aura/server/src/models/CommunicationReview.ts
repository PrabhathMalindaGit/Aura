import { Schema, model } from "mongoose";

export const COMMUNICATION_RESOLUTION_KIND_VALUES = [
  "no_follow_up_needed",
] as const;

export type CommunicationResolutionKind =
  (typeof COMMUNICATION_RESOLUTION_KIND_VALUES)[number];

const clinicianSnapshotSchema = new Schema(
  {
    clinicianId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    displayName: {
      type: String,
      trim: true,
      maxlength: 120,
    },
  },
  { _id: false }
);

const communicationReviewSchema = new Schema(
  {
    patientId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    messageId: {
      type: String,
      required: true,
      trim: true,
    },
    source: {
      type: String,
      enum: ["chat"],
      default: "chat",
      required: true,
    },
    needsResponse: {
      type: Boolean,
      default: false,
      index: true,
    },
    flaggedBySafety: {
      type: Boolean,
      default: false,
      index: true,
    },
    lastClinicianReplyAt: {
      type: Date,
      default: null,
    },
    lastReviewedAt: {
      type: Date,
      default: null,
      index: true,
    },
    lastReviewedBy: {
      type: clinicianSnapshotSchema,
      default: undefined,
    },
    followUpRequested: {
      type: Boolean,
      default: false,
      index: true,
    },
    linkedTaskId: {
      type: String,
      trim: true,
      index: true,
    },
    messageCreatedAt: {
      type: Date,
      default: null,
      index: true,
    },
    messagePreview: {
      type: String,
      trim: true,
      maxlength: 280,
    },
    resolutionKind: {
      type: String,
      enum: COMMUNICATION_RESOLUTION_KIND_VALUES,
      default: null,
    },
    resolvedAt: {
      type: Date,
      default: null,
      index: true,
    },
    resolvedBy: {
      type: clinicianSnapshotSchema,
      default: undefined,
    },
  },
  {
    timestamps: true,
  }
);

communicationReviewSchema.index({ messageId: 1 }, { unique: true });
communicationReviewSchema.index({ patientId: 1, needsResponse: 1, messageCreatedAt: -1 });
communicationReviewSchema.index({ followUpRequested: 1, updatedAt: -1 });
communicationReviewSchema.index({ patientId: 1, resolvedAt: 1, messageCreatedAt: -1 });
communicationReviewSchema.index({ patientId: 1, lastReviewedAt: -1, messageCreatedAt: -1 });

const CommunicationReview = model("CommunicationReview", communicationReviewSchema);

export default CommunicationReview;
