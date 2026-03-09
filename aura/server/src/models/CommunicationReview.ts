import { Schema, model } from "mongoose";

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
  },
  {
    timestamps: true,
  }
);

communicationReviewSchema.index({ messageId: 1 }, { unique: true });
communicationReviewSchema.index({ patientId: 1, needsResponse: 1, messageCreatedAt: -1 });
communicationReviewSchema.index({ followUpRequested: 1, updatedAt: -1 });

const CommunicationReview = model("CommunicationReview", communicationReviewSchema);

export default CommunicationReview;
