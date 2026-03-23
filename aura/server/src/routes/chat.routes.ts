import { Router } from "express";
import { z } from "zod";

import { env } from "../env";
import { validateBody } from "../middleware/validate";
import { AIUnavailableError } from "../services/ai";
import {
  HIGH_RISK_REPLY,
  LOW_RISK_REPLY,
  processChatMessage,
} from "../services/chatFlow";
import { logger } from "../utils/logger";
import { verifyPatientToken } from "../utils/patientJwt";
import { redactText } from "../utils/redact";
import { hasValidSharedSecret } from "../utils/sharedSecret";

const router = Router();

const chatSchema = z.object({
  patientId: z.string().min(1).optional(),
  text: z.string().min(1).max(2000),
});

function parseBearerToken(authorization: string | undefined): string | null {
  if (!authorization) {
    return null;
  }

  const [scheme, token] = authorization.split(" ");
  if (!scheme || scheme.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  const normalized = token.trim();
  return normalized.length > 0 ? normalized : null;
}

function resolveLegacyPatientId(
  authorization: string | undefined,
  internalKey: string | undefined,
  bodyPatientId: string | undefined
): { ok: true; patientId: string } | { ok: false; status: 400 | 401 } {
  const token = parseBearerToken(authorization);
  if (token) {
    const decoded = verifyPatientToken(token);
    if (decoded?.id) {
      return { ok: true, patientId: decoded.id };
    }
  }

  if (!env.LEGACY_PUBLIC_ENDPOINTS_ENABLED) {
    return { ok: false, status: 401 };
  }

  if (!hasValidSharedSecret(internalKey, env.AURA_INTERNAL_KEY)) {
    return { ok: false, status: 401 };
  }

  const normalizedBodyPatientId = typeof bodyPatientId === "string" ? bodyPatientId.trim() : "";
  if (!normalizedBodyPatientId) {
    return { ok: false, status: 400 };
  }

  return { ok: true, patientId: normalizedBodyPatientId };
}

router.post("/chat/send", validateBody(chatSchema), async (req, res) => {
  try {
    const { patientId: bodyPatientId, text } = req.body as z.infer<typeof chatSchema>;
    const resolvedPatient = resolveLegacyPatientId(
      req.header("authorization"),
      req.header("x-aura-internal-key"),
      bodyPatientId
    );
    if (resolvedPatient.ok === false) {
      if (resolvedPatient.status === 400) {
        return res.status(400).json({
          ok: false,
          error: "VALIDATION_ERROR",
          details: [{ path: "patientId", message: "patientId is required" }],
        });
      }
      return res.status(401).json({
        ok: false,
        error: "UNAUTHORIZED",
      });
    }
    const patientId = resolvedPatient.patientId;

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
