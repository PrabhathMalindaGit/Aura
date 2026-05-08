import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiFetchJson } = vi.hoisted(() => ({
  apiFetchJson: vi.fn(),
}));

vi.mock("@/src/api/client", () => ({
  apiFetchJson,
}));

import {
  chatHistory,
  createPatientVoiceSession,
  extractAssistantText,
  extractConfirmedSendMessages,
  sendChat,
} from "@/src/api/patient";

describe("patient chat api normalization", () => {
  beforeEach(() => {
    apiFetchJson.mockReset();
  });

  it("maps server user roles to patient in chat history", async () => {
    apiFetchJson.mockResolvedValue({
      messages: [
        {
          id: "user-1",
          role: "user",
          text: "Hello",
          createdAt: "2026-03-24T10:00:00.000Z",
        },
        {
          id: "assistant-1",
          role: "assistant",
          text: "Hi there",
          createdAt: "2026-03-24T10:01:00.000Z",
        },
      ],
      patientCommunicationSummary: "care_team_reviewing",
    });

    const history = await chatHistory("token-a", 10);

    expect(apiFetchJson).toHaveBeenCalledWith("/patient/chat/history?limit=10", {
      method: "GET",
      token: "token-a",
    });
    expect(history).toEqual({
      items: [
        {
          id: "user-1",
          role: "patient",
          text: "Hello",
          createdAt: "2026-03-24T10:00:00.000Z",
        },
        {
          id: "assistant-1",
          role: "assistant",
          text: "Hi there",
          createdAt: "2026-03-24T10:01:00.000Z",
        },
      ],
      patientCommunicationSummary: "care_team_reviewing",
    });
  });

  it("ignores unapproved patient communication summary labels", async () => {
    apiFetchJson.mockResolvedValue({
      messages: [],
      patientCommunicationSummary: "follow_up_requested",
    });

    const history = await chatHistory("token-a", 10);

    expect(history).toEqual({
      items: [],
      patientCommunicationSummary: undefined,
    });
  });

  it("extracts confirmed send messages from the patient chat route shape", async () => {
    const response = {
      ok: true,
      risk: { level: "low" as const, reasonCodes: [] },
      messages: {
        user: {
          id: "user-2",
          role: "user",
          text: "Can I walk today?",
          createdAt: "2026-03-24T11:00:00.000Z",
        },
        assistant: {
          id: "assistant-2",
          role: "assistant",
          text: "Yes, continue with short walks.",
          createdAt: "2026-03-24T11:00:01.000Z",
        },
      },
    };

    expect(extractConfirmedSendMessages(response)).toEqual({
      user: {
        id: "user-2",
        role: "patient",
        text: "Can I walk today?",
        createdAt: "2026-03-24T11:00:00.000Z",
      },
      assistant: {
        id: "assistant-2",
        role: "assistant",
        text: "Yes, continue with short walks.",
        createdAt: "2026-03-24T11:00:01.000Z",
      },
    });
    expect(extractAssistantText(response)).toBe("Yes, continue with short walks.");
  });

  it("preserves the route payload shape for sendChat responses", async () => {
    apiFetchJson.mockResolvedValue({
      ok: true,
      risk: { level: "high", reasonCodes: ["CRISIS_LANGUAGE"] },
      alertId: "alert-1",
      messages: {
        user: {
          id: "user-3",
          role: "user",
          text: "I feel unsafe",
          createdAt: "2026-03-24T12:00:00.000Z",
        },
      },
    });

    const response = await sendChat("token-b", "I feel unsafe");

    expect(apiFetchJson).toHaveBeenCalledWith("/patient/chat/send", {
      method: "POST",
      token: "token-b",
      body: { message: "I feel unsafe" },
    });
    expect(response).toMatchObject({
      ok: true,
      risk: { level: "high", reasonCodes: ["CRISIS_LANGUAGE"] },
      alertId: "alert-1",
      messages: {
        user: {
          id: "user-3",
          role: "user",
          text: "I feel unsafe",
        },
      },
    });
  });
});

describe("patient voice session api", () => {
  beforeEach(() => {
    apiFetchJson.mockReset();
  });

  it("posts to the voice session broker with no body and bearer token", async () => {
    apiFetchJson.mockResolvedValue({
      ok: true,
      clientSecret: {
        value: "ek_test_secret",
        expiresAt: "2026-05-08T10:01:00.000Z",
      },
      session: {
        id: "sess_mobile",
        model: "gpt-realtime-2",
      },
    });

    await createPatientVoiceSession("token-voice");

    expect(apiFetchJson).toHaveBeenCalledWith("/patient/voice/session", {
      method: "POST",
      token: "token-voice",
    });
    expect(apiFetchJson.mock.calls[0][1]).not.toHaveProperty("body");
  });

  it("normalizes the voice session success shape", async () => {
    apiFetchJson.mockResolvedValue({
      ok: true,
      clientSecret: {
        value: "ek_test_secret",
        expiresAt: "2026-05-08T10:01:00.000Z",
      },
      session: {
        id: "sess_mobile",
        model: "gpt-realtime-2",
      },
    });

    await expect(createPatientVoiceSession("token-voice")).resolves.toEqual({
      ok: true,
      clientSecret: {
        value: "ek_test_secret",
        expiresAt: "2026-05-08T10:01:00.000Z",
      },
      session: {
        id: "sess_mobile",
        model: "gpt-realtime-2",
      },
    });
  });

  it("rejects malformed voice session responses without exposing raw payloads", async () => {
    apiFetchJson.mockResolvedValue({
      ok: true,
      clientSecret: {
        value: "",
        expiresAt: "not-a-date",
      },
      session: {
        id: "",
        model: "gpt-realtime-2",
      },
    });

    await expect(createPatientVoiceSession("token-voice")).rejects.toMatchObject({
      title: "Unexpected response",
      message: "Could not parse voice session response.",
      retryable: false,
    });
  });
});
