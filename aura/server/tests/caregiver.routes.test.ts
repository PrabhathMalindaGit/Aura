import crypto from "node:crypto";

import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";

import app from "../src/app";
import Alert from "../src/models/Alert";
import CaregiverInvite from "../src/models/CaregiverInvite";
import CheckIn from "../src/models/CheckIn";
import HydrationLog from "../src/models/HydrationLog";
import Medication from "../src/models/Medication";
import MedicationLog from "../src/models/MedicationLog";
import MedicationSchedule from "../src/models/MedicationSchedule";
import NutritionLog from "../src/models/NutritionLog";
import Patient from "../src/models/Patient";
import PromInstance from "../src/models/PromInstance";
import { signPatientToken } from "../src/utils/patientJwt";

function patientToken(patientId: string): string {
  return signPatientToken({ id: patientId, displayName: `Patient ${patientId}` });
}

function hashInvite(code: string): string {
  const normalized = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

describe("caregiver routes", () => {
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
    await Promise.all([
      CaregiverInvite.deleteMany({}),
      Patient.deleteMany({}),
      CheckIn.deleteMany({}),
      HydrationLog.deleteMany({}),
      NutritionLog.deleteMany({}),
      Medication.deleteMany({}),
      MedicationSchedule.deleteMany({}),
      MedicationLog.deleteMany({}),
      PromInstance.deleteMany({}),
      Alert.deleteMany({}),
    ]);

    await Patient.insertMany([
      { patientId: "p1", displayName: "Patient One", status: "active" },
      { patientId: "p2", displayName: "Patient Two", status: "active" },
    ]);
  });

  it("patient can create, list, and revoke caregiver invites", async () => {
    const createResponse = await request(app)
      .post("/patient/caregiver/invites")
      .set("Authorization", `Bearer ${patientToken("p1")}`)
      .send({ expiresHours: 12 });

    expect(createResponse.status).toBe(200);
    expect(createResponse.body.ok).toBe(true);
    expect(createResponse.body.code).toMatch(/^CG-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(createResponse.body.inviteId).toBeTypeOf("string");
    const inviteId = createResponse.body.inviteId as string;

    const listResponse = await request(app)
      .get("/patient/caregiver/invites")
      .set("Authorization", `Bearer ${patientToken("p1")}`);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.ok).toBe(true);
    expect(listResponse.body.items).toHaveLength(1);
    expect(listResponse.body.items[0].inviteId).toBe(inviteId);
    expect(listResponse.body.items[0]).not.toHaveProperty("code");

    const revokeResponse = await request(app)
      .post(`/patient/caregiver/invites/${inviteId}/revoke`)
      .set("Authorization", `Bearer ${patientToken("p1")}`);

    expect(revokeResponse.status).toBe(200);
    expect(revokeResponse.body.ok).toBe(true);

    const listAfterRevoke = await request(app)
      .get("/patient/caregiver/invites")
      .set("Authorization", `Bearer ${patientToken("p1")}`);
    expect(listAfterRevoke.status).toBe(200);
    expect(listAfterRevoke.body.items).toHaveLength(0);
  });

  it("caregiver login works with valid code and fails for wrong code", async () => {
    const createResponse = await request(app)
      .post("/patient/caregiver/invites")
      .set("Authorization", `Bearer ${patientToken("p1")}`)
      .send({});
    expect(createResponse.status).toBe(200);

    const loginResponse = await request(app)
      .post("/caregiver/auth/login")
      .send({ code: createResponse.body.code });
    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body.ok).toBe(true);
    expect(loginResponse.body.token).toBeTypeOf("string");
    expect(loginResponse.body.patient.id).toBe("p1");

    const wrongCodeResponse = await request(app)
      .post("/caregiver/auth/login")
      .send({ code: "CG-AAAA-BBBB" });
    expect(wrongCodeResponse.status).toBe(401);
  });

  it("expired code fails login", async () => {
    await CaregiverInvite.create({
      patientId: "p1",
      codeHash: hashInvite("CG-ABCD-EFGH"),
      codeHint: "EFGH",
      expiresAt: new Date(Date.now() - 60_000),
    });

    const response = await request(app)
      .post("/caregiver/auth/login")
      .send({ code: "CG-ABCD-EFGH" });

    expect(response.status).toBe(401);
  });

  it("revoked code fails login", async () => {
    await CaregiverInvite.create({
      patientId: "p1",
      codeHash: hashInvite("CG-WXYZ-1234"),
      codeHint: "1234",
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      revokedAt: new Date(),
    });

    const response = await request(app)
      .post("/caregiver/auth/login")
      .send({ code: "CG-WXYZ-1234" });

    expect(response.status).toBe(401);
  });

  it("caregiver summary is scoped and omits notes/chat/photos fields", async () => {
    await CheckIn.insertMany([
      {
        patientId: "p1",
        date: "2026-03-01",
        mood: 3,
        pain: 4,
        adherence: { exercises: 0.8, medication: true },
        sleep: { hours: 7.0, quality: 4, disturbances: 1 },
        notes: "private note should never leak",
        risk: { level: "low", reasons: [] },
        createdAt: new Date("2026-03-01T10:00:00.000Z"),
      },
      {
        patientId: "p2",
        date: "2026-03-02",
        mood: 1,
        pain: 9,
        adherence: { exercises: 0.2, medication: false },
        notes: "other patient secret note",
        risk: { level: "high", reasons: ["PAIN_HIGH"] },
        createdAt: new Date("2026-03-02T10:00:00.000Z"),
      },
    ]);

    await HydrationLog.insertMany([
      { patientId: "p1", date: "2026-03-01", amountMl: 250 },
      { patientId: "p1", date: "2026-03-01", amountMl: 500 },
    ]);

    await NutritionLog.create({
      patientId: "p1",
      date: "2026-03-01",
      protein: "ok",
      fruitVegServings: 4,
      antiInflammatoryFocus: true,
      mealRegularity: "regular",
      notes: "private nutrition note",
      source: "manual",
      createdAt: new Date("2026-03-01T11:00:00.000Z"),
    });

    const medication = await Medication.create({
      patientId: "p1",
      name: "Ibuprofen",
      type: "medication",
      active: true,
    });
    await MedicationSchedule.create({
      patientId: "p1",
      medicationId: medication._id,
      times: ["08:00", "20:00"],
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    });
    await MedicationLog.create({
      patientId: "p1",
      medicationId: medication._id,
      date: "2026-03-01",
      time: "08:00",
      status: "taken",
    });

    await Alert.insertMany([
      {
        patientId: "p1",
        risk: "high",
        reason: "Safety signal",
        source: { type: "checkin", sourceId: "ci-1" },
        status: "open",
      },
      {
        patientId: "p1",
        risk: "high",
        reason: "Older safety signal",
        source: { type: "checkin", sourceId: "ci-2" },
        status: "resolved",
        createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      },
      {
        patientId: "p2",
        risk: "high",
        reason: "Other patient alert",
        source: { type: "checkin", sourceId: "ci-3" },
        status: "open",
      },
    ]);

    await PromInstance.insertMany([
      {
        patientId: "p1",
        templateKey: "AURA_RECOVERY_5",
        templateVersion: 1,
        titleSnapshot: "Aura Recovery 5",
        questionsSnapshot: [
          {
            id: "q1",
            text: "Pain interference",
            type: "likert",
            min: 0,
            max: 4,
            required: true,
            reverse: false,
          },
        ],
        dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        status: "due",
      },
      {
        patientId: "p1",
        templateKey: "AURA_RECOVERY_5",
        templateVersion: 1,
        titleSnapshot: "Aura Recovery 5",
        questionsSnapshot: [
          {
            id: "q1",
            text: "Pain interference",
            type: "likert",
            min: 0,
            max: 4,
            required: true,
            reverse: false,
          },
        ],
        dueAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        status: "completed",
        completedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        answers: [{ questionId: "q1", value: 2 }],
        score: {
          raw: 2,
          normalized: 50,
          bandKey: "amber",
          bandLabel: "Moderate concern",
        },
      },
    ]);

    const createInvite = await request(app)
      .post("/patient/caregiver/invites")
      .set("Authorization", `Bearer ${patientToken("p1")}`)
      .send({});
    expect(createInvite.status).toBe(200);

    const login = await request(app)
      .post("/caregiver/auth/login")
      .send({ code: createInvite.body.code });
    expect(login.status).toBe(200);
    const caregiverToken = login.body.token as string;

    const response = await request(app)
      .get("/caregiver/summary?patientId=p2")
      .set("Authorization", `Bearer ${caregiverToken}`);

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.patientId).toBe("p1");
    expect(response.body.lastCheckin.date).toBe("2026-03-01");
    expect(response.body.lastCheckin.pain).toBe(4);
    expect(response.body.lastCheckin.mood).toBe(3);
    expect(response.body.lastCheckin.hydrationTodayMl).toBe(750);
    expect(response.body.lastCheckin.nutritionToday.protein).toBe("ok");
    expect(response.body.lastCheckin.medsToday).toEqual({
      taken: 1,
      scheduled: 2,
    });
    expect(response.body.safety.openAlertsCount).toBe(1);
    expect(response.body.proms.dueNowCount).toBe(1);
    expect(response.body.proms.latestCompleted.normalized).toBe(50);

    expect(response.body).not.toHaveProperty("chat");
    expect(response.body).not.toHaveProperty("photos");
    expect(response.body.lastCheckin).not.toHaveProperty("notes");
    expect(response.body.lastCheckin).not.toHaveProperty("bodyMap");
  });

  it("caregiver token cannot access patient endpoints", async () => {
    const createInvite = await request(app)
      .post("/patient/caregiver/invites")
      .set("Authorization", `Bearer ${patientToken("p1")}`)
      .send({});
    expect(createInvite.status).toBe(200);

    const login = await request(app)
      .post("/caregiver/auth/login")
      .send({ code: createInvite.body.code });
    expect(login.status).toBe(200);
    const caregiverToken = login.body.token as string;

    const response = await request(app)
      .get("/patient/me")
      .set("Authorization", `Bearer ${caregiverToken}`);
    expect(response.status).toBe(401);
  });

  it("patient token cannot access caregiver endpoints", async () => {
    const response = await request(app)
      .get("/caregiver/summary")
      .set("Authorization", `Bearer ${patientToken("p1")}`);
    expect(response.status).toBe(401);
  });
});
