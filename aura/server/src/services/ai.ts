import axios from "axios";
import { z } from "zod";

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

export type AIErrorKind =
  | "timeout"
  | "network"
  | "unauthorized"
  | "upstream_http"
  | "invalid_response"
  | "unknown";

type AIOperation = "classify" | "ragReply";
type AIRequestContext = RequestCorrelationContext & { flow?: string; patientId?: string };

const classifyResponseSchema = z.object({
  risk: z.enum(["low", "high"]),
  reasons: z.array(z.enum(["PAIN_GE_THRESHOLD", "CRISIS_LANGUAGE"])),
  ruleVersion: z.literal("v1"),
});

const ragReplyResponseSchema = z.object({
  reply: z.string().trim().min(1).max(500),
  citations: z.array(z.string()),
});

export class AIUnavailableError extends Error {
  readonly kind: AIErrorKind;
  readonly statusCode?: number;
  readonly aiOperation: AIOperation;

  constructor(options?: {
    message?: string;
    kind?: AIErrorKind;
    statusCode?: number;
    aiOperation?: AIOperation;
  }) {
    super(options?.message ?? "AI service unavailable");
    this.name = "AIUnavailableError";
    this.kind = options?.kind ?? "unknown";
    this.statusCode = options?.statusCode;
    this.aiOperation = options?.aiOperation ?? "classify";
  }
}

function buildHeaders(context?: RequestCorrelationContext): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-aura-ai-key": env.AURA_AI_SERVICE_KEY,
    ...(context?.requestId ? { [REQUEST_ID_HEADER]: context.requestId } : {}),
  };
}

function buildLogContext(
  aiOperation: AIOperation,
  context?: AIRequestContext
): Record<string, unknown> {
  return {
    requestId: context?.requestId,
    flow: context?.flow,
    patientId: context?.patientId,
    aiOperation,
    timeoutMs: env.AI_REQUEST_TIMEOUT_MS,
  };
}

function isNetworkErrorCode(code: string | undefined): boolean {
  return (
    code === "ECONNREFUSED" ||
    code === "ECONNRESET" ||
    code === "ENOTFOUND" ||
    code === "EPIPE" ||
    code === "EAI_AGAIN"
  );
}

function normalizeAIError(error: unknown, aiOperation: AIOperation): AIUnavailableError {
  if (error instanceof AIUnavailableError) {
    return error;
  }

  if (axios.isAxiosError(error)) {
    const statusCode = error.response?.status;
    if (error.code === "ECONNABORTED" || /timeout/i.test(error.message)) {
      return new AIUnavailableError({
        message: "AI request timed out",
        kind: "timeout",
        statusCode,
        aiOperation,
      });
    }

    if (statusCode === 401 || statusCode === 403) {
      return new AIUnavailableError({
        message: "AI request unauthorized",
        kind: "unauthorized",
        statusCode,
        aiOperation,
      });
    }

    if (typeof statusCode === "number") {
      return new AIUnavailableError({
        message: `AI upstream returned ${statusCode}`,
        kind: "upstream_http",
        statusCode,
        aiOperation,
      });
    }

    if (isNetworkErrorCode(error.code) || error.request) {
      return new AIUnavailableError({
        message: "AI network request failed",
        kind: "network",
        aiOperation,
      });
    }
  }

  return new AIUnavailableError({
    message: error instanceof Error ? error.message : "AI request failed unexpectedly",
    kind: "unknown",
    aiOperation,
  });
}

async function postToAI<TOutput>(
  path: string,
  aiOperation: AIOperation,
  payload: unknown,
  schema: z.ZodType<TOutput>,
  context?: AIRequestContext
): Promise<TOutput> {
  logger.info("ai.request.started", {
    ...buildLogContext(aiOperation, context),
    path,
  });

  try {
    const response = await axios.post(`${env.AI_BASE_URL}${path}`, payload, {
      timeout: env.AI_REQUEST_TIMEOUT_MS,
      headers: buildHeaders(context),
    });

    const parsed = schema.safeParse(response.data);
    if (!parsed.success) {
      throw new AIUnavailableError({
        message: "AI response failed validation",
        kind: "invalid_response",
        statusCode: response.status,
        aiOperation,
      });
    }

    logger.info("ai.request.completed", {
      ...buildLogContext(aiOperation, context),
      path,
      statusCode: response.status,
    });

    return parsed.data;
  } catch (error) {
    const aiError = normalizeAIError(error, aiOperation);
    logger.error("ai.request.failed", {
      ...buildLogContext(aiOperation, context),
      path,
      statusCode: aiError.statusCode,
      aiErrorKind: aiError.kind,
      message: aiError.message,
    });
    throw aiError;
  }
}

export async function classify(
  input: ClassifyInput,
  context?: AIRequestContext
): Promise<ClassifyOutput> {
  const parsed = await postToAI(
    "/classify",
    "classify",
    input,
    classifyResponseSchema,
    context
  );

  return {
    risk: parsed.risk,
    reasons: parsed.reasons,
  };
}

export async function ragReply(
  input: RagReplyInput,
  context?: AIRequestContext
): Promise<RagReplyOutput> {
  const parsed = await postToAI<RagReplyOutput>(
    "/rag/reply",
    "ragReply",
    input,
    ragReplyResponseSchema as z.ZodType<RagReplyOutput>,
    context
  );

  return {
    reply: parsed.reply,
    citations: parsed.citations,
  };
}
