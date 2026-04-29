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
import { AIUnavailableError, classify, ragReply } from "../src/services/ai";
import { logger } from "../src/utils/logger";

describe("AI service client", () => {
  const mutableEnv = env as unknown as {
    AI_BASE_URL: string;
    AURA_AI_SERVICE_KEY: string;
    AI_REQUEST_TIMEOUT_MS: number;
  };
  const originalAiBaseUrl = mutableEnv.AI_BASE_URL;
  const originalAiServiceKey = mutableEnv.AURA_AI_SERVICE_KEY;
  const originalAiTimeoutMs = mutableEnv.AI_REQUEST_TIMEOUT_MS;

  beforeEach(() => {
    mutableEnv.AI_BASE_URL = "http://localhost:8001";
    mutableEnv.AURA_AI_SERVICE_KEY = "test-ai-key";
    mutableEnv.AI_REQUEST_TIMEOUT_MS = 4500;
    vi.mocked(axios.post).mockReset();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    mutableEnv.AI_BASE_URL = originalAiBaseUrl;
    mutableEnv.AURA_AI_SERVICE_KEY = originalAiServiceKey;
    mutableEnv.AI_REQUEST_TIMEOUT_MS = originalAiTimeoutMs;
  });

  it("adds x-aura-ai-key and x-request-id to classify and rag requests and uses configured timeout", async () => {
    vi.mocked(axios.post)
      .mockResolvedValueOnce({
        status: 200,
        data: {
          risk: "high",
          reasons: ["PAIN_GE_THRESHOLD"],
          ruleVersion: "v1",
        },
      } as never)
      .mockResolvedValueOnce({
        status: 200,
        data: {
          reply: "Thanks for the update.",
          citations: [],
          grounding: {
            fallbackUsed: false,
            sources: [
              {
                id: "pacing_and_rest",
                title: "Pacing And Rest",
                category: "rehab_support",
                sourceVersion: "static-rehab-v1",
                score: 0.25,
                type: "static_rehab_knowledge",
              },
            ],
          },
        },
      } as never);

    await classify(
      {
        type: "checkin",
        pain: 8,
      },
      {
        requestId: "req-ai-1",
      }
    );
    await ragReply(
      {
        patientId: "p1",
        message: "Pain is worse today.",
      },
      {
        requestId: "req-ai-2",
      }
    );

    expect(axios.post).toHaveBeenNthCalledWith(
      1,
      "http://localhost:8001/classify",
      {
        type: "checkin",
        pain: 8,
      },
      expect.objectContaining({
        timeout: 4500,
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "x-aura-ai-key": "test-ai-key",
          "x-request-id": "req-ai-1",
        }),
      })
    );
    expect(axios.post).toHaveBeenNthCalledWith(
      2,
      "http://localhost:8001/rag/reply",
      {
        patientId: "p1",
        message: "Pain is worse today.",
      },
      expect.objectContaining({
        timeout: 4500,
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "x-aura-ai-key": "test-ai-key",
          "x-request-id": "req-ai-2",
        }),
      })
    );
  });

  it("falls back to local classify rules on timeout and logs the fallback usage", async () => {
    const errorLoggerSpy = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    const warnLoggerSpy = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    const timeoutError = Object.assign(new Error("timeout of 4500ms exceeded"), {
      code: "ECONNABORTED",
      isAxiosError: true,
    });
    vi.mocked(axios.post).mockRejectedValue(timeoutError as never);

    await expect(
      classify(
        {
          type: "chat",
          text: "I can't breathe",
        },
        {
          requestId: "req-ai-timeout",
          flow: "chat",
          patientId: "p1",
        }
      )
    ).resolves.toEqual({
      risk: "high",
      reasons: ["CRISIS_LANGUAGE"],
    });

    expect(errorLoggerSpy).toHaveBeenCalledWith(
      "ai.request.failed",
      expect.objectContaining({
        requestId: "req-ai-timeout",
        flow: "chat",
        patientId: "p1",
        aiOperation: "classify",
        timeoutMs: 4500,
        aiErrorKind: "timeout",
      })
    );
    expect(warnLoggerSpy).toHaveBeenCalledWith(
      "ai.classify.fallback_used",
      expect.objectContaining({
        requestId: "req-ai-timeout",
        flow: "chat",
        patientId: "p1",
        aiOperation: "classify",
        aiErrorKind: "timeout",
        fallbackRisk: "high",
        fallbackReasons: ["CRISIS_LANGUAGE"],
      })
    );
  });

  it("classifies downstream 401 and 403 failures as unauthorized", async () => {
    const unauthorizedError = Object.assign(new Error("unauthorized"), {
      response: { status: 401 },
      isAxiosError: true,
    });
    vi.mocked(axios.post).mockRejectedValueOnce(unauthorizedError as never);

    await expect(
      classify({
        type: "chat",
        text: "I need help",
      })
    ).rejects.toMatchObject({
      name: "AIUnavailableError",
      kind: "unauthorized",
      statusCode: 401,
      aiOperation: "classify",
    });

    const forbiddenError = Object.assign(new Error("forbidden"), {
      response: { status: 403 },
      isAxiosError: true,
    });
    vi.mocked(axios.post).mockRejectedValueOnce(forbiddenError as never);

    await expect(
      ragReply({
        patientId: "p1",
        message: "Pain is worse today.",
      })
    ).rejects.toMatchObject({
      name: "AIUnavailableError",
      kind: "unauthorized",
      statusCode: 403,
      aiOperation: "ragReply",
    });
  });

  it("falls back to local classify rules when classify response validation fails", async () => {
    vi.mocked(axios.post).mockResolvedValue({
      status: 200,
      data: {
        risk: "unexpected",
        reasons: [],
        ruleVersion: "v1",
      },
    } as never);

    await expect(
      classify({
        type: "checkin",
        pain: 8,
      })
    ).resolves.toEqual({
      risk: "high",
      reasons: ["PAIN_GE_THRESHOLD"],
    });
  });

  it("falls back to local classify rules on network and upstream HTTP failures", async () => {
    const networkError = Object.assign(new Error("connect ECONNREFUSED"), {
      code: "ECONNREFUSED",
      request: {},
      isAxiosError: true,
    });
    vi.mocked(axios.post).mockRejectedValueOnce(networkError as never);

    await expect(
      classify({
        type: "checkin",
        pain: 3,
        text: "I feel unsafe",
      })
    ).resolves.toEqual({
      risk: "high",
      reasons: ["CRISIS_LANGUAGE"],
    });

    const upstreamError = Object.assign(new Error("bad gateway"), {
      response: { status: 502 },
      isAxiosError: true,
    });
    vi.mocked(axios.post).mockRejectedValueOnce(upstreamError as never);

    await expect(
      classify({
        type: "checkin",
        pain: 2,
      })
    ).resolves.toEqual({
      risk: "low",
      reasons: [],
    });
  });

  it("rejects malformed rag responses instead of coercing them to a canned reply", async () => {
    vi.mocked(axios.post).mockResolvedValue({
      status: 200,
      data: {
        reply: "   ",
        citations: [],
      },
    } as never);

    const request = ragReply({
      patientId: "p1",
      message: "Pain is worse today.",
    });

    await expect(request).rejects.toBeInstanceOf(AIUnavailableError);
    await expect(request).rejects.toMatchObject({
      kind: "invalid_response",
      statusCode: 200,
      aiOperation: "ragReply",
    });
  });
});
