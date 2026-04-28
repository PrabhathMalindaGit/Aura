import { Schema, model } from "mongoose";

export const TASK_TYPE_VALUES = [
  "follow_up",
  "appointment",
  "safety_review",
  "adherence_review",
  "communication",
  "custom",
] as const;

export const TASK_PRIORITY_VALUES = ["low", "medium", "high", "urgent"] as const;
export const TASK_STATUS_VALUES = [
  "open",
  "in_progress",
  "completed",
  "cancelled",
] as const;

const taskSourceSchema = new Schema(
  {
    type: {
      type: String,
      trim: true,
      maxlength: 80,
      default: "manual",
    },
    entityType: {
      type: String,
      trim: true,
      maxlength: 80,
    },
    entityId: {
      type: String,
      trim: true,
      maxlength: 120,
    },
    label: {
      type: String,
      trim: true,
      maxlength: 160,
    },
  },
  { _id: false }
);

const taskSchema = new Schema(
  {
    patientId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 2000,
    },
    type: {
      type: String,
      enum: TASK_TYPE_VALUES,
      required: true,
      default: "follow_up",
      index: true,
    },
    priority: {
      type: String,
      enum: TASK_PRIORITY_VALUES,
      required: true,
      default: "medium",
      index: true,
    },
    status: {
      type: String,
      enum: TASK_STATUS_VALUES,
      required: true,
      default: "open",
      index: true,
    },
    dueAt: {
      type: Date,
      default: null,
      index: true,
    },
    assignedTo: {
      type: String,
      trim: true,
      index: true,
    },
    createdBy: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    source: {
      type: taskSourceSchema,
      default: () => ({ type: "manual" }),
    },
    linkedAlertId: {
      type: String,
      trim: true,
      index: true,
    },
    linkedAppointmentId: {
      type: String,
      trim: true,
      index: true,
    },
    linkedMessageId: {
      type: String,
      trim: true,
      index: true,
    },
    meta: {
      type: Schema.Types.Mixed,
      default: undefined,
    },
    demoTag: {
      type: String,
      trim: true,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

taskSchema.index({ patientId: 1, status: 1, dueAt: 1 });
taskSchema.index({ assignedTo: 1, status: 1, dueAt: 1 });
taskSchema.index({ status: 1, priority: 1, createdAt: -1 });
taskSchema.index({ demoTag: 1 });

const Task = model("Task", taskSchema);

export default Task;
