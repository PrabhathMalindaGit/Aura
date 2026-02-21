import { Schema, model } from "mongoose";

const careEventSchema = new Schema(
  {
    type: {
      type: String,
      required: true,
    },
    patientId: {
      type: String,
      required: true,
      trim: true,
    },
    alertId: {
      type: String,
    },
    payload: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

careEventSchema.index({ patientId: 1, createdAt: -1 });
careEventSchema.index({ alertId: 1, createdAt: 1 });

const CareEvent = model("CareEvent", careEventSchema);

export default CareEvent;
