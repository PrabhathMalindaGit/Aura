import { Schema, model } from "mongoose";

const caregiverInviteSchema = new Schema(
  {
    patientId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
      index: true,
    },
    codeHash: {
      type: String,
      required: true,
      trim: true,
      maxlength: 128,
      index: true,
    },
    codeHint: {
      type: String,
      required: true,
      trim: true,
      maxlength: 8,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    usedAt: {
      type: Date,
      default: null,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
    relationship: {
      type: String,
      trim: true,
      maxlength: 80,
    },
    caregiverName: {
      type: String,
      trim: true,
      maxlength: 120,
    },
    lastAccessedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

caregiverInviteSchema.index({ patientId: 1, codeHash: 1 }, { unique: true });
caregiverInviteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const CaregiverInvite = model("CaregiverInvite", caregiverInviteSchema);

export default CaregiverInvite;
