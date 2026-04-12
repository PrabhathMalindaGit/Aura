import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import Alert from "../src/models/Alert";
import CheckIn from "../src/models/CheckIn";
import ExercisePlan from "../src/models/ExercisePlan";
import ExerciseSession from "../src/models/ExerciseSession";
import Patient from "../src/models/Patient";
import PatientRecoverySupportConfig from "../src/models/PatientRecoverySupportConfig";
import { evaluateCheckinAdaptationDecision } from "../src/services/checkinAdaptationService";

const NOW = new Date("2026-04-12T08:00:00.000Z");
const OLD_DATE = new Date("2026-03-20T08:00:00.000Z");

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
}

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

async function seedPatient(patientId: string): Promise<void> {
  await Patient.collection.insertOne({
    patientId,
    displayName: `Patient ${patientId}`,
    status: "active",
    createdAt: OLD_DATE,
    updatedAt: OLD_DATE,
  });
}

async function seedAdaptiveConfig(
  patientId: string,
  overrides: Partial<{
    checkinMode: "standard" | "adaptive" | "force_full";
    temporaryForceFullUntil: Date | null;
    updatedAt: Date;
  }> = {},
): Promise<void> {
  await PatientRecoverySupportConfig.collection.insertOne({
    patientId,
    checkinMode: overrides.checkinMode ?? "adaptive",
    nudgesEnabled: true,
    rationale: "Phase 5E test fixture",
    temporaryForceFullUntil: overrides.temporaryForceFullUntil ?? null,
    version: 2,
    updatedBy: {
      clinicianId: "clinician-1",
      name: "Clinician One",
    },
    createdAt: overrides.updatedAt ?? OLD_DATE,
    updatedAt: overrides.updatedAt ?? OLD_DATE,
  });
}

async function seedCheckins(
  patientId: string,
  rows: Array<{
    daysAgo: number;
    pain: number;
    mood: number;
    adherence: number;
    riskLevel?: "low" | "high";
    support?: {
      needsUrgentHelp?: boolean;
      feelsSafe?: boolean;
    };
  }>,
): Promise<void> {
  await CheckIn.collection.insertMany(
    rows.map((row) => {
      const createdAt = daysAgo(row.daysAgo);
      return {
        patientId,
        date: toDateOnly(createdAt),
        mood: row.mood,
        pain: row.pain,
        adherence: {
          exercises: row.adherence,
          medication: true,
        },
        support: row.support ?? {},
        risk: {
          level: row.riskLevel ?? "low",
          reasons: [],
        },
        createdAt,
        updatedAt: createdAt,
      };
    }),
  );
}

async function seedOpenAlert(patientId: string): Promise<void> {
  await Alert.collection.insertOne({
    patientId,
    risk: "high",
    reason: "High pain",
    source: {
      type: "checkin",
      sourceId: "checkin-1",
    },
    status: "open",
    createdAt: NOW,
    updatedAt: NOW,
  });
}

async function seedResolvedHighRiskAlert(patientId: string): Promise<void> {
  await Alert.collection.insertOne({
    patientId,
    risk: "high",
    reason: "Recent resolved issue",
    source: {
      type: "checkin",
      sourceId: "checkin-1",
    },
    status: "acknowledged",
    acknowledgedAt: daysAgo(2),
    createdAt: daysAgo(3),
    updatedAt: daysAgo(2),
  });
}

async function seedExercisePlan(patientId: string, updatedAt: Date): Promise<void> {
  await ExercisePlan.collection.insertOne({
    patientId,
    title: "Recovery plan",
    timezone: "UTC",
    daysOfWeek: [1, 3, 5],
    items: [
      {
        key: "bridge",
        name: "Bridge",
        instructions: "Hold and return.",
        order: 0,
      },
    ],
    version: 1,
    updatedBy: {
      clinicianId: "clinician-1",
      name: "Clinician One",
    },
    createdAt: updatedAt,
    updatedAt,
  });
}

async function seedExerciseSessions(
  patientId: string,
  sessions: Array<{
    startedAt: Date;
    completed: boolean[];
  }>,
): Promise<void> {
  await ExerciseSession.collection.insertMany(
    sessions.map((session) => ({
      patientId,
      startedAt: session.startedAt,
      endedAt: new Date(session.startedAt.getTime() + 20 * 60 * 1000),
      durationSeconds: 20 * 60,
      status: "completed",
      exercises: session.completed.map((completed, index) => ({
        itemKey: `exercise-${index}`,
        nameSnapshot: `Exercise ${index + 1}`,
        order: index,
        completed,
      })),
      createdAt: session.startedAt,
      updatedAt: session.startedAt,
    })),
  );
}

