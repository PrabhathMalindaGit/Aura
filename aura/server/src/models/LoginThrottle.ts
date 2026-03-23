import { Schema, model } from "mongoose";

const loginThrottleSchema = new Schema(
  {
    scope: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    bucketKeyHash: {
      type: String,
      required: true,
      trim: true,
      minlength: 64,
      maxlength: 64,
    },
    count: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    windowStartedAt: {
      type: Date,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

loginThrottleSchema.index({ scope: 1, bucketKeyHash: 1 }, { unique: true });
loginThrottleSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const LoginThrottle = model("LoginThrottle", loginThrottleSchema);

export default LoginThrottle;
