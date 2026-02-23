import { Router } from "express";
import { z } from "zod";

import { validateBody } from "../middleware/validate";
import { AIUnavailableError } from "../services/ai";
import {
  HIGH_RISK_REPLY,
  LOW_RISK_REPLY,
  processChatMessage,
} from "../services/chatFlow";
import { logger } from "../utils/logger";
import { redactText } from "../utils/redact";

const router = Router();

const chatSchema = z.object({
  patientId: z.string().min(1),
  text: z.string().min(1).max(2000),
});

router.post("/chat/send", validateBody(chatSchema), async (req, res) => {
  try {
    const { patientId, text } = req.body as z.infer<typeof chatSchema>;

    logger.info("POST /chat/send", {
      patientId,
      textPreview: redactText(text),
    });

    const result = await processChatMessage({
      patientId,
      text,
      lowRiskMode: "legacy-static",
      persistHighRiskAssistantReply: true,
    });

    if (result.riskLevel === "high") {
      return res.json({
        ok: true,
        risk: "high",
        reply: HIGH_RISK_REPLY,
        alertId: result.alertId,
        n8nDelivered: result.n8nDelivered,
      });
    }

    return res.json({
      ok: true,
      risk: "low",
      reply: result.assistantReply ?? LOW_RISK_REPLY,
    });
  } catch (error) {
    if (error instanceof AIUnavailableError) {
      return res.status(502).json({ ok: false, error: "AI_UNAVAILABLE" });
    }

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