describe("checkinAdaptationService", () => {
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
      Alert.deleteMany({}),
      CheckIn.deleteMany({}),
      ExercisePlan.deleteMany({}),
      ExerciseSession.deleteMany({}),
      Patient.deleteMany({}),
      PatientRecoverySupportConfig.deleteMany({}),
    ]);
  });

  it("returns persistent force full as a hard standard-flow override", async () => {
    await seedPatient("force-full");
    await seedAdaptiveConfig("force-full", {
      checkinMode: "force_full",
      updatedAt: NOW,
    });

    const evaluation = await evaluateCheckinAdaptationDecision({
      patientId: "force-full",
      now: NOW,
    });

    expect(evaluation.decision.mode).toBe("standard");
    expect(evaluation.decision.decisionSource).toBe("persistent_force_full");
  });

  it("returns temporary full flow when the override is active", async () => {
    await seedPatient("temp-full");
    await seedAdaptiveConfig("temp-full", {
      temporaryForceFullUntil: new Date("2026-04-15T08:00:00.000Z"),
    });

    const evaluation = await evaluateCheckinAdaptationDecision({
      patientId: "temp-full",
      now: NOW,
    });

    expect(evaluation.decision.mode).toBe("standard");
    expect(evaluation.decision.decisionSource).toBe("temporary_force_full");
  });

  it("forces expanded mode when hard safety is current", async () => {
    await seedPatient("hard-safety");
    await seedAdaptiveConfig("hard-safety");
    await seedOpenAlert("hard-safety");

    const evaluation = await evaluateCheckinAdaptationDecision({
      patientId: "hard-safety",
      now: NOW,
    });

    expect(evaluation.decision.mode).toBe("expanded");
    expect(evaluation.decision.decisionSource).toBe("hard_safety_expanded");
    expect(evaluation.decision.reasonCodes).toContain("OPEN_ALERT_PRESENT");
  });

  it("uses standard cooldown after a recent resolved high-risk alert", async () => {
    await seedPatient("resolved-alert");
    await seedAdaptiveConfig("resolved-alert");
    await seedResolvedHighRiskAlert("resolved-alert");

    const evaluation = await evaluateCheckinAdaptationDecision({
      patientId: "resolved-alert",
      now: NOW,
    });

    expect(evaluation.decision.mode).toBe("standard");
    expect(evaluation.decision.decisionSource).toBe("cooldown_standard");
    expect(evaluation.decision.reasonCodes).toContain(
      "RESOLVED_HIGH_RISK_ALERT_COOLDOWN",
    );
  });

  it("uses standard cooldown after a recent plan change", async () => {
    await seedPatient("plan-cooldown");
    await seedAdaptiveConfig("plan-cooldown");
    await seedExercisePlan("plan-cooldown", NOW);

    const evaluation = await evaluateCheckinAdaptationDecision({
      patientId: "plan-cooldown",
      now: NOW,
    });

    expect(evaluation.decision.mode).toBe("standard");
    expect(evaluation.decision.decisionSource).toBe("cooldown_standard");
    expect(evaluation.decision.reasonCodes).toContain(
      "EXERCISE_PLAN_UPDATED_RECENTLY",
    );
  });

  it("shortens only when recent recovery is stable", async () => {
    await seedPatient("shortened");
    await seedAdaptiveConfig("shortened");
    await seedCheckins("shortened", [
      { daysAgo: 1, pain: 2, mood: 4, adherence: 0.8 },
      { daysAgo: 3, pain: 2, mood: 4, adherence: 0.8 },
      { daysAgo: 5, pain: 3, mood: 4, adherence: 0.75 },
      { daysAgo: 7, pain: 2, mood: 4, adherence: 0.85 },
    ]);

    const evaluation = await evaluateCheckinAdaptationDecision({
      patientId: "shortened",
      now: NOW,
    });

    expect(evaluation.decision.mode).toBe("shortened");
    expect(evaluation.decision.decisionSource).toBe("adaptive_shortened");
  });

  it("blocks shortening when plan adherence drops without auto-expanding", async () => {
    await seedPatient("adherence-guardrail");
    await seedAdaptiveConfig("adherence-guardrail");
    await seedCheckins("adherence-guardrail", [
      { daysAgo: 1, pain: 2, mood: 4, adherence: 0.85 },
      { daysAgo: 3, pain: 2, mood: 4, adherence: 0.85 },
      { daysAgo: 5, pain: 3, mood: 4, adherence: 0.8 },
      { daysAgo: 7, pain: 2, mood: 4, adherence: 0.85 },
    ]);
    await seedExerciseSessions("adherence-guardrail", [
      { startedAt: daysAgo(1), completed: [true, false] },
      { startedAt: daysAgo(2), completed: [false, false] },
    ]);

    const evaluation = await evaluateCheckinAdaptationDecision({
      patientId: "adherence-guardrail",
      now: NOW,
    });

    expect(evaluation.decision.mode).toBe("standard");
    expect(evaluation.decision.decisionSource).toBe("adaptive_standard_fallback");
    expect(evaluation.decision.reasonCodes).toContain("EXERCISE_SESSION_COMPLETION_LOW");
  });
});
