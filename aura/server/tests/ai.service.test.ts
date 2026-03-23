import axios from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("axios", () => ({
  default: {
    post: vi.fn(),
  },
}));

import { env } from "../src/env";
import { AIUnavailableError, classify, ragReply } from "../src/services/ai";

describe("AI service client", () => {
  const mutableEnv = env as unknown as {
    AI_BASE_URL: string;
    AURA_AI_SERVICE_KEY: string;
  };
  const originalAiBaseUrl = mutableEnv.AI_BASE_URL;
  const originalAiServiceKey = mutableEnv.AURA_AI_SERVICE_KEY;

  beforeEach(() => {
    mutableEnv.AI_BASE_URL = "http://localhost:8001";
    mutableEnv.AURA_AI_SERVICE_KEY = "test-ai-key";
    vi.mocked(axios.post).mockReset();
  });

  afterEach(() => {
    mutableEnv.AI_BASE_URL = originalAiBaseUrl;
    mutableEnv.AURA_AI_SERVICE_KEY = originalAiServiceKey;
  });

  it("adds x-aura-ai-key to classify and rag requests", async () => {
    vi.mocked(axios.post)
      .mockResolvedValueOnce({
        data: {
          risk: "high",
          reasons: ["PAIN_GE_THRESHOLD"],
        },
      } as never)
      .mockResolvedValueOnce({
        data: {
          reply: "Thanks for the update.",
          citations: [],
        },
      } as never);

    await classify({
      type: "checkin",
      pain: 8,
    });
    await ragReply({
      patientId: "p1",
      message: "Pain is worse today.",
    });

    expect(axios.post).toHaveBeenNthCalledWith(
      1,
      "http://localhost:8001/classify",
      {
        type: "checkin",
        pain: 8,
      },
      expect.objectContaining({
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "x-aura-ai-key": "test-ai-key",
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
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "x-aura-ai-key": "test-ai-key",
        }),
      })
    );
  });

  it("maps downstream failures to AIUnavailableError", async () => {
    vi.mocked(axios.post).mockRejectedValue(new Error("socket hang up"));

    await expect(
      classify({
        type: "chat",
        text: "I need help",
      })
    ).rejects.toBeInstanceOf(AIUnavailableError);
  });
});
