import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";

import app from "../src/app";
import Alert from "../src/models/Alert";
import CheckIn from "../src/models/CheckIn";
import ExerciseSession from "../src/models/ExerciseSession";
import HydrationLog from "../src/models/HydrationLog";
import Medication from "../src/models/Medication";
import MedicationLog from "../src/models/MedicationLog";
import MedicationSchedule from "../src/models/MedicationSchedule";
import NutritionLog from "../src/models/NutritionLog";
import Patient from "../src/models/Patient";
import PromInstance from "../src/models/PromInstance";
import SymptomPhoto from "../src/models/SymptomPhoto";
import WearableDaily from "../src/models/WearableDaily";
import { signAuthToken } from "../src/utils/jwt";
import { signPatientToken } from "../src/utils/patientJwt";

describe("weekly report routes", () => {
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
      Patient.deleteMany({}),
      CheckIn.deleteMany({}),
      ExerciseSession.deleteMany({}),
      HydrationLog.deleteMany({}),
      WearableDaily.deleteMany({}),
      SymptomPhoto.deleteMany({}),
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

    await CheckIn.insertMany([
      {
        patientId: "p1",
        date: "2026-02-23",
        mood: 3,
        pain: 4,
        adherence: { exercises: 0.8, medication: true },
        sleep: { hours: 6.5, quality: 3, disturbances: 1 },
        bodyMap: {
          regions: [{ region: "lower_back", intensity: 5, type: "stiffness" }],
        },
        notes: "Light stiffness",
        createdAt: new Date("2026-02-23T10:00:00.000Z"),
        updatedAt: new Date("2026-02-23T10:00:00.000Z"),
      },
      {
        patientId: "p1",
        date: "2026-02-27",
        mood: 2,
        pain: 6,
        adherence: { exercises: 0.6, medication: false },
        sleep: { hours: 5.5, quality: 2, disturbances: 2 },
        bodyMap: {
          regions: [
            { region: "lower_back", intensity: 7, type: "ache" },
            { region: "knee_left", intensity: 5, type: "sharp" },
          ],
        },
        createdAt: new Date("2026-02-27T10:00:00.000Z"),
        updatedAt: new Date("2026-02-27T10:00:00.000Z"),
      },
      {
        patientId: "p1",
        date: "2026-03-01",
        mood: 3,
        pain: 5,
        adherence: { exercises: 0.5, medication: true },
        bodyMap: {
          regions: [{ region: "lower_back", intensity: 6, type: "stiffness" }],
        },
        createdAt: new Date("2026-03-01T10:00:00.000Z"),
        updatedAt: new Date("2026-03-01T10:00:00.000Z"),
      },
      {
        patientId: "p1",
        date: "2026-03-02",
        mood: 4,
        pain: 2,
        adherence: { exercises: 0.9, medication: true },
        createdAt: new Date("2026-03-02T00:00:00.000Z"),
        updatedAt: new Date("2026-03-02T00:00:00.000Z"),
      },
      {
        patientId: "p2",
        date: "2026-02-25",
        mood: 5,
        pain: 1,
        adherence: { exercises: 0.7, medication: true },
        createdAt: new Date("2026-02-25T09:00:00.000Z"),
        updatedAt: new Date("2026-02-25T09:00:00.000Z"),
      },
    ]);

    await ExerciseSession.insertMany([
      {
        patientId: "p1",
        planPatientId: "p1",
        startedAt: new Date("2026-02-24T08:00:00.000Z"),
        endedAt: new Date("2026-02-24T08:15:00.000Z"),
        durationSeconds: 900,
        exercises: [
          {
            itemKey: "quad-set-1",
            nameSnapshot: "Quad set",
            order: 1,
            completed: true,
            difficulty: "easy",
            painDuring: 3,
          },
          {
            itemKey: "heel-slide-1",
            nameSnapshot: "Heel slide",
            order: 2,
            completed: false,
            difficulty: "hard",
            painDuring: 4,
          },
        ],
      },
      {
        patientId: "p1",
        planPatientId: "p1",
        startedAt: new Date("2026-03-02T09:00:00.000Z"),
        endedAt: new Date("2026-03-02T09:10:00.000Z"),
        durationSeconds: 600,
        exercises: [
          {
            itemKey: "ankle-pump-1",
            nameSnapshot: "Ankle pump",
            order: 1,
            completed: true,
            difficulty: "ok",
            painDuring: 1,
          },
        ],
      },
      {
        patientId: "p2",
        planPatientId: "p2",
        startedAt: new Date("2026-02-24T09:00:00.000Z"),
        endedAt: new Date("2026-02-24T09:05:00.000Z"),
        durationSeconds: 300,
        exercises: [
          {
            itemKey: "march-1",
            nameSnapshot: "Seated march",
            order: 1,
            completed: true,
            difficulty: "ok",
            painDuring: 2,
          },
        ],
      },
    ]);

    await HydrationLog.insertMany([
      {
        patientId: "p1",
        date: "2026-02-23",
        amountMl: 1500,
        source: "manual",
        createdAt: new Date("2026-02-23T08:00:00.000Z"),
      },
      {
        patientId: "p1",
        date: "2026-02-23",
        amountMl: 500,
        source: "manual",
        createdAt: new Date("2026-02-23T12:00:00.000Z"),
      },
      {
        patientId: "p1",
        date: "2026-02-25",
        amountMl: 1000,
        source: "manual",
        createdAt: new Date("2026-02-25T10:00:00.000Z"),
      },
      {
        patientId: "p1",
        date: "2026-02-27",
        amountMl: 750,
        source: "manual",
        createdAt: new Date("2026-02-27T10:00:00.000Z"),
      },
      {
        patientId: "p2",
        date: "2026-02-24",
        amountMl: 2300,
        source: "manual",
        createdAt: new Date("2026-02-24T10:00:00.000Z"),
      },
    ]);

    await WearableDaily.insertMany([
      {
        patientId: "p1",
        source: "mock",
        date: "2026-02-23",
        steps: 3200,
        activeMinutes: 24,
        restingHr: 78,
      },
      {
        patientId: "p1",
        source: "mock",
        date: "2026-02-24",
        steps: 2800,
        activeMinutes: 18,
        restingHr: 80,
      },
      {
        patientId: "p1",
        source: "mock",
        date: "2026-02-27",
        steps: 5400,
        activeMinutes: 36,
        restingHr: 72,
      },
      {
        patientId: "p1",
        source: "mock",
        date: "2026-03-01",
        steps: 4100,
        activeMinutes: 28,
        restingHr: 74,
      },
      {
        patientId: "p2",
        source: "mock",
        date: "2026-02-24",
        steps: 9000,
        activeMinutes: 62,
        restingHr: 64,
      },
    ]);

    await SymptomPhoto.insertMany([
      {
        patientId: "p1",
        date: "2026-02-23",
        kind: "swelling",
        note: "Mild swelling in the evening",
        mimeType: "image/jpeg",
        sizeBytes: 1200,
        storageKey: "p1-week-1.jpg",
      },
      {
        patientId: "p1",
        date: "2026-02-24",
        kind: "wound",
        note: "Incision looked clean",
        mimeType: "image/jpeg",
        sizeBytes: 1300,
        storageKey: "p1-week-2.jpg",
      },
      {
        patientId: "p1",
        date: "2026-02-27",
        kind: "rash",
        note: "Small irritation",
        mimeType: "image/png",
        sizeBytes: 1400,
        storageKey: "p1-week-3.png",
      },
      {
        patientId: "p2",
        date: "2026-02-24",
        kind: "other",
        note: "Other example",
        mimeType: "image/webp",
        sizeBytes: 1500,
        storageKey: "p2-week-1.webp",
      },
    ]);

    await NutritionLog.insertMany([
      {
        patientId: "p1",
        date: "2026-02-23",
        protein: "low",
        fruitVegServings: 2,
        antiInflammatoryFocus: false,
        mealRegularity: "irregular",
        source: "manual",
        createdAt: new Date("2026-02-23T08:00:00.000Z"),
      },
      {
        patientId: "p1",
        date: "2026-02-24",
        protein: "low",
        fruitVegServings: 3,
        antiInflammatoryFocus: true,
        mealRegularity: "mostly",
        source: "manual",
        createdAt: new Date("2026-02-24T08:00:00.000Z"),
      },
      {
        patientId: "p1",
        date: "2026-02-25",
        protein: "ok",
        fruitVegServings: 4,
        antiInflammatoryFocus: true,
        mealRegularity: "regular",
        source: "manual",
        createdAt: new Date("2026-02-25T08:00:00.000Z"),
      },
      {
        patientId: "p1",
        date: "2026-02-27",
        protein: "low",
        fruitVegServings: 2,
        antiInflammatoryFocus: true,
        mealRegularity: "irregular",
        source: "manual",
        createdAt: new Date("2026-02-27T08:00:00.000Z"),
      },
      {
        patientId: "p2",
        date: "2026-02-24",
        protein: "high",
        fruitVegServings: 5,
        antiInflammatoryFocus: true,
        mealRegularity: "regular",
        source: "manual",
        createdAt: new Date("2026-02-24T10:00:00.000Z"),
      },
    ]);

    const [p1Medication, p2Medication] = await Medication.insertMany([
      {
        patientId: "p1",
        name: "Ibuprofen",
        type: "medication",
        instructions: "Take as prescribed.",
        active: true,
      },
      {
        patientId: "p2",
        name: "Magnesium",
        type: "supplement",
        active: true,
      },
    ]);

    await MedicationSchedule.insertMany([
      {
        patientId: "p1",
        medicationId: p1Medication._id,
        times: ["08:00", "20:00"],
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      },
    ]);

    await MedicationLog.insertMany([
      {
        patientId: "p1",
        medicationId: p1Medication._id,
        date: "2026-02-23",
        time: "08:00",
        status: "taken",
      },
      {
        patientId: "p1",
        medicationId: p1Medication._id,
        date: "2026-02-24",
        time: "08:00",
        status: "skipped",
      },
      {
        patientId: "p1",
        medicationId: p1Medication._id,
        date: "2026-02-25",
        time: "20:00",
        status: "taken",
      },
      {
        patientId: "p2",
        medicationId: p2Medication._id,
        date: "2026-02-24",
        time: "08:00",
        status: "taken",
      },
    ]);

    const questionSnapshot = [
      {
        id: "q1",
        text: "Pain interference",
        type: "likert",
        min: 0,
        max: 4,
        required: true,
        reverse: false,
      },
    ];

    await PromInstance.insertMany([
      {
        patientId: "p1",
        templateKey: "AURA_RECOVERY_5",
        templateVersion: 1,
        titleSnapshot: "Aura Recovery Check",
        questionsSnapshot: questionSnapshot,
        dueAt: new Date("2026-03-10T09:00:00.000Z"),
        status: "due",
      },
      {
        patientId: "p1",
        templateKey: "AURA_RECOVERY_5",
        templateVersion: 1,
        titleSnapshot: "Aura Recovery Check",
        questionsSnapshot: questionSnapshot,
        dueAt: new Date("2026-02-24T09:00:00.000Z"),
        status: "completed",
        completedAt: new Date("2026-02-25T09:00:00.000Z"),
        answers: [{ questionId: "q1", value: 3 }],
        score: {
          raw: 3,
          normalized: 60,
          bandKey: "amber",
          bandLabel: "Moderate concern",
        },
      },
      {
        patientId: "p1",
        templateKey: "AURA_RECOVERY_5",
        templateVersion: 1,
        titleSnapshot: "Aura Recovery Check",
        questionsSnapshot: questionSnapshot,
        dueAt: new Date("2026-02-10T09:00:00.000Z"),
        status: "completed",
        completedAt: new Date("2026-02-10T09:00:00.000Z"),
        answers: [{ questionId: "q1", value: 1 }],
        score: {
          raw: 1,
          normalized: 20,
          bandKey: "green",
          bandLabel: "Low concern",
        },
      },
      {
        patientId: "p2",
        templateKey: "AURA_RECOVERY_5",
        templateVersion: 1,
        titleSnapshot: "Aura Recovery Check",
        questionsSnapshot: questionSnapshot,
        dueAt: new Date("2026-03-03T09:00:00.000Z"),
        status: "due",
      },
    ]);

    await Alert.insertMany([
      {
        patientId: "p1",
        risk: "high",
        reason: "PAIN_GE_THRESHOLD",
        source: {
          type: "checkin",
          sourceId: "source-1",
        },
        status: "open",
        createdAt: new Date("2026-02-26T11:00:00.000Z"),
        updatedAt: new Date("2026-02-26T11:00:00.000Z"),
      },
      {
        patientId: "p1",
        risk: "high",
        reason: "PAIN_GE_THRESHOLD",
        source: {
          type: "checkin",
          sourceId: "source-2",
        },
        status: "open",
        createdAt: new Date("2026-03-02T11:00:00.000Z"),
        updatedAt: new Date("2026-03-02T11:00:00.000Z"),
      },
      {
        patientId: "p2",
        risk: "high",
        reason: "PAIN_GE_THRESHOLD",
        source: {
          type: "checkin",
          sourceId: "source-3",
        },
        status: "open",
        createdAt: new Date("2026-02-24T11:00:00.000Z"),
        updatedAt: new Date("2026-02-24T11:00:00.000Z"),
      },
    ]);
  });

  function patientToken(patientId: string): string {
    return signPatientToken({ id: patientId, displayName: `Patient ${patientId}` });
  }

  function clinicianToken(): string {
    return signAuthToken({
      id: "clinician-1",
      role: "clinician",
      email: "clinician@example.com",
      name: "Clinician One",
    });
  }

  it("patient can fetch own weekly report", async () => {
    const response = await request(app)
      .get("/patient/reports/weekly?weekStart=2026-02-23&tzOffsetMinutes=0")
      .set("Authorization", `Bearer ${patientToken("p1")}`);

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.patientId).toBe("p1");
    expect(response.body.period.weekStart).toBe("2026-02-23");
    expect(response.body.period.weekEnd).toBe("2026-03-02");
    expect(response.body).toHaveProperty("summary.headline");
    expect(response.body).toHaveProperty("checkins.count");
    expect(response.body).toHaveProperty("exercises.sessionCount");
    expect(response.body).toHaveProperty("proms.dueNowCount");
    expect(response.body).toHaveProperty("safety.alertsCreatedThisWeek");
    expect(response.body).toHaveProperty("photos.uploadedThisWeek");
    expect(response.body).toHaveProperty("wearables.avgSteps");
  });

  it("patient report endpoint remains scoped to req.patient.id", async () => {
    const response = await request(app)
      .get("/patient/reports/weekly?weekStart=2026-02-23&tzOffsetMinutes=0")
      .set("Authorization", `Bearer ${patientToken("p2")}`);

    expect(response.status).toBe(200);
    expect(response.body.patientId).toBe("p2");
    expect(response.body.checkins.count).toBe(1);
    expect(response.body.exercises.sessionCount).toBe(1);
    expect(response.body.safety.alertsCreatedThisWeek).toBe(1);
  });

  it("clinician can fetch report for a patient", async () => {
    const response = await request(app)
      .get("/clinician/patients/p1/reports/weekly?weekStart=2026-02-23&tzOffsetMinutes=0")
      .set("Authorization", `Bearer ${clinicianToken()}`);

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.patientId).toBe("p1");
  });

  it("returns 400 for invalid weekStart", async () => {
    const response = await request(app)
      .get("/patient/reports/weekly?weekStart=2026-02-30&tzOffsetMinutes=0")
      .set("Authorization", `Bearer ${patientToken("p1")}`);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("VALIDATION_ERROR");
  });

  it("aggregates weekly metrics deterministically", async () => {
    const response = await request(app)
      .get("/patient/reports/weekly?weekStart=2026-02-23&tzOffsetMinutes=0")
      .set("Authorization", `Bearer ${patientToken("p1")}`);

    expect(response.status).toBe(200);
    expect(response.body.checkins).toMatchObject({
      count: 3,
      avgPain: 5,
      avgMood: 2.7,
      avgExercisesPct: 63,
      medicationYesPct: 67,
      notesCount: 1,
    });
    expect(Array.isArray(response.body.bodyMap?.topRegions)).toBe(true);
    expect(response.body.bodyMap.topRegions[0]).toMatchObject({
      region: "lower_back",
      label: "Lower back",
      count: 3,
      avgIntensity: 6,
    });
    expect(response.body.sleep).toMatchObject({
      trackedNights: 2,
      avgHours: 6,
      avgQuality: 2.5,
    });
    expect(response.body.hydration).toMatchObject({
      trackedDays: 3,
      avgDailyMl: 1250,
      totalMl: 3750,
      daysMeetingTarget: 1,
      targetMl: 2000,
    });
    expect(response.body.photos).toMatchObject({
      uploadedThisWeek: 3,
      kinds: {
        swelling: 1,
        wound: 1,
        rash: 1,
        other: 0,
      },
    });
    expect(response.body.nutrition).toMatchObject({
      trackedDays: 4,
      avgFruitVegServings: 2.8,
      proteinOkHighDays: 1,
      antiInflammatoryDays: 3,
      regularMealsDays: 2,
    });
    expect(response.body.wearables).toMatchObject({
      trackedDays: 4,
      avgSteps: 3875,
      avgActiveMinutes: 26.5,
      source: "mock",
    });
    expect(response.body.medications).toMatchObject({
      scheduledDoses: 14,
      takenDoses: 2,
      skippedDoses: 1,
      adherencePct: 14,
    });

    expect(response.body.exercises).toMatchObject({
      sessionCount: 1,
      totalDurationMinutes: 15,
      completedExercises: 1,
      totalExercises: 2,
      avgPainDuring: 3.5,
      difficulty: {
        easy: 1,
        ok: 0,
        hard: 1,
      },
    });

    expect(response.body.proms).toMatchObject({
      dueNowCount: 1,
      completedThisWeekCount: 1,
    });
    expect(response.body.proms.latestCompleted).toMatchObject({
      normalized: 60,
      bandLabel: "Moderate concern",
    });

    expect(response.body.safety).toMatchObject({
      alertsCreatedThisWeek: 1,
      highRiskAlertsThisWeek: 1,
    });

    const highlights = response.body.summary?.highlights as string[];
    expect(highlights).toContain("Protein intake looked low on most logged days.");
    expect(highlights).toContain("You focused on anti-inflammatory foods on 3 days.");
    expect(highlights).toContain("Medication adherence was low this week.");
    expect(highlights).toContain("Pain was frequently reported in lower back.");
    expect(highlights).toContain("You shared 3 symptom photos this week.");
  });
});
