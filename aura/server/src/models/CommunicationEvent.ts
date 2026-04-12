import { Schema, model } from "mongoose";

export const COMMUNICATION_CHANNEL_VALUES = ["patient_chat"] as const;
export const COMMUNICATION_EVENT_TYPE_VALUES = [
  "patient_message_sent",
  "thread_opened",
  "review_recorded",
  "follow_up_requested",
  "resolved_no_follow_up",
] as const;
export const COMMUNICATION_ACTOR_TYPE_VALUES = [
  "patient",
  "clinician",
  "automation",
  "system",
] as const;

export type CommunicationChannel = (typeof COMMUNICATION_CHANNEL_VALUES)[number];
export type CommunicationEventType =
  (typeof COMMUNICATION_EVENT_TYPE_VALUES)[number];
export type CommunicationActorType =
  (typeof COMMUNICATION_ACTOR_TYPE_VALUES)[number];

const communicationEventSchema = new Schema(
  {
    patientId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    threadKey: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    channel: {
      type: String,
      enum: COMMUNICATION_CHANNEL_VALUES,
      required: true,
      default: "patient_chat",
      index: true,
    },
    messageId: {
      type: String,
      trim: true,
      index: true,
    },
    eventType: {
      type: String,
      enum: COMMUNICATION_EVENT_TYPE_VALUES,
      required: true,
      index: true,
    },
    actorType: {
      type: String,
      enum: COMMUNICATION_ACTOR_TYPE_VALUES,
      required: true,
      index: true,
    },
    actorId: {
      type: String,
      trim: true,
      index: true,
    },
    actorDisplayName: {
      type: String,
      trim: true,
      maxlength: 120,
    },
    sourceSurface: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
      index: true,
    },
    sourceRecordId: {
      type: String,
      trim: true,
      maxlength: 120,
      index: true,
    },
    createdAt: {
      type: Date,
      required: true,
      default: () => new Date(),
      index: true,
    },
  },
  {
    timestamps: false,
  }
);

communicationEventSchema.index({ threadKey: 1, createdAt: -1 });
communicationEventSchema.index({ patientId: 1, eventType: 1, createdAt: -1 });
communicationEventSchema.index({ messageId: 1, eventType: 1, createdAt: -1 });
communicationEventSchema.index({
  actorType: 1,
  actorId: 1,
  sourceSurface: 1,
  createdAt: -1,
});

const CommunicationEvent = model("CommunicationEvent", communicationEventSchema);

export default CommunicationEvent;
