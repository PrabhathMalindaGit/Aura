import { Schema, model } from "mongoose";

const userSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ["clinician", "admin", "patient"],
      required: true,
    },
    displayName: {
      type: String,
      trim: true,
    },
    demoTag: {
      type: String,
      trim: true,
    },
    sessionVersion: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ role: 1 });
userSchema.index({ demoTag: 1 });

const User = model("User", userSchema);

export default User;
