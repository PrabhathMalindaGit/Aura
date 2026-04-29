import axios from "axios";
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";

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

vi.mock("../src/services/ai", async () => {
  const actual = await vi.importActual<typeof import("../src/services/ai")>(
    "../src/services/ai"
  );

  return {
    ...actual,
    classify: vi.fn(),
    ragReply: vi.fn(),
  };
});

vi.mock("../src/services/n8n", async () => {
  const actual = await vi.importActual<typeof import("../src/services/n8n")>(
    "../src/services/n8n"
  );

  return {
    ...actual,
    emitAlertCreated: vi.fn(async () => true),
  };
});

import Alert from "../src/models/Alert";
import AlertNotificationJob from "../src/models/AlertNotificationJob";
import CareEvent from "../src/models/CareEvent";
import ChatMessage from "../src/models/ChatMessage";
import CommunicationReview from "../src/models/CommunicationReview";
import { AIUnavailableError, classify, ragReply } from "../src/services/ai";
import * as communicationReviewService from "../src/services/communicationReviewService";
import { HIGH_RISK_REPLY, LOW_RISK_REPLY, processChatMessage } from "../src/services/chatFlow";
import { emitAlertCreated } from "../src/services/n8n";
import { logger } from "../src/utils/logger";

describe("chatFlow integrity", () => {
  let mongoServer: MongoMemoryServer | null = null;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.mocked(classify).mockReset();
    vi.mocked(ragReply).mockReset();
    vi.mocked(emitAlertCreated).mockReset();
    vi.mocked(axios.post).mockReset();
    vi.mocked(emitAlertCreated).mockResolvedValue(true);

    await Promise.all([
      Alert.deleteMany({}),
      AlertNotificationJob.deleteMany({}),
      CareEvent.deleteMany({}),
      ChatMessage.deleteMany({}),
      CommunicationReview.deleteMany({}),
    ]);
  });

  const lowRiskInput = {
    patientId: "p1",
    text: "How should I pace exercise today?",
    lowRiskMode: "rag" as const,
    persistHighRiskAssistantReply: false,
  };

  const highRiskInput = {
    patientId: "p1",
    text: "I feel unsafe",
    lowRiskMode: "rag" as const,
    persistHighRiskAssistantReply: false,
  };

  it("creates no ChatMessage and no CommunicationReview when classify fails without fallback eligibility", async () => {
    vi.mocked(classify).mockRejectedValue(
      new AIUnavailableError({
        kind: "unauthorized",
        aiOperation: "classify",
      })
    );

    await expect(processChatMessage(lowRiskInput)).rejects.toBeInstanceOf(AIUnavailableError);
    expect(await ChatMessage.countDocuments({ patientId: "p1" })).toBe(0);
    expect(await CommunicationReview.countDocuments({ patientId: "p1" })).toBe(0);
  });

  it("falls back to the static low-risk reply when ragReply fails", async () => {
    vi.mocked(classify).mockResolvedValue({
      risk: "low",
      reasons: [],
    });
    vi.mocked(ragReply).mockRejectedValue(new AIUnavailableError());

    const result = await processChatMessage(lowRiskInput);

    expect(result.riskLevel).toBe("low");
    expect(result.assistantReply).toBe(LOW_RISK_REPLY);
    expect(await ChatMessage.countDocuments({ patientId: "p1" })).toBe(2);
    expect(await CommunicationReview.countDocuments({ patientId: "p1" })).toBe(1);
  });

  it("calls ragReply for low-risk chat in rag mode", async () => {
    vi.mocked(classify).mockResolvedValue({
      risk: "low",
      reasons: [],
    });
    vi.mocked(ragReply).mockResolvedValue({
      reply: "Grounded supportive reply",
      citations: ["static-rehab:pacing_and_rest@static-rehab-v1"],
    });

    const result = await processChatMessage(lowRiskInput, {
      requestId: "req-low-risk-rag",
    });

    expect(result.riskLevel).toBe("low");
    expect(result.assistantReply).toBe("Grounded supportive reply");
    expect(ragReply).toHaveBeenCalledTimes(1);
    expect(ragReply).toHaveBeenCalledWith(
      {
        patientId: "p1",
        message: lowRiskInput.text,
      },
      expect.objectContaining({
        requestId: "req-low-risk-rag",
        flow: "chat",
        patientId: "p1",
      })
    );
  });

  it("never calls ragReply for high-risk chat in rag mode", async () => {
    vi.mocked(classify).mockResolvedValue({
      risk: "high",
      reasons: ["CRISIS_LANGUAGE"],
    });

    const result = await processChatMessage(highRiskInput, {
      requestId: "req-high-risk-no-rag",
    });

    expect(result.riskLevel).toBe("high");
    expect(ragReply).not.toHaveBeenCalled();
    expect(await Alert.countDocuments({ patientId: "p1" })).toBe(1);
    expect(await ChatMessage.countDocuments({ patientId: "p1" })).toBe(1);
  });

  it("falls back to the static low-risk reply when ragReply output is invalid", async () => {
    vi.mocked(classify).mockResolvedValue({
      risk: "low",
      reasons: [],
    });
    vi.mocked(ragReply).mockRejectedValue(
      new AIUnavailableError({
        kind: "invalid_response",
        aiOperation: "ragReply",
      })
    );

    const result = await processChatMessage(lowRiskInput);

    expect(result.riskLevel).toBe("low");
    expect(result.assistantReply).toBe(LOW_RISK_REPLY);
    expect(await ChatMessage.countDocuments({ patientId: "p1" })).toBe(2);
    expect(await CommunicationReview.countDocuments({ patientId: "p1" })).toBe(1);
  });

  it("creates high-risk alert state when classify falls back after an upstream failure", async () => {
    const actualAi = await vi.importActual<typeof import("../src/services/ai")>(
      "../src/services/ai"
    );
    vi.mocked(classify).mockImplementation(actualAi.classify);
    vi.mocked(axios.post).mockRejectedValue(
      Object.assign(new Error("bad gateway"), {
        response: { status: 502 },
        isAxiosError: true,
      }) as never
    );

    const result = await processChatMessage(highRiskInput);

    expect(result.riskLevel).toBe("high");
    expect(result.reasonCodes).toEqual(["CRISIS_LANGUAGE"]);
    expect(await ChatMessage.countDocuments({ patientId: "p1" })).toBe(1);
    expect(await CommunicationReview.countDocuments({ patientId: "p1" })).toBe(1);
    expect(await Alert.countDocuments({ patientId: "p1" })).toBe(1);
  });

  it("returns a low-risk assistant reply when classify falls back after a timeout", async () => {
    const actualAi = await vi.importActual<typeof import("../src/services/ai")>(
      "../src/services/ai"
    );
    vi.mocked(classify).mockImplementation(actualAi.classify);
    vi.mocked(axios.post).mockRejectedValue(
      Object.assign(new Error("timeout of 4000ms exceeded"), {
        code: "ECONNABORTED",
        isAxiosError: true,
      }) as never
    );
    vi.mocked(ragReply).mockResolvedValue({
      reply: "Stub RAG reply",
      citations: [],
    });

    const result = await processChatMessage(lowRiskInput);

    expect(result.riskLevel).toBe("low");
    expect(result.assistantReply).toBe("Stub RAG reply");
    expect(await ChatMessage.countDocuments({ patientId: "p1" })).toBe(2);
  });

  it("rolls back the user message and leaves no CommunicationReview when alert creation fails", async () => {
    vi.mocked(classify).mockResolvedValue({
      risk: "high",
      reasons: ["CRISIS_LANGUAGE"],
    });

    vi.spyOn(Alert, "create").mockRejectedValueOnce(new Error("alert write failed"));

    await expect(processChatMessage(highRiskInput)).rejects.toThrow("alert write failed");
    expect(await ChatMessage.countDocuments({ patientId: "p1" })).toBe(0);
    expect(await CommunicationReview.countDocuments({ patientId: "p1" })).toBe(0);
    expect(await Alert.countDocuments({ patientId: "p1" })).toBe(0);
  });

  it("rolls back the user message when low-risk assistant creation fails", async () => {
    vi.mocked(classify).mockResolvedValue({
      risk: "low",
      reasons: [],
    });
    vi.mocked(ragReply).mockResolvedValue({
      reply: "Stub RAG reply",
      citations: [],
    });

    const originalCreate = ChatMessage.create.bind(ChatMessage);
    let createCallCount = 0;
    vi.spyOn(ChatMessage, "create").mockImplementation((async (...args: unknown[]) => {
      createCallCount += 1;
      if (createCallCount === 2) {
        throw new Error("assistant write failed");
      }
      return originalCreate(...(args as Parameters<typeof ChatMessage.create>));
    }) as typeof ChatMessage.create);

    await expect(processChatMessage(lowRiskInput)).rejects.toThrow("assistant write failed");
    expect(await ChatMessage.countDocuments({ patientId: "p1" })).toBe(0);
    expect(await CommunicationReview.countDocuments({ patientId: "p1" })).toBe(0);
  });

  it("logs a high-severity integrity error when rollback fails and preserves the original error", async () => {
    vi.mocked(classify).mockResolvedValue({
      risk: "high",
      reasons: ["CRISIS_LANGUAGE"],
    });

    const primaryError = new Error("alert write failed");
    const loggerSpy = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    vi.spyOn(Alert, "create").mockRejectedValueOnce(primaryError);
    vi.spyOn(ChatMessage, "deleteOne").mockRejectedValueOnce(new Error("rollback write failed"));

    await expect(processChatMessage(highRiskInput)).rejects.toBe(primaryError);
    expect(loggerSpy).toHaveBeenCalledWith(
      "HIGH_SEVERITY_INTEGRITY_ERROR: chat rollback failed",
      expect.objectContaining({
        flow: "chat",
        stage: "alert_create",
        patientId: "p1",
        originalError: "alert write failed",
      })
    );
  });

  it("keeps the main success path when CommunicationReview upsert fails after critical commit", async () => {
    vi.mocked(classify).mockResolvedValue({
      risk: "low",
      reasons: [],
    });
    vi.mocked(ragReply).mockResolvedValue({
      reply: "Stub RAG reply",
      citations: [],
    });

    const loggerSpy = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    vi.spyOn(communicationReviewService, "upsertCommunicationReview").mockRejectedValueOnce(
      new Error("review upsert failed")
    );

    const result = await processChatMessage(lowRiskInput);

    expect(result.riskLevel).toBe("low");
    expect(result.assistantReply).toBe("Stub RAG reply");
    expect(await ChatMessage.countDocuments({ patientId: "p1" })).toBe(2);
    expect(await CommunicationReview.countDocuments({ patientId: "p1" })).toBe(0);
    expect(loggerSpy).toHaveBeenCalledWith(
      "Chat communication review upsert failed",
      expect.objectContaining({
        flow: "chat",
        stage: "post_commit",
        patientId: "p1",
      })
    );
  });

  it("logs ALERT_CREATED CareEvent failure but keeps the high-risk state committed", async () => {
    vi.mocked(classify).mockResolvedValue({
      risk: "high",
      reasons: ["CRISIS_LANGUAGE"],
    });

    const loggerSpy = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    vi.spyOn(CareEvent, "create").mockRejectedValueOnce(new Error("alert event failed"));

    const result = await processChatMessage(highRiskInput);

    expect(result.riskLevel).toBe("high");
    expect(await ChatMessage.countDocuments({ patientId: "p1" })).toBe(1);
    expect(await Alert.countDocuments({ patientId: "p1" })).toBe(1);
    expect(loggerSpy).toHaveBeenCalledWith(
      "Chat alert care event write failed",
      expect.objectContaining({
        flow: "chat",
        patientId: "p1",
        alertId: result.alertId,
      })
    );
  });

  it("returns n8nDelivered=false and keeps the critical state committed when webhook delivery is not confirmed", async () => {
    vi.mocked(classify).mockResolvedValue({
      risk: "high",
      reasons: ["CRISIS_LANGUAGE"],
    });
    vi.mocked(emitAlertCreated).mockResolvedValue(false);

    const result = await processChatMessage({
      ...highRiskInput,
      persistHighRiskAssistantReply: true,
    });

    expect(result.riskLevel).toBe("high");
    expect(result.n8nDelivered).toBe(false);
    expect(result.assistantReply).toBe(HIGH_RISK_REPLY);
    expect(await ChatMessage.countDocuments({ patientId: "p1" })).toBe(2);
    expect(await Alert.countDocuments({ patientId: "p1" })).toBe(1);
  });
});
