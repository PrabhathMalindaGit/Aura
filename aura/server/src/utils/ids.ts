import mongoose from "mongoose";

export function toId(value: unknown): string {
  if (value == null) {
    return "";
  }

  return String(value);
}

export function isObjectId(value: string): boolean {
  return mongoose.Types.ObjectId.isValid(value);
}
