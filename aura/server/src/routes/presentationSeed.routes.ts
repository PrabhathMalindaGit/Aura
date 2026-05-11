import { Response, Router } from "express";

import {
  getPresentationSeedStatus,
  loadPresentationSeed,
  PresentationSeedCollisionError,
  PresentationSeedDisabledError,
  resetPresentationSeed,
} from "../services/presentationSeedService";
import type { RequestWithUser } from "../types/auth";
import { logger } from "../utils/logger";

const router = Router();

function handlePresentationSeedError(error: unknown, res: Response) {
  if (error instanceof PresentationSeedDisabledError) {
    return res.status(403).json({
      ok: false,
      error: "PRESENTATION_SEED_DISABLED",
      message: "Presentation seed is disabled",
    });
  }

  if (error instanceof PresentationSeedCollisionError) {
    return res.status(409).json({
      ok: false,
      error: "PRESENTATION_SEED_COLLISION",
      message: "Presentation seed reserved IDs collide with untagged records",
      collisions: error.collisions,
      details: error.details,
    });
  }

  logger.error("presentation.seed.route.failed", {
    message: error instanceof Error ? error.message : String(error),
  });

  return res.status(500).json({
    ok: false,
    error: "INTERNAL_ERROR",
  });
}

router.get("/clinician/dev/presentation/seed", async (_req, res) => {
  try {
    const status = await getPresentationSeedStatus();
    return res.json({
      ok: true,
      ...status,
    });
  } catch (error) {
    return handlePresentationSeedError(error, res);
  }
});

router.post("/clinician/dev/presentation/seed", async (_req, res) => {
  try {
    const req = _req as RequestWithUser;
    const summary = await loadPresentationSeed({
      clinicianId: req.user?.id,
      clinicianName: req.user?.name,
    });
    return res.json({
      ok: true,
      ...summary,
    });
  } catch (error) {
    return handlePresentationSeedError(error, res);
  }
});

router.delete("/clinician/dev/presentation/seed", async (_req, res) => {
  try {
    const req = _req as RequestWithUser;
    const summary = await resetPresentationSeed({
      clinicianId: req.user?.id,
      clinicianName: req.user?.name,
    });
    return res.json({
      ok: true,
      ...summary,
    });
  } catch (error) {
    return handlePresentationSeedError(error, res);
  }
});

export default router;
