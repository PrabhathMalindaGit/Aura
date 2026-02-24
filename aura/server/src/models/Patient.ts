import { Schema, model } from "mongoose";

const rehabPhaseStatusValues = ["locked", "current", "done"] as const;

const rehabPhaseSchema = new Schema(
  {
    key: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
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
      maxlength: 300,
    },
    order: {
      type: Number,
      required: true,
      min: 0,
      max: 99,
    },
    status: {
      type: String,
      enum: rehabPhaseStatusValues,
      required: true,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false }
);

const rehabUpdatedBySchema = new Schema(
  {
    clinicianId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    name: {
      type: String,
      trim: true,
      maxlength: 120,
    },
  },
  { _id: false }
);

const rehabSchema = new Schema(
  {
    phases: {
      type: [rehabPhaseSchema],
      default: [],
      validate: {
        validator: (value: Array<{ key?: string; order?: number }>) => {
          if (!Array.isArray(value) || value.length > 20) {
            return false;
          }

          if (value.length === 0) {
            return true;
          }

          const keys = new Set<string>();
          const orders = new Set<number>();

          for (const phase of value) {
            const key = typeof phase.key === "string" ? phase.key.trim() : "";
            const order = typeof phase.order === "number" ? phase.order : Number.NaN;

            if (!key || !Number.isInteger(order) || order < 0) {
              return false;
            }

            if (keys.has(key) || orders.has(order)) {
              return false;
            }

            keys.add(key);
            orders.add(order);
          }

          // Phases use zero-based ordering.
          return orders.has(0);
        },
        message:
          "rehab.phases must contain unique keys/orders, start at order 0, and include at most 20 phases",
      },
    },
    currentKey: {
      type: String,
      trim: true,
      default: null,
      validate: {
        validator(this: { phases?: Array<{ key?: string }> }, value: string | null): boolean {
          if (!value) {
            return true;
          }

          const phases = Array.isArray(this.phases) ? this.phases : [];
          return phases.some((phase) => phase?.key === value);
        },
        message: "rehab.currentKey must match an existing phase key",
      },
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
    updatedBy: {
      type: rehabUpdatedBySchema,
      default: undefined,
    },
  },
  { _id: false }
);

const patientSchema = new Schema(
  {
    patientId: {
      type: String,
      required: true,
      trim: true,
    },
    displayName: {
      type: String,
      trim: true,
    },
    accessCode: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ["active", "on_hold", "discharged", "inactive"],
      default: "active",
    },
    clinicianId: {
      type: String,
      trim: true,
    },
    demoTag: {
      type: String,
      trim: true,
    },
    rehab: {
      type: rehabSchema,
      default: undefined,
    },
  },
  {
    timestamps: true,
  }
);

patientSchema.index({ patientId: 1 }, { unique: true });
patientSchema.index({ accessCode: 1 }, { unique: true, sparse: true });
patientSchema.index({ status: 1 });
patientSchema.index({ clinicianId: 1, status: 1 });
patientSchema.index({ demoTag: 1 });

const Patient = model("Patient", patientSchema);

export default Patient;
