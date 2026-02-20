import { Router } from "express";
import { z } from "zod";

import Alert from "../models/Alert";
import CareEvent from "../models/CareEvent";
import ChatMessage from "../models/ChatMessage";
import { validateBody } from "../middleware/validate";
import { AIUnavailableError, classify } from "../services/ai";
import { emitAlertCreated } from "../services/n8n";
import { toId } from "../utils/ids";
import { logger } from "../utils/logger";
import { redactText } from "../utils/redact";

const router = Router();

const chatSchema = z.object({
  patientId: z.string().min(1),
  text: z.string().min(1).max(2000),
});

const HIGH_RISK_REPLY =
  "I'm concerned about your safety. I've alerted your clinician. If you feel in danger, contact local emergency services now.";

const LOW_RISK_REPLY =
  "Thanks for sharing. I can help you track your rehab and coping strategies. What symptom changed today?";

router.post("/chat/send", validateBody(chatSchema), async (req, res) => {
  try {
    const { patientId, text } = req.body as z.infer<typeof chatSchema>;

    logger.info("POST /chat/send", {
      patientId,
      textPreview: redactText(text),
    });

    const userMsg = await ChatMessage.create({
      patientId,
      role: "user",
      text,
      risk: {
        level: "low",
        reasons: [],
      },
    });

    let aiResult;
    try {
      aiResult = await classify({ type: "chat", text });
    } catch (error) {
      if (error instanceof AIUnavailableError) {
        return res.status(502).json({ ok: false, error: "AI_UNAVAILABLE" });
      }
      throw error;
    }

    userMsg.risk = {
      level: aiResult.risk,
      reasons: aiResult.reasons,
    };
    await userMsg.save();

    if (aiResult.risk === "high") {
      const alert = await Alert.create({
        patientId,
        reason: aiResult.reasons.join(", "),
        source: {
          type: "chat",
          sourceId: toId(userMsg._id),
        },
      });

      await CareEvent.create({
        type: "ALERT_CREATED",
        patientId,
        alertId: toId(alert._id),
        payload: {
          reasons: aiResult.reasons,
          text: redactText(text),
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

      await ChatMessage.create({
        patientId,
        role: "assistant",
        text: HIGH_RISK_REPLY,
        risk: {
          level: "high",
          reasons: aiResult.reasons,
        },
      });

      return res.json({
        ok: true,
        risk: "high",
        reply: HIGH_RISK_REPLY,
        alertId: toId(alert._id),
        n8nDelivered,
      });
    }

    await ChatMessage.create({
      patientId,
      role: "assistant",
      text: LOW_RISK_REPLY,
      risk: {
        level: "low",
        reasons: [],
      },
    });

    return res.json({
      ok: true,
      risk: "low",
      reply: LOW_RISK_REPLY,
    });
  } catch (error) {
    logger.error("Chat route failed", {
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
