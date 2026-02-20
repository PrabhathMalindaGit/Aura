import { Router } from "express";

import { logger } from "../utils/logger";

const router = Router();

router.get("/health", (_req, res) => {
  try {
    return res.json({ status: "ok" });
  } catch (error) {
    logger.error("Health route failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({
      ok: false,
      error: "INTERNAL_ERROR",
      message: "Something went wrong",
    });
  }
});

export default router;
