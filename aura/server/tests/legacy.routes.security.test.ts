import axios from "axios";
import mongoose from "mongoose";
import request from "supertest";
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

import app from "../src/app";
import { env } from "../src/env";
import Alert from "../src/models/Alert";
import AlertNotificationJob from "../src/models/AlertNotificationJob";
import ChatMessage from "../src/models/ChatMessage";
import CheckIn from "../src/models/CheckIn";
import CommunicationReview from "../src/models/CommunicationReview";
import Patient from "../src/models/Patient";
import { classify, ragReply } from "../src/services/ai";
import { emitAlertCreated } from "../src/services/n8n";
import { signPatientToken } from "../src/utils/patientJwt";

describe("legacy checkin/chat route security", () => {
  let mongoServer: MongoMemoryServer | null = null;
  const mutableEnv = env as unknown as {
    PATIENT_JWT_SECRET: string;
    PATIENT_TOKEN_TTL: string;
    LEGACY_PUBLIC_ENDPOINTS_ENABLED: boolean;
    AURA_INTERNAL_KEY: string;
  };
  const originalPatientSecret = mutableEnv.PATIENT_JWT_SECRET;
  const originalPatientTokenTtl = mutableEnv.PATIENT_TOKEN_TTL;
  const originalLegacyEnabled = mutableEnv.LEGACY_PUBLIC_ENDPOINTS_ENABLED;
  const originalInternalKey = mutableEnv.AURA_INTERNAL_KEY;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  afterAll(async () => {
    mutableEnv.PATIENT_JWT_SECRET = originalPatientSecret;
    mutableEnv.PATIENT_TOKEN_TTL = originalPatientTokenTtl;
    mutableEnv.LEGACY_PUBLIC_ENDPOINTS_ENABLED = originalLegacyEnabled;
    mutableEnv.AURA_INTERNAL_KEY = originalInternalKey;

    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  beforeEach(async () => {
    mutableEnv.PATIENT_JWT_SECRET = "test-patient-jwt-secret";
    mutableEnv.PATIENT_TOKEN_TTL = "30d";
    mutableEnv.LEGACY_PUBLIC_ENDPOINTS_ENABLED = false;
    mutableEnv.AURA_INTERNAL_KEY = "";

    vi.mocked(classify).mockReset();
    vi.mocked(ragReply).mockReset();
    vi.mocked(emitAlertCreated).mockReset();
    vi.mocked(axios.post).mockReset();
    vi.mocked(classify).mockResolvedValue({ risk: "low", reasons: [] });
    vi.mocked(ragReply).mockResolvedValue({ reply: "stub reply" });
    vi.mocked(emitAlertCreated).mockResolvedValue(true);

    await Promise.all([
      Alert.deleteMany({}),
      AlertNotificationJob.deleteMany({}),
      ChatMessage.deleteMany({}),
      CheckIn.deleteMany({}),
      CommunicationReview.deleteMany({}),
      Patient.deleteMany({}),
    ]);

    await Patient.create({
      patientId: "p1",
      displayName: "Patient One",
      accessCode: "P1-DEMO",
      status: "active",
    });
    await Patient.create({
      patientId: "p2",
      displayName: "Patient Two",
      accessCode: "P2-DEMO",
      status: "active",
    });
  });

  it("rejects unauthenticated legacy check-ins by default", async () => {
    const response = await request(app).post("/checkins").send({
      patientId: "p1",
      date: "2026-03-01",
      mood: 3,
      pain: 2,
    });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("UNAUTHORIZED");
  });

  it("rejects unauthenticated legacy chat messages by default", async () => {
    const response = await request(app).post("/chat/send").send({
      patientId: "p1",
      text: "hello",
    });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("UNAUTHORIZED");
  });

  it("allows legacy route access when internal key is provided and feature is enabled", async () => {
    mutableEnv.LEGACY_PUBLIC_ENDPOINTS_ENABLED = true;
    mutableEnv.AURA_INTERNAL_KEY = "legacy-internal-key";

    const response = await request(app)
      .post("/checkins")
      .set("x-aura-internal-key", "legacy-internal-key")
      .send({
        patientId: "p1",
        date: "2026-03-01",
        mood: 4,
        pain: 3,
      });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);

    const created = await CheckIn.findOne({ date: "2026-03-01" }).lean();
    expect(created?.patientId).toBe("p1");
  });

  it("uses patient token identity and ignores spoofed body patientId for legacy check-ins", async () => {
    const token = signPatientToken({ id: "p1", displayName: "Patient One" });

    const response = await request(app)
      .post("/checkins")
      .set("Authorization", `Bearer ${token}`)
      .send({
        patientId: "p2",
        date: "2026-03-02",
        mood: 2,
        pain: 1,
      });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);

    const created = await CheckIn.findOne({ date: "2026-03-02" }).lean();
    expect(created?.patientId).toBe("p1");
  });

  it("uses patient token identity and ignores spoofed body patientId for legacy chat", async () => {
    const token = signPatientToken({ id: "p1", displayName: "Patient One" });

    const response = await request(app)
      .post("/chat/send")
      .set("Authorization", `Bearer ${token}`)
      .send({
        patientId: "p2",
        text: "Need help with routine",
      });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);

    const p1Messages = await ChatMessage.countDocuments({ patientId: "p1" });
    const p2Messages = await ChatMessage.countDocuments({ patientId: "p2" });

    expect(p1Messages).toBeGreaterThan(0);
    expect(p2Messages).toBe(0);
  });

  it("persists a legacy check-in when classify falls back after an upstream timeout", async () => {
    mutableEnv.LEGACY_PUBLIC_ENDPOINTS_ENABLED = true;
    mutableEnv.AURA_INTERNAL_KEY = "legacy-internal-key";
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

    const response = await request(app)
      .post("/checkins")
      .set("x-aura-internal-key", "legacy-internal-key")
      .send({
        patientId: "p1",
        date: "2026-03-03",
        mood: 3,
        pain: 2,
      });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(await CheckIn.countDocuments({ patientId: "p1" })).toBe(1);
    expect(await Alert.countDocuments({ patientId: "p1" })).toBe(0);

    const token = signPatientToken({ id: "p1", displayName: "Patient One" });
    const history = await request(app)
      .get("/patient/checkins")
      .set("Authorization", `Bearer ${token}`);

    expect(history.status).toBe(200);
    expect(history.body.checkins).toHaveLength(1);
  });

  it("persists a legacy check-in when classify output is invalid and fallback applies", async () => {
    mutableEnv.LEGACY_PUBLIC_ENDPOINTS_ENABLED = true;
    mutableEnv.AURA_INTERNAL_KEY = "legacy-internal-key";
    const actualAi = await vi.importActual<typeof import("../src/services/ai")>(
      "../src/services/ai"
    );
    vi.mocked(classify).mockImplementation(actualAi.classify);
    vi.mocked(axios.post).mockResolvedValue({
      status: 200,
      data: {
        risk: "unexpected",
        reasons: [],
        ruleVersion: "v1",
      },
    } as never);

    const response = await request(app)
      .post("/checkins")
      .set("x-aura-internal-key", "legacy-internal-key")
      .send({
        patientId: "p1",
        date: "2026-03-03",
        mood: 3,
        pain: 2,
      });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(await CheckIn.countDocuments({ patientId: "p1" })).toBe(1);
    expect(await Alert.countDocuments({ patientId: "p1" })).toBe(0);
  });

  it("persists a legacy chat message when classify falls back after a network failure", async () => {
    mutableEnv.LEGACY_PUBLIC_ENDPOINTS_ENABLED = true;
    mutableEnv.AURA_INTERNAL_KEY = "legacy-internal-key";
    const actualAi = await vi.importActual<typeof import("../src/services/ai")>(
      "../src/services/ai"
    );
    vi.mocked(classify).mockImplementation(actualAi.classify);
    vi.mocked(axios.post).mockRejectedValue(
      Object.assign(new Error("connect ECONNREFUSED"), {
        code: "ECONNREFUSED",
        request: {},
        isAxiosError: true,
      }) as never
    );

    const response = await request(app)
      .post("/chat/send")
      .set("x-aura-internal-key", "legacy-internal-key")
      .send({
        patientId: "p1",
        text: "hello",
      });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(await ChatMessage.countDocuments({ patientId: "p1" })).toBeGreaterThan(0);
    expect(await CommunicationReview.countDocuments({ patientId: "p1" })).toBe(1);
    expect(await Alert.countDocuments({ patientId: "p1" })).toBe(0);

    const token = signPatientToken({ id: "p1", displayName: "Patient One" });
    const history = await request(app)
      .get("/patient/chat/history")
      .set("Authorization", `Bearer ${token}`);

    expect(history.status).toBe(200);
    expect(history.body.messages).toHaveLength(2);
  });

  it("persists a legacy chat message when classify output is invalid and fallback applies", async () => {
    mutableEnv.LEGACY_PUBLIC_ENDPOINTS_ENABLED = true;
    mutableEnv.AURA_INTERNAL_KEY = "legacy-internal-key";
    const actualAi = await vi.importActual<typeof import("../src/services/ai")>(
      "../src/services/ai"
    );
    vi.mocked(classify).mockImplementation(actualAi.classify);
    vi.mocked(axios.post).mockResolvedValue({
      status: 200,
      data: {
        risk: "unexpected",
        reasons: [],
        ruleVersion: "v1",
      },
    } as never);

    const response = await request(app)
      .post("/chat/send")
      .set("x-aura-internal-key", "legacy-internal-key")
      .send({
        patientId: "p1",
        text: "hello",
      });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(await ChatMessage.countDocuments({ patientId: "p1" })).toBeGreaterThan(0);
    expect(await CommunicationReview.countDocuments({ patientId: "p1" })).toBe(1);
    expect(await Alert.countDocuments({ patientId: "p1" })).toBe(0);
  });
});
