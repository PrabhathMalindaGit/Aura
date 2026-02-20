import mongoose from "mongoose";

import { env } from "../env";
import { logger } from "../utils/logger";

export async function connectMongo(): Promise<void> {
  await mongoose.connect(env.MONGO_URL);
  logger.info("✅ Mongo connected");
}

export async function disconnectMongo(): Promise<void> {
  await mongoose.disconnect();
}
