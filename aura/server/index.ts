import app from "./src/app";
import { connectMongo } from "./src/db/mongo";
import { env } from "./src/env";
import { logger } from "./src/utils/logger";

async function startServer(): Promise<void> {
  try {
    await connectMongo();

    app.listen(env.PORT, () => {
      logger.info("Server started", { url: `http://localhost:${env.PORT}` });
    });
  } catch (error) {
    logger.error("Fatal startup error", {
      message: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled promise rejection", {
    message: reason instanceof Error ? reason.message : String(reason),
  });
  process.exit(1);
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception", { message: error.message });
  process.exit(1);
});

void startServer();
