import axios from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("axios", () => ({
  default: {
    post: vi.fn(),
    isAxiosError: (error: unknown) =>
      Boolean(
        error &&
          typeof error === "object" &&
          "isAxiosError" in error &&
          (error as { isAxiosError?: boolean }).isAxiosError === true
      ),
  },
}));

import { env } from "../src/env";
import {
  createPatientVoiceSession,
  OpenAIRealtimeUnavailableError,
} from "../src/services/openaiRealtimeService";
import { logger } from "../src/utils/logger";

describe("OpenAI Realtime voice session service", () => {
  const mutableEnv = env as unknown as {
    OPENAI_API_KEY: string;
    AURA_VOICE_AGENT_MODEL: string;
    AURA_VOICE_AGENT_CLIENT_SECRET_TTL_SECONDS: number;
    AURA_VOICE_AGENT_REQUEST_TIMEOUT_MS: number;
  };
  const originalOpenAiApiKey = mutableEnv.OPENAI_API_KEY;
  const originalVoiceAgentModel = mutableEnv.AURA_VOICE_AGENT_MODEL;
  const originalVoiceAgentTtl =
    mutableEnv.AURA_VOICE_AGENT_CLIENT_SECRET_TTL_SECONDS;
  const originalVoiceAgentTimeout =
    mutableEnv.AURA_VOICE_AGENT_REQUEST_TIMEOUT_MS;

  beforeEach(() => {
    mutableEnv.OPENAI_API_KEY = "sk-test-openai-key";
    mutableEnv.AURA_VOICE_AGENT_MODEL = "gpt-realtime-2";
    mutableEnv.AURA_VOICE_AGENT_CLIENT_SECRET_TTL_SECONDS = 60;
    mutableEnv.AURA_VOICE_AGENT_REQUEST_TIMEOUT_MS = 4000;
    vi.mocked(axios.post).mockReset();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    mutableEnv.OPENAI_API_KEY = originalOpenAiApiKey;
    mutableEnv.AURA_VOICE_AGENT_MODEL = originalVoiceAgentModel;
    mutableEnv.AURA_VOICE_AGENT_CLIENT_SECRET_TTL_SECONDS =
      originalVoiceAgentTtl;
    mutableEnv.AURA_VOICE_AGENT_REQUEST_TIMEOUT_MS =
      originalVoiceAgentTimeout;
  });

  it("creates a realtime client secret with no Aura mutation tools", async () => {
    vi.mocked(axios.post).mockResolvedValue({
      status: 200,
      data: {
        value: "ek_test_secret",
        expires_at: 1770000000,
        session: {
          id: "sess_test",
          model: "gpt-realtime-2",
        },
      },
    } as never);

    const result = await createPatientVoiceSession({
      patientId: "patient-raw-id",
      displayName: "Patient One",
      requestId: "req-voice-1",
    });

    expect(result).toEqual({
      clientSecret: {
        value: "ek_test_secret",
        expiresAt: new Date(1770000000 * 1000).toISOString(),
      },
      session: {
        id: "sess_test",
        model: "gpt-realtime-2",
      },
    });

    expect(axios.post).toHaveBeenCalledWith(
      "https://api.openai.com/v1/realtime/client_secrets",
      expect.objectContaining({
        expires_after: {
          anchor: "created_at",
          seconds: 60,
        },
        session: expect.objectContaining({
          type: "realtime",
          model: "gpt-realtime-2",
          output_modalities: ["audio"],
          tool_choice: "none",
          tools: [],
          parallel_tool_calls: false,
          max_output_tokens: 600,
          tracing: null,
        }),
      }),
      expect.objectContaining({
        timeout: 4000,
        headers: expect.objectContaining({
          Authorization: "Bearer sk-test-openai-key",
          "Content-Type": "application/json",
          "OpenAI-Safety-Identifier": expect.stringMatching(
            /^aura_patient_[a-f0-9]{64}$/
          ),
          "x-request-id": "req-voice-1",
        }),
      })
    );

    const requestBody = vi.mocked(axios.post).mock.calls[0][1] as {
      session: {
        audio: unknown;
        instructions: string;
        reasoning: { effort: string };
        tools: unknown[];
      };
    };
    const requestConfig = vi.mocked(axios.post).mock.calls[0][2] as {
      headers: Record<string, string>;
    };
    const serializedBody = JSON.stringify(requestBody);

    expect(requestConfig.headers["OpenAI-Safety-Identifier"]).not.toContain(
      "patient-raw-id"
    );
    expect(requestBody.session.tools).toEqual([]);
    expect(requestBody.session.reasoning).toEqual({ effort: "low" });
    expect(requestBody.session.audio).toMatchObject({
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
        speed: 1,
      },
    });
    expect(requestBody.session.instructions).toContain(
      "You are Aura's controlled patient voice support prototype."
    );
    expect(requestBody.session.instructions).toContain(
      "You cannot submit check-ins"
    );
    expect(serializedBody).not.toContain("submit_checkin");
    expect(serializedBody).not.toContain("send_chat");
    expect(serializedBody).not.toContain("book_appointment");
    expect(serializedBody).not.toContain("create_alert");
    expect(serializedBody).not.toContain("/rag/reply");
  });

  it("rejects malformed OpenAI responses without exposing upstream payloads", async () => {
    vi.mocked(axios.post).mockResolvedValue({
      status: 200,
      data: {
        value: "ek_test_secret",
        session: {
          id: "sess_test",
          model: "gpt-realtime-2",
        },
      },
    } as never);

    await expect(
      createPatientVoiceSession({
        patientId: "p1",
      })
    ).rejects.toMatchObject({
      name: "OpenAIRealtimeUnavailableError",
      kind: "invalid_response",
      statusCode: 200,
    });
  });

  it.each([
    [401, "unauthorized"],
    [403, "unauthorized"],
    [429, "rate_limited"],
    [500, "upstream_http"],
  ] as const)("maps upstream HTTP %s safely", async (statusCode, kind) => {
    const errorLoggerSpy = vi
      .spyOn(logger, "error")
      .mockImplementation(() => undefined);
    const upstreamError = Object.assign(new Error("raw upstream failure"), {
      response: {
        status: statusCode,
        data: {
          secret: "ek_leaked_from_upstream",
          instructions: "raw instructions",
        },
      },
      isAxiosError: true,
    });
    vi.mocked(axios.post).mockRejectedValue(upstreamError as never);

    await expect(
      createPatientVoiceSession({
        patientId: "p-http",
        requestId: "req-http",
      })
    ).rejects.toMatchObject({
      name: "OpenAIRealtimeUnavailableError",
      kind,
      statusCode,
    });

    const serializedLogs = JSON.stringify(errorLoggerSpy.mock.calls);
    expect(serializedLogs).not.toContain("sk-test-openai-key");
    expect(serializedLogs).not.toContain("ek_leaked_from_upstream");
    expect(serializedLogs).not.toContain("raw instructions");
    expect(serializedLogs).not.toContain("aura_patient_");
    expect(serializedLogs).not.toContain("raw upstream failure");
  });

  it("maps network and timeout failures safely", async () => {
    const timeoutError = Object.assign(new Error("timeout of 4000ms exceeded"), {
      code: "ECONNABORTED",
      isAxiosError: true,
    });
    vi.mocked(axios.post).mockRejectedValueOnce(timeoutError as never);

    await expect(
      createPatientVoiceSession({
        patientId: "p-timeout",
      })
    ).rejects.toMatchObject({
      kind: "timeout",
    });

    const networkError = Object.assign(new Error("connect ECONNREFUSED"), {
      code: "ECONNREFUSED",
      request: {},
      isAxiosError: true,
    });
    vi.mocked(axios.post).mockRejectedValueOnce(networkError as never);

    await expect(
      createPatientVoiceSession({
        patientId: "p-network",
      })
    ).rejects.toMatchObject({
      kind: "network",
    });
  });

  it("does not leak secrets in configuration errors", async () => {
    mutableEnv.OPENAI_API_KEY = "";

    const request = createPatientVoiceSession({
      patientId: "p-missing-key",
    });

    await expect(request).rejects.toBeInstanceOf(OpenAIRealtimeUnavailableError);
    await expect(request).rejects.toMatchObject({
      kind: "configuration",
    });
  });
});
