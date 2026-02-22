import { Schema, model } from "mongoose";

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

const chatMessageSchema = new Schema(
  {
    patientId: {
      type: String,
      required: true,
      trim: true,
    },
    role: {
      type: String,
      enum: ["user", "assistant", "system"],
      required: true,
    },
    text: {
      type: String,
      required: true,
    },
    risk: {
      type: riskSchema,
      default: () => ({ level: "low", reasons: [] }),
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

chatMessageSchema.index({ patientId: 1, createdAt: -1 });
chatMessageSchema.index({ demoTag: 1 });

const ChatMessage = model("ChatMessage", chatMessageSchema);

export default ChatMessage;
