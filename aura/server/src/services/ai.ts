import axios from "axios";

import { env } from "../env";
import type { RequestCorrelationContext } from "../middleware/requestContext";
import { REQUEST_ID_HEADER } from "../middleware/requestContext";
import { logger } from "../utils/logger";

export type ClassifyInput = {
  type: "checkin" | "chat";
  pain?: number;
  text?: string;
};

export type ClassifyOutput = {
  risk: "low" | "high";
  reasons: string[];
};

export type RagReplyInput = {
  patientId: string;
  message: string;
  context?: unknown;
};

export type RagReplyOutput = {
  reply: string;
  citations: string[];
};

export class AIUnavailableError extends Error {
  constructor(message = "AI service unavailable") {
    super(message);
    this.name = "AIUnavailableError";
  }
}

function buildHeaders(context?: RequestCorrelationContext): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-aura-ai-key": env.AURA_AI_SERVICE_KEY,
    ...(context?.requestId ? { [REQUEST_ID_HEADER]: context.requestId } : {}),
  };
}

export async function classify(
  input: ClassifyInput,
  context?: RequestCorrelationContext & { flow?: string; patientId?: string }
): Promise<ClassifyOutput> {
  try {
    const response = await axios.post(`${env.AI_BASE_URL}/classify`, input, {
      timeout: 4000,
      headers: buildHeaders(context),
    });

    const risk = response?.data?.risk === "high" ? "high" : "low";
    const reasons = Array.isArray(response?.data?.reasons)
      ? response.data.reasons.filter((item: unknown) => typeof item === "string")
      : [];

    return { risk, reasons };
  } catch (error) {
    logger.error("ai.classify.failed", {
      requestId: context?.requestId,
      flow: context?.flow,
      patientId: context?.patientId,
      message: error instanceof Error ? error.message : String(error),
    });
    throw new AIUnavailableError();
  }
}

export async function ragReply(
  input: RagReplyInput,
  context?: RequestCorrelationContext & { flow?: string; patientId?: string }
): Promise<RagReplyOutput> {
  try {
    const response = await axios.post(`${env.AI_BASE_URL}/rag/reply`, input, {
      timeout: 4000,
      headers: buildHeaders(context),
    });

    const reply =
      typeof response?.data?.reply === "string" && response.data.reply.trim()
        ? response.data.reply
        : "Thanks for the update. Keep following your rehab plan.";
    const citations = Array.isArray(response?.data?.citations)
      ? response.data.citations.filter((item: unknown) => typeof item === "string")
      : [];

    return {
      reply,
      citations,
    };
  } catch (error) {
    logger.error("ai.rag.failed", {
      requestId: context?.requestId,
      flow: context?.flow,
      patientId: context?.patientId,
      message: error instanceof Error ? error.message : String(error),
    });
    throw new AIUnavailableError();
  }
}
