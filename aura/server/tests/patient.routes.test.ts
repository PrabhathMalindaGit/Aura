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
import AlertNotificationJob from "../src/models/AlertNotificationJob";
import CareEvent from "../src/models/CareEvent";
import ChatMessage from "../src/models/ChatMessage";
import CheckIn from "../src/models/CheckIn";
import CommunicationReview from "../src/models/CommunicationReview";
import LoginThrottle from "../src/models/LoginThrottle";
import Patient from "../src/models/Patient";
import { AIUnavailableError, classify, ragReply } from "../src/services/ai";
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
      AlertNotificationJob.deleteMany({}),
      CareEvent.deleteMany({}),
      ChatMessage.deleteMany({}),
      CheckIn.deleteMany({}),
      CommunicationReview.deleteMany({}),
      LoginThrottle.deleteMany({}),
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
    expect(Object.keys(response.body).sort()).toEqual(["ok", "patient", "token"]);
    expect(response.body.patient).toMatchObject({
      id: "p1",
      displayName: "Patient One",
      status: "active",
    });
  });

  it("returns 429 with retryAfterSeconds after repeated failed access-code attempts", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await request(app).post("/patient/auth/login").send({
        accessCode: "WRONG-CODE",
      });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe("UNAUTHORIZED");
    }

    const throttledResponse = await request(app).post("/patient/auth/login").send({
      accessCode: "WRONG-CODE",
    });

    expect(throttledResponse.status).toBe(429);
    expect(throttledResponse.body).toMatchObject({
      ok: false,
      error: "TOO_MANY_REQUESTS",
    });
    expect(typeof throttledResponse.body.retryAfterSeconds).toBe("number");
    expect(throttledResponse.body.retryAfterSeconds).toBeGreaterThan(0);
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
    expect(Object.keys(response.body).sort()).toEqual(["ok", "patient"]);
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
          medicationStatus: "taken",
        },
        symptoms: {
          flags: ["stiffness", "fatigue"],
        },
        recovery: {
          difficultyLevel: 3,
          confidenceLevel: 4,
          mobilityLevel: 3,
        },
        support: {
          stressLevel: 2,
          wantsFollowUp: true,
        },
        sleep: {
          hours: 7.5,
          quality: 4,
          disturbances: 1,
        },
        dailySignals: {
          hydrationLevel: 4,
          energyLevel: 3,
        },
        bodyMap: {
          primaryRegion: "lower_back",
          regions: [
            { region: "lower_back", intensity: 6, type: "stiffness" },
            { region: "knee_left", intensity: 5, type: "ache" },
          ],
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
    expect(created?.symptoms).toMatchObject({
      flags: ["stiffness", "fatigue"],
    });
    expect(created?.adherence).toMatchObject({
      exercises: 0.5,
      medication: true,
      medicationStatus: "taken",
    });
    expect(created?.recovery).toMatchObject({
      difficultyLevel: 3,
      confidenceLevel: 4,
      mobilityLevel: 3,
    });
    expect(created?.support).toMatchObject({
      stressLevel: 2,
      wantsFollowUp: true,
    });
    expect(created?.sleep).toMatchObject({
      hours: 7.5,
      quality: 4,
      disturbances: 1,
    });
    expect(created?.dailySignals).toMatchObject({
      hydrationLevel: 4,
      energyLevel: 3,
    });
    expect(created?.bodyMap).toMatchObject({
      primaryRegion: "lower_back",
      regions: [
        { region: "lower_back", intensity: 6, type: "stiffness" },
        { region: "knee_left", intensity: 5, type: "ache" },
      ],
    });
    expect(created?.risk).toMatchObject({
      level: "low",
      reasons: [],
    });
    expect(await Alert.countDocuments({ patientId: "p1" })).toBe(0);
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
    expect(await AlertNotificationJob.countDocuments({ patientId: "p1" })).toBe(1);
    const created = await CheckIn.findOne({ patientId: "p1" }).lean();
    expect(created?.risk).toMatchObject({
      level: "high",
      reasons: expect.arrayContaining(["PAIN_GE_THRESHOLD"]),
    });
  });

  it("returns 502 and does not persist a patient check-in when classify is unavailable", async () => {
    await seedPatient({ patientId: "p1", accessCode: "P1-DEMO" });
    vi.mocked(classify).mockRejectedValue(new AIUnavailableError());

    const token = await loginWithAccessCode("P1-DEMO");

    const response = await request(app)
      .post("/patient/checkins")
      .set("Authorization", `Bearer ${token}`)
      .send({
        date: "2026-02-24",
        mood: 2,
        pain: 8,
      });

    expect(response.status).toBe(502);
    expect(response.body).toEqual({
      ok: false,
      error: "AI_UNAVAILABLE",
    });
    expect(await CheckIn.countDocuments({ patientId: "p1" })).toBe(0);
    expect(await Alert.countDocuments({ patientId: "p1" })).toBe(0);
    expect(await CareEvent.countDocuments({ patientId: "p1" })).toBe(0);

    const history = await request(app)
      .get("/patient/checkins")
      .set("Authorization", `Bearer ${token}`);

    expect(history.status).toBe(200);
    expect(history.body.checkins).toEqual([]);
  });

  it("escalates when urgent help is requested even if classifier returns low risk", async () => {
    await seedPatient({ patientId: "p1", accessCode: "P1-DEMO" });
    vi.mocked(classify).mockResolvedValue({
      risk: "low",
      reasons: [],
    });
    vi.mocked(emitAlertCreated).mockResolvedValue(true);

    const token = await loginWithAccessCode("P1-DEMO");

    const response = await request(app)
      .post("/patient/checkins")
      .set("Authorization", `Bearer ${token}`)
      .send({
        date: "2026-02-25",
        mood: 3,
        pain: 2,
        support: {
          needsUrgentHelp: true,
          feelsSafe: false,
          wantsFollowUp: true,
        },
      });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.risk.level).toBe("high");
    expect(response.body.risk.reasonCodes).toEqual(
      expect.arrayContaining(["URGENT_HELP_REQUESTED", "PATIENT_UNSAFE"])
    );
    expect(typeof response.body.alertId).toBe("string");

    const created = await CheckIn.findOne({ patientId: "p1" }).lean();
    expect(created?.risk).toMatchObject({
      level: "high",
      reasons: expect.arrayContaining(["URGENT_HELP_REQUESTED", "PATIENT_UNSAFE"]),
    });
  });

  it("returns 409 for a duplicate patient check-in on the same date", async () => {
    await seedPatient({ patientId: "p1", accessCode: "P1-DEMO" });
    vi.mocked(classify).mockResolvedValue({
      risk: "low",
      reasons: [],
    });

    const token = await loginWithAccessCode("P1-DEMO");

    const payload = {
      date: "2026-02-26",
      mood: 4,
      pain: 3,
      notes: "Stable today",
    };

    const first = await request(app)
      .post("/patient/checkins")
      .set("Authorization", `Bearer ${token}`)
      .send(payload);

    expect(first.status).toBe(200);
    expect(first.body.ok).toBe(true);

    const duplicate = await request(app)
      .post("/patient/checkins")
      .set("Authorization", `Bearer ${token}`)
      .send(payload);

    expect(duplicate.status).toBe(409);
    expect(duplicate.body.ok).toBe(false);
    expect(duplicate.body.error).toBe("DUPLICATE_CHECKIN");
    expect(vi.mocked(classify)).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid sleep fields on patient check-in", async () => {
    await seedPatient({ patientId: "p1", accessCode: "P1-DEMO" });

    const token = await loginWithAccessCode("P1-DEMO");

    const response = await request(app)
      .post("/patient/checkins")
      .set("Authorization", `Bearer ${token}`)
      .send({
        date: "2026-02-24",
        mood: 3,
        pain: 2,
        sleep: {
          hours: 17,
          quality: 6,
        },
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("VALIDATION_ERROR");
  });

  it("rejects invalid body map region and pain type", async () => {
    await seedPatient({ patientId: "p1", accessCode: "P1-DEMO" });

    const token = await loginWithAccessCode("P1-DEMO");

    const response = await request(app)
      .post("/patient/checkins")
      .set("Authorization", `Bearer ${token}`)
      .send({
        date: "2026-02-24",
        mood: 3,
        pain: 4,
        bodyMap: {
          regions: [{ region: "unknown_area", intensity: 4, type: "invalid_type" }],
        },
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("VALIDATION_ERROR");
  });

  it("rejects duplicate body map regions", async () => {
    await seedPatient({ patientId: "p1", accessCode: "P1-DEMO" });

    const token = await loginWithAccessCode("P1-DEMO");

    const response = await request(app)
      .post("/patient/checkins")
      .set("Authorization", `Bearer ${token}`)
      .send({
        date: "2026-02-24",
        mood: 3,
        pain: 4,
        bodyMap: {
          regions: [
            { region: "lower_back", intensity: 4, type: "ache" },
            { region: "lower_back", intensity: 5, type: "sharp" },
          ],
        },
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("VALIDATION_ERROR");
  });

  it("lists patient check-ins with filters and limit", async () => {
    await seedPatient({ patientId: "p9", accessCode: "P9-DEMO" });

    await CheckIn.insertMany([
      {
        patientId: "p9",
        date: "2026-02-20",
        mood: 4,
        pain: 3,
        symptoms: {
          flags: ["swelling", "fatigue"],
        },
        adherence: {
          exercises: 0.7,
          medication: true,
          medicationStatus: "taken",
        },
        recovery: {
          difficultyLevel: 2,
          confidenceLevel: 4,
          mobilityLevel: 3,
        },
        support: {
          stressLevel: 2,
          wantsExtraSupport: true,
        },
        sleep: {
          hours: 7,
          quality: 4,
          disturbances: 1,
        },
        dailySignals: {
          hydrationLevel: 3,
          energyLevel: 4,
        },
        bodyMap: {
          primaryRegion: "knee_left",
          regions: [{ region: "knee_left", intensity: 5, type: "ache" }],
        },
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
    expect(response.body.checkins[0].sleep).toBeUndefined();

    const withSleep = await request(app)
      .get("/patient/checkins?from=2026-02-20T00:00:00.000Z&to=2026-02-20T23:59:59.999Z&limit=5")
      .set("Authorization", `Bearer ${token}`);

    expect(withSleep.status).toBe(200);
    expect(withSleep.body.checkins[0]).toMatchObject({
      date: "2026-02-20",
      symptoms: {
        flags: ["swelling", "fatigue"],
      },
      adherence: {
        exercises: 0.7,
        medication: true,
        medicationStatus: "taken",
      },
      recovery: {
        difficultyLevel: 2,
        confidenceLevel: 4,
        mobilityLevel: 3,
      },
      support: {
        stressLevel: 2,
        wantsExtraSupport: true,
      },
      sleep: {
        hours: 7,
        quality: 4,
        disturbances: 1,
      },
      dailySignals: {
        hydrationLevel: 3,
        energyLevel: 4,
      },
      bodyMap: {
        primaryRegion: "knee_left",
        regions: [{ region: "knee_left", intensity: 5, type: "ache" }],
      },
    });
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
    const review = await CommunicationReview.findOne({
      patientId: "p1",
      messageId: String(messages[0]?._id),
    }).lean();
    expect(review).toMatchObject({
      needsResponse: false,
      flaggedBySafety: false,
      followUpRequested: false,
    });
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
    const review = await CommunicationReview.findOne({
      patientId: "p1",
      messageId: String(messages[0]?._id),
    }).lean();
    expect(review).toMatchObject({
      needsResponse: true,
      flaggedBySafety: true,
      followUpRequested: true,
    });
    expect(await Alert.countDocuments({ patientId: "p1" })).toBe(1);
    expect(await AlertNotificationJob.countDocuments({ patientId: "p1" })).toBe(1);
  });

  it("returns 502 and does not persist a patient chat message when classify is unavailable", async () => {
    await seedPatient({ patientId: "p1", accessCode: "P1-DEMO" });
    vi.mocked(classify).mockRejectedValue(new AIUnavailableError());

    const token = await loginWithAccessCode("P1-DEMO");

    const response = await request(app)
      .post("/patient/chat/send")
      .set("Authorization", `Bearer ${token}`)
      .send({ message: "I feel unsafe" });

    expect(response.status).toBe(502);
    expect(response.body).toEqual({
      ok: false,
      error: "AI_UNAVAILABLE",
    });
    expect(await ChatMessage.countDocuments({ patientId: "p1" })).toBe(0);
    expect(await CommunicationReview.countDocuments({ patientId: "p1" })).toBe(0);
    expect(await Alert.countDocuments({ patientId: "p1" })).toBe(0);

    const history = await request(app)
      .get("/patient/chat/history")
      .set("Authorization", `Bearer ${token}`);

    expect(history.status).toBe(200);
    expect(history.body.messages).toEqual([]);
  });

  it("returns 502 and does not persist a patient chat message when low-risk reply generation fails", async () => {
    await seedPatient({ patientId: "p1", accessCode: "P1-DEMO" });
    vi.mocked(classify).mockResolvedValue({
      risk: "low",
      reasons: [],
    });
    vi.mocked(ragReply).mockRejectedValue(new AIUnavailableError());

    const token = await loginWithAccessCode("P1-DEMO");

    const response = await request(app)
      .post("/patient/chat/send")
      .set("Authorization", `Bearer ${token}`)
      .send({ message: "How should I pace exercise today?" });

    expect(response.status).toBe(502);
    expect(response.body).toEqual({
      ok: false,
      error: "AI_UNAVAILABLE",
    });
    expect(await ChatMessage.countDocuments({ patientId: "p1" })).toBe(0);
    expect(await CommunicationReview.countDocuments({ patientId: "p1" })).toBe(0);
    expect(await Alert.countDocuments({ patientId: "p1" })).toBe(0);

    const history = await request(app)
      .get("/patient/chat/history")
      .set("Authorization", `Bearer ${token}`);

    expect(history.status).toBe(200);
    expect(history.body.messages).toEqual([]);
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
