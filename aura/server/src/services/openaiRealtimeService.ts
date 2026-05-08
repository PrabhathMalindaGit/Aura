import axios from "axios";
import { z } from "zod";

import { env } from "../env";
import { REQUEST_ID_HEADER } from "../middleware/requestContext";
import { logger } from "../utils/logger";
import { hashBucketKey } from "../utils/sharedSecret";

const OPENAI_REALTIME_CLIENT_SECRETS_URL =
  "https://api.openai.com/v1/realtime/client_secrets";

const PATIENT_VOICE_AGENT_INSTRUCTIONS = [
  "You are Aura's controlled patient voice support prototype.",
  "You can explain, summarize, and propose next actions only.",
  "You cannot submit check-ins, send chat, book appointments, create alerts, call emergency services, change medication, diagnose, or give treatment instructions.",
  "For urgent, unsafe, severe, or emergency-like statements, tell the patient to use Aura's normal Safety screen/check-in flow or contact local emergency services.",
  "Do not claim an alert was created.",
  "For clinical actions, ask the patient to review and use the existing app UI.",
  "All submissions must go through existing backend routes and the Safety Router.",
  "Do not ask for secrets, passwords, access codes, API keys, or unnecessary sensitive information.",
].join("\n");

const realtimeClientSecretResponseSchema = z.object({
  value: z.string().trim().min(1),
  expires_at: z.number().int().positive(),
  session: z.object({
    id: z.string().trim().min(1),
    model: z.string().trim().min(1),
  }),
});

export type OpenAIRealtimeErrorKind =
  | "configuration"
  | "timeout"
  | "network"
  | "unauthorized"
  | "rate_limited"
  | "upstream_http"
  | "invalid_response"
  | "unknown";

export type PatientVoiceSession = {
  clientSecret: {
    value: string;
    expiresAt: string;
  };
  session: {
    id: string;
    model: string;
  };
};

export class OpenAIRealtimeUnavailableError extends Error {
  readonly kind: OpenAIRealtimeErrorKind;
  readonly statusCode?: number;

  constructor(options?: {
    kind?: OpenAIRealtimeErrorKind;
    statusCode?: number;
  }) {
    super("OpenAI Realtime session unavailable");
    this.name = "OpenAIRealtimeUnavailableError";
    this.kind = options?.kind ?? "unknown";
    this.statusCode = options?.statusCode;
  }
}

function buildSafetyIdentifier(patientId: string): string {
  return `aura_patient_${hashBucketKey(patientId.trim())}`;
}

function buildHeaders(input: {
  patientId: string;
  requestId?: string;
}): Record<string, string> {
  return {
    Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    "Content-Type": "application/json",
    "OpenAI-Safety-Identifier": buildSafetyIdentifier(input.patientId),
    ...(input.requestId ? { [REQUEST_ID_HEADER]: input.requestId } : {}),
  };
}

function buildSessionPayload() {
  return {
    expires_after: {
      anchor: "created_at",
      seconds: env.AURA_VOICE_AGENT_CLIENT_SECRET_TTL_SECONDS,
    },
    session: {
      type: "realtime",
      model: env.AURA_VOICE_AGENT_MODEL,
      output_modalities: ["audio"],
      instructions: PATIENT_VOICE_AGENT_INSTRUCTIONS,
      tool_choice: "none",
      tools: [],
      parallel_tool_calls: false,
      max_output_tokens: 600,
      reasoning: {
        effort: "low",
      },
      tracing: null,
      audio: {
        input: {
          noise_reduction: {
            type: "near_field",
          },
          turn_detection: {
            type: "server_vad",
            create_response: true,
          },
        },
        output: {
          voice: "marin",
          speed: 1.0,
        },
      },
    },
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

function normalizeRealtimeError(error: unknown): OpenAIRealtimeUnavailableError {
  if (error instanceof OpenAIRealtimeUnavailableError) {
    return error;
  }

  if (axios.isAxiosError(error)) {
    const statusCode = error.response?.status;
    if (error.code === "ECONNABORTED" || /timeout/i.test(error.message)) {
      return new OpenAIRealtimeUnavailableError({
        kind: "timeout",
        statusCode,
      });
    }

    if (statusCode === 401 || statusCode === 403) {
      return new OpenAIRealtimeUnavailableError({
        kind: "unauthorized",
        statusCode,
      });
    }

    if (statusCode === 429) {
      return new OpenAIRealtimeUnavailableError({
        kind: "rate_limited",
        statusCode,
      });
    }

    if (typeof statusCode === "number") {
      return new OpenAIRealtimeUnavailableError({
        kind: "upstream_http",
        statusCode,
      });
    }

    if (isNetworkErrorCode(error.code) || error.request) {
      return new OpenAIRealtimeUnavailableError({
        kind: "network",
      });
    }
  }

  return new OpenAIRealtimeUnavailableError({
    kind: "unknown",
  });
}

export async function createPatientVoiceSession(input: {
  patientId: string;
  displayName?: string;
  requestId?: string;
}): Promise<PatientVoiceSession> {
  const patientId = input.patientId.trim();
  if (!patientId || !env.OPENAI_API_KEY.trim()) {
    throw new OpenAIRealtimeUnavailableError({
      kind: "configuration",
    });
  }

  logger.info("openai.realtime.session.started", {
    requestId: input.requestId,
    flow: "patient_voice_session",
    patientId,
    model: env.AURA_VOICE_AGENT_MODEL,
    timeoutMs: env.AURA_VOICE_AGENT_REQUEST_TIMEOUT_MS,
  });

  try {
    const response = await axios.post(
      OPENAI_REALTIME_CLIENT_SECRETS_URL,
      buildSessionPayload(),
      {
        timeout: env.AURA_VOICE_AGENT_REQUEST_TIMEOUT_MS,
        headers: buildHeaders({
          patientId,
          requestId: input.requestId,
        }),
      }
    );

    const parsed = realtimeClientSecretResponseSchema.safeParse(response.data);
    if (!parsed.success) {
      throw new OpenAIRealtimeUnavailableError({
        kind: "invalid_response",
        statusCode: response.status,
      });
    }

    logger.info("openai.realtime.session.completed", {
      requestId: input.requestId,
      flow: "patient_voice_session",
      patientId,
      model: parsed.data.session.model,
      statusCode: response.status,
    });

    return {
      clientSecret: {
        value: parsed.data.value,
        expiresAt: new Date(parsed.data.expires_at * 1000).toISOString(),
      },
      session: {
        id: parsed.data.session.id,
        model: parsed.data.session.model,
      },
    };
  } catch (error) {
    const realtimeError = normalizeRealtimeError(error);
    logger.error("openai.realtime.session.failed", {
      requestId: input.requestId,
      flow: "patient_voice_session",
      patientId,
      model: env.AURA_VOICE_AGENT_MODEL,
      statusCode: realtimeError.statusCode,
      errorKind: realtimeError.kind,
    });
    throw realtimeError;
  }
}
