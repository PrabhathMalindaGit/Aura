import { Router } from "express";
import { z } from "zod";

import Alert from "../models/Alert";
import CareEvent from "../models/CareEvent";
import CheckIn from "../models/CheckIn";
import { validateBody } from "../middleware/validate";
import { AIUnavailableError, classify } from "../services/ai";
import { emitAlertCreated } from "../services/n8n";
import { toId } from "../utils/ids";
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

    const checkin = await CheckIn.create({
      patientId,
      date,
      mood,
      pain,
      adherence: {
        exercises: adherence?.exercises ?? 0,
        medication: adherence?.medication ?? false,
      },
      notes,
      risk: {
        level: "low",
        reasons: [],
      },
    });

    let aiResult;
    try {
      aiResult = await classify({ type: "checkin", pain, text: notes || "" });
    } catch (error) {
      if (error instanceof AIUnavailableError) {
        return res.status(502).json({ ok: false, error: "AI_UNAVAILABLE" });
      }
      throw error;
    }

    checkin.risk = {
      level: aiResult.risk,
      reasons: aiResult.reasons,
    };
    await checkin.save();

    if (aiResult.risk === "high") {
      const alert = await Alert.create({
        patientId,
        reason: aiResult.reasons.join(", "),
        source: {
          type: "checkin",
          sourceId: toId(checkin._id),
        },
      });

      await CareEvent.create({
        type: "ALERT_CREATED",
        patientId,
        alertId: toId(alert._id),
        payload: {
          reasons: aiResult.reasons,
          pain,
        },
      });

      const n8nDelivered = await emitAlertCreated({
        type: "ALERT_CREATED",
        patientId,
        alertId: toId(alert._id),
        risk: "high",
        reason: aiResult.reasons,
        timestamp: new Date().toISOString(),
      });

      return res.json({
        ok: true,
        risk: "high",
        checkinId: toId(checkin._id),
        alertId: toId(alert._id),
        n8nDelivered,
        message:
          "I'm concerned about your safety. I've alerted your clinician. If you feel unsafe, seek urgent help now.",
      });
    }

    return res.json({
      ok: true,
      risk: "low",
      checkinId: toId(checkin._id),
    });
  } catch (error) {
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
