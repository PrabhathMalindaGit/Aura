import { Schema, model } from "mongoose";

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const symptomPhotoSchema = new Schema(
  {
    patientId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    date: {
      type: String,
      required: true,
      validate: {
        validator: (value: unknown) => typeof value === "string" && DATE_ONLY_REGEX.test(value),
        message: "date must be YYYY-MM-DD",
      },
      index: true,
    },
    kind: {
      type: String,
      enum: ["swelling", "wound", "rash", "other"],
      required: true,
    },
    note: {
      type: String,
      maxlength: 280,
    },
    mimeType: {
      type: String,
      required: true,
    },
    sizeBytes: {
      type: Number,
      required: true,
      min: 1,
    },
    originalName: {
      type: String,
      maxlength: 180,
    },
    storageKey: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

symptomPhotoSchema.index({ patientId: 1, date: -1, createdAt: -1 });

const SymptomPhoto = model("SymptomPhoto", symptomPhotoSchema);

export default SymptomPhoto;
