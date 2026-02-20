import { Router } from "express";
import { z } from "zod";

import Alert from "../models/Alert";
import { validateBody } from "../middleware/validate";
import { isObjectId } from "../utils/ids";
import { logger } from "../utils/logger";

const router = Router();

const alertStatusSchema = z.enum(["open", "acknowledged", "resolved"]);
const patchSchema = z.object({
  status: z.enum(["acknowledged", "resolved"]),
});

router.get("/clinician/alerts", async (req, res) => {
  try {
    const rawStatus = (req.query.status as string | undefined) ?? "open";
    const parsedStatus = alertStatusSchema.safeParse(rawStatus);

    if (!parsedStatus.success) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        details: parsedStatus.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    const alerts = await Alert.find({ status: parsedStatus.data })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    return res.json({
      ok: true,
      alerts,
    });
  } catch (error) {
    logger.error("Get alerts route failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({
      ok: false,
      error: "INTERNAL_ERROR",
      message: "Something went wrong",
    });
  }
});

router.patch(
  "/clinician/alerts/:id",
  validateBody(patchSchema),
  async (req, res) => {
    try {
      const { id } = req.params;

      if (!isObjectId(id)) {
        return res.status(400).json({
          ok: false,
          error: "VALIDATION_ERROR",
          details: [
            {
              path: "id",
              message: "Invalid alert id",
            },
          ],
        });
      }

      const { status } = req.body as z.infer<typeof patchSchema>;

      const update: Record<string, unknown> = {
        status,
      };

      if (status === "acknowledged") {
        update.acknowledgedAt = new Date();
      }

      if (status === "resolved") {
        update.resolvedAt = new Date();
      }

      const updated = await Alert.findByIdAndUpdate(id, update, {
        new: true,
      }).lean();

      if (!updated) {
        return res.status(404).json({
          ok: false,
          error: "NOT_FOUND",
          message: "Alert not found",
        });
      }

      return res.json({
        ok: true,
        alert: updated,
      });
    } catch (error) {
      logger.error("Patch alert route failed", {
        message: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({
        ok: false,
        error: "INTERNAL_ERROR",
        message: "Something went wrong",
      });
    }
  }
);

export default router;
