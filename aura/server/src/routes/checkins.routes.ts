import { Router } from "express";
import { z } from "zod";

import { validateBody } from "../middleware/validate";
import { AIUnavailableError } from "../services/ai";
import { processCheckIn } from "../services/checkinFlow";
import { logger } from "../utils/logger";
import { redactText } from "../utils/redact";

const router = Router();

const checkInSchema = z.object({
  patientId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mood: z.number().min(1).max(5),
  pain: z.number().min(0).max(10),
  adherence: z
    .object({
      exercises: z.number().min(0).max(1).optional(),
      medication: z.boolean().optional(),
    })
    .optional(),
  notes: z.string().max(2000).optional(),
});

router.post("/checkins", validateBody(checkInSchema), async (req, res) => {
  try {
    const { patientId, date, mood, pain, adherence, notes } = req.body as z.infer<
      typeof checkInSchema
    >;

    logger.info("POST /checkins", {
      patientId,
      date,
      mood,
      pain,
      notesPreview: redactText(notes),
    });

    const result = await processCheckIn({
      patientId,
      date,
      mood,
      pain,
      adherence,
      notes,
    });

    if (result.riskLevel === "high") {
      return res.json({
        ok: true,
        risk: "high",
        checkinId: result.checkInId,
        alertId: result.alertId,
        n8nDelivered: result.n8nDelivered,
        message:
          "I'm concerned about your safety. I've alerted your clinician. If you feel unsafe, seek urgent help now.",
      });
    }

    return res.json({
      ok: true,
      risk: "low",
      checkinId: result.checkInId,
    });
  } catch (error) {
    if (error instanceof AIUnavailableError) {
      return res.status(502).json({ ok: false, error: "AI_UNAVAILABLE" });
    }

    if (typeof error === "object" && error !== null && "code" in error) {
      const maybeCode = (error as { code?: unknown }).code;
      if (maybeCode === 11000) {
        return res.status(409).json({
          ok: false,
          error: "DUPLICATE_CHECKIN",
          message: "A check-in for this patient and date already exists",
        });
      }
    }

    logger.error("Check-in route failed", {
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
