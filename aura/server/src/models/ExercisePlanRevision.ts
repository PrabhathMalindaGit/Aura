import { Schema, model } from "mongoose";

const savedBySchema = new Schema(
  {
    clinicianId: {
      type: String,
      required: true,
      trim: true,
    },
    name: {
      type: String,
      trim: true,
    },
  },
  { _id: false }
);

const exercisePlanRevisionSchema = new Schema(
  {
    patientId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    version: {
      type: Number,
      required: true,
      min: 1,
    },
    savedBy: {
      type: savedBySchema,
      required: true,
    },
    savedAt: {
      type: Date,
      required: true,
    },
    snapshot: {
      type: Schema.Types.Mixed,
      required: true,
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

exercisePlanRevisionSchema.index({ patientId: 1, version: -1 }, { unique: true });
exercisePlanRevisionSchema.index({ demoTag: 1 });

const ExercisePlanRevision = model(
  "ExercisePlanRevision",
  exercisePlanRevisionSchema
);

export default ExercisePlanRevision;
