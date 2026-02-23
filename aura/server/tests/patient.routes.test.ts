import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";

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
import CareEvent from "../src/models/CareEvent";
import ChatMessage from "../src/models/ChatMessage";
import CheckIn from "../src/models/CheckIn";
import Patient from "../src/models/Patient";
import { classify, ragReply } from "../src/services/ai";
import { emitAlertCreated } from "../src/services/n8n";
import { signPatientToken } from "../src/utils/patientJwt";

describe("patient auth + patient endpoints", () => {
  let mongoServer: MongoMemoryServer | null = null;
  const mutableEnv = env as unknown as {
    PATIENT_JWT_SECRET: string;
    PATIENT_TOKEN_TTL: string;
    DEMO_PATIENT_LOGIN: boolean;
  };
  const originalPatientSecret = mutableEnv.PATIENT_JWT_SECRET;
  const originalPatientTokenTtl = mutableEnv.PATIENT_TOKEN_TTL;
  const originalDemoPatientLogin = mutableEnv.DEMO_PATIENT_LOGIN;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  afterAll(async () => {
    mutableEnv.PATIENT_JWT_SECRET = originalPatientSecret;
    mutableEnv.PATIENT_TOKEN_TTL = originalPatientTokenTtl;
    mutableEnv.DEMO_PATIENT_LOGIN = originalDemoPatientLogin;

    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  beforeEach(async () => {
    mutableEnv.PATIENT_JWT_SECRET = "test-patient-jwt-secret";
    mutableEnv.PATIENT_TOKEN_TTL = "30d";
    mutableEnv.DEMO_PATIENT_LOGIN = true;

    vi.mocked(classify).mockReset();
    vi.mocked(ragReply).mockReset();
    vi.mocked(emitAlertCreated).mockReset();
    vi.mocked(emitAlertCreated).mockResolvedValue(true);

    await Promise.all([
      Alert.deleteMany({}),
      CareEvent.deleteMany({}),
      ChatMessage.deleteMany({}),
      CheckIn.deleteMany({}),
      Patient.deleteMany({}),
    ]);
  });

  async function seedPatient(overrides: Partial<{ patientId: string; displayName: string; accessCode: string }> = {}) {
    const patientId = overrides.patientId ?? "p1";
    return Patient.create({
      patientId,
      displayName: overrides.displayName ?? "Patient One",
      accessCode: overrides.accessCode ?? "P1-DEMO",
      status: "active",
    });
  }

  async function loginWithAccessCode(accessCode: string): Promise<string> {
    const response = await request(app)
      .post("/patient/auth/login")
      .send({ accessCode });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    return response.body.token as string;
  }

  it("logs in with accessCode and returns token + patient profile", async () => {
    await seedPatient({ patientId: "p1", accessCode: "P1-DEMO" });

    const response = await request(app).post("/patient/auth/login").send({
      accessCode: "P1-DEMO",
    });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(typeof response.body.token).toBe("string");
    expect(response.body.patient).toMatchObject({
      id: "p1",
      displayName: "Patient One",
      status: "active",
    });
  });

  it("allows patientId login only when DEMO_PATIENT_LOGIN=true", async () => {
    await seedPatient({ patientId: "p2", accessCode: "P2-DEMO", displayName: "Patient Two" });

    mutableEnv.DEMO_PATIENT_LOGIN = false;
    const forbidden = await request(app).post("/patient/auth/login").send({
      patientId: "p2",
    });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error).toBe("FORBIDDEN");

    mutableEnv.DEMO_PATIENT_LOGIN = true;
    const allowed = await request(app).post("/patient/auth/login").send({
      patientId: "p2",
    });
    expect(allowed.status).toBe(200);
    expect(allowed.body.patient.id).toBe("p2");
  });

  it("returns /patient/me from patient token", async () => {
    await seedPatient({ patientId: "p3", accessCode: "P3-DEMO", displayName: "Patient Three" });

    const token = signPatientToken({ id: "p3", displayName: "Patient Three" });

    const response = await request(app)
      .get("/patient/me")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.patient).toMatchObject({
      id: "p3",
      displayName: "Patient Three",
    });
  });

  it("creates low-risk patient check-in using auth patient id", async () => {
    await seedPatient({ patientId: "p1", accessCode: "P1-DEMO" });
    vi.mocked(classify).mockResolvedValue({
      risk: "low",
      reasons: [],
    });

    const token = await loginWithAccessCode("P1-DEMO");

    const response = await request(app)
      .post("/patient/checkins")
      .set("Authorization", `Bearer ${token}`)
      .send({
        date: "2026-02-23",
        mood: 3,
        pain: 2,
        adherence: {
          exercises: 0.5,
          medication: true,
        },
        notes: "Doing okay",
      });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.risk).toEqual({
      level: "low",
      reasonCodes: [],
    });
    expect(response.body.alertId).toBeUndefined();

    const created = await CheckIn.findOne({ patientId: "p1" }).lean();
    expect(created).toBeTruthy();
    expect(created?.pain).toBe(2);
  });

  it("creates high-risk patient check-in and escalates alert", async () => {
    await seedPatient({ patientId: "p1", accessCode: "P1-DEMO" });
    vi.mocked(classify).mockResolvedValue({
      risk: "high",
      reasons: ["PAIN_GE_THRESHOLD"],
    });
    vi.mocked(emitAlertCreated).mockResolvedValue(true);

    const token = await loginWithAccessCode("P1-DEMO");

    const response = await request(app)
      .post("/patient/checkins")
      .set("Authorization", `Bearer ${token}`)
      .send({
        date: "2026-02-24",
        mood: 2,
        pain: 8,
      });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.risk.level).toBe("high");
    expect(Array.isArray(response.body.risk.reasonCodes)).toBe(true);
    expect(typeof response.body.alertId).toBe("string");

    const alertCount = await Alert.countDocuments({ patientId: "p1" });
    expect(alertCount).toBe(1);
  });

  it("lists patient check-ins with filters and limit", async () => {
    await seedPatient({ patientId: "p9", accessCode: "P9-DEMO" });

    await CheckIn.insertMany([
      {
        patientId: "p9",
        date: "2026-02-20",
        mood: 4,
        pain: 3,
        createdAt: new Date("2026-02-20T08:00:00.000Z"),
        updatedAt: new Date("2026-02-20T08:00:00.000Z"),
      },
      {
        patientId: "p9",
        date: "2026-02-21",
        mood: 3,
        pain: 4,
        createdAt: new Date("2026-02-21T08:00:00.000Z"),
        updatedAt: new Date("2026-02-21T08:00:00.000Z"),
      },
      {
        patientId: "other",
        date: "2026-02-21",
        mood: 1,
        pain: 9,
        createdAt: new Date("2026-02-21T09:00:00.000Z"),
        updatedAt: new Date("2026-02-21T09:00:00.000Z"),
      },
    ]);

    const token = signPatientToken({ id: "p9" });

    const response = await request(app)
      .get("/patient/checkins?from=2026-02-20T00:00:00.000Z&to=2026-02-21T23:59:59.999Z&limit=1")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.checkins).toHaveLength(1);
    expect(response.body.checkins[0].date).toBe("2026-02-21");
  });

  it("returns low-risk patient chat with assistant reply from rag stub", async () => {
    await seedPatient({ patientId: "p1", accessCode: "P1-DEMO" });
    vi.mocked(classify).mockResolvedValue({
      risk: "low",
      reasons: [],
    });
    vi.mocked(ragReply).mockResolvedValue({
      reply: "Stub RAG reply",
      citations: [],
    });

    const token = await loginWithAccessCode("P1-DEMO");

    const response = await request(app)
      .post("/patient/chat/send")
      .set("Authorization", `Bearer ${token}`)
      .send({ message: "How should I pace exercise today?" });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.risk.level).toBe("low");
    expect(response.body.messages.assistant.text).toBe("Stub RAG reply");

    const messages = await ChatMessage.find({ patientId: "p1" }).sort({ createdAt: 1 }).lean();
    expect(messages).toHaveLength(2);
    expect(messages[0]?.role).toBe("user");
    expect(messages[1]?.role).toBe("assistant");
  });

  it("returns high-risk patient chat without assistant reply", async () => {
    await seedPatient({ patientId: "p1", accessCode: "P1-DEMO" });
    vi.mocked(classify).mockResolvedValue({
      risk: "high",
      reasons: ["CRISIS_LANGUAGE"],
    });

    const token = await loginWithAccessCode("P1-DEMO");

    const response = await request(app)
      .post("/patient/chat/send")
      .set("Authorization", `Bearer ${token}`)
      .send({ message: "I feel unsafe" });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.risk.level).toBe("high");
    expect(typeof response.body.alertId).toBe("string");
    expect(response.body.messages).toBeUndefined();

    const messages = await ChatMessage.find({ patientId: "p1" }).lean();
    expect(messages).toHaveLength(1);
  });

  it("returns patient chat history with default limit", async () => {
    await seedPatient({ patientId: "p1", accessCode: "P1-DEMO" });

    await ChatMessage.insertMany([
      {
        patientId: "p1",
        role: "user",
        text: "First",
        createdAt: new Date("2026-02-20T08:00:00.000Z"),
        updatedAt: new Date("2026-02-20T08:00:00.000Z"),
      },
      {
        patientId: "p1",
        role: "assistant",
        text: "Second",
        createdAt: new Date("2026-02-20T09:00:00.000Z"),
        updatedAt: new Date("2026-02-20T09:00:00.000Z"),
      },
    ]);

    const token = signPatientToken({ id: "p1" });

    const response = await request(app)
      .get("/patient/chat/history")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.messages).toHaveLength(2);
    expect(response.body.messages[0].text).toBe("Second");
  });

  it("returns 401 for missing patient token", async () => {
    const response = await request(app).get("/patient/me");
    expect(response.status).toBe(401);
    expect(response.body.error).toBe("UNAUTHORIZED");
  });
});
