import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import app from "../src/app";
import CareEvent from "../src/models/CareEvent";
import CheckIn from "../src/models/CheckIn";
import Patient from "../src/models/Patient";
import PatientRecoverySupportConfig from "../src/models/PatientRecoverySupportConfig";
import User from "../src/models/User";
import {
  recordCheckinAdaptationDecision,
} from "../src/services/checkinAdaptationAuditService";
import {
  evaluateCheckinAdaptationDecision,
} from "../src/services/checkinAdaptationService";
import { signAuthToken } from "../src/utils/jwt";
import { signPatientToken } from "../src/utils/patientJwt";

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
    accessCode: `${patientId}-code`,
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
    rationale: "Route test fixture",
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

async function seedStableCheckins(patientId: string): Promise<void> {
  await CheckIn.collection.insertMany(
    [1, 3, 5, 7].map((days, index) => {
      const createdAt = daysAgo(days);
      return {
        patientId,
        date: toDateOnly(createdAt),
        mood: 4,
        pain: index === 2 ? 3 : 2,
        adherence: {
          exercises: 0.8,
          medication: true,
        },
        support: {},
        risk: {
          level: "low",
          reasons: [],
        },
        createdAt,
        updatedAt: createdAt,
      };
    }),
  );
}

async function createClinicianToken(): Promise<string> {
  const clinician = await User.create({
    email: "clinician-1@example.com",
    passwordHash: "unused-password-hash",
    role: "clinician",
    displayName: "Clinician One",
    sessionVersion: 0,
  });

  return signAuthToken({
    id: String(clinician._id),
    role: "clinician",
    email: clinician.email,
    name: clinician.displayName,
    sessionVersion: clinician.sessionVersion ?? 0,
  });
}

describe("recovery support routes", () => {
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
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
    await Promise.all([
      CareEvent.deleteMany({}),
      CheckIn.deleteMany({}),
      Patient.deleteMany({}),
      PatientRecoverySupportConfig.deleteMany({}),
      User.deleteMany({}),
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the richer patient adaptation DTO and dedupes history writes across repeated reads", async () => {
    await seedPatient("patient-1");
    await seedAdaptiveConfig("patient-1");
    await seedStableCheckins("patient-1");

    const patientToken = signPatientToken({
      id: "patient-1",
      displayName: "Patient One",
    });

    const firstResponse = await request(app)
      .get("/patient/checkin/adaptation")
      .set("Authorization", `Bearer ${patientToken}`);

    expect(firstResponse.status).toBe(200);
    expect(firstResponse.body.decision).toMatchObject({
      patientId: "patient-1",
      mode: "shortened",
      decisionSource: "adaptive_shortened",
      clinicianSummary: expect.any(String),
      reasonDetails: expect.any(Array),
      optionalSections: {
        recovery: true,
        support: true,
        dailyContext: true,
      },
    });

    const secondResponse = await request(app)
      .get("/patient/checkin/adaptation")
      .set("Authorization", `Bearer ${patientToken}`);

    expect(secondResponse.status).toBe(200);

    const careEvents = await CareEvent.find({
      patientId: "patient-1",
      type: "CHECKIN_ADAPTATION_APPLIED",
    }).lean();

    expect(careEvents).toHaveLength(1);
    expect(careEvents[0]?.payload).toMatchObject({
      surface: "patient_checkin",
      decisionSource: "adaptive_shortened",
    });
  });

  it("returns clinician recovery support with history and does not create new adaptation events on read", async () => {
    await seedPatient("patient-2");
    await seedAdaptiveConfig("patient-2");
    await seedStableCheckins("patient-2");

    const evaluation = await evaluateCheckinAdaptationDecision({
      patientId: "patient-2",
      now: NOW,
    });
    await recordCheckinAdaptationDecision({
      patientId: "patient-2",
      evaluation,
      surface: "patient_checkin",
    });

    const beforeCount = await CareEvent.countDocuments({
      patientId: "patient-2",
      type: "CHECKIN_ADAPTATION_APPLIED",
    });
    const clinicianToken = await createClinicianToken();

    const response = await request(app)
      .get("/clinician/patients/patient-2/recovery-support")
      .set("Authorization", `Bearer ${clinicianToken}`);

    expect(response.status).toBe(200);
    expect(response.body.adaptationDecision).toMatchObject({
      decisionSource: "adaptive_shortened",
    });
    expect(response.body.adaptationHistory).toHaveLength(1);

    const afterCount = await CareEvent.countDocuments({
      patientId: "patient-2",
      type: "CHECKIN_ADAPTATION_APPLIED",
    });

    expect(afterCount).toBe(beforeCount);
  });

  it("saves temporary full-flow overrides through the clinician recovery support route", async () => {
    await seedPatient("patient-3");
    const clinicianToken = await createClinicianToken();
    const temporaryForceFullUntil = "2026-04-15T08:00:00.000Z";

    const response = await request(app)
      .put("/clinician/patients/patient-3/recovery-support")
      .set("Authorization", `Bearer ${clinicianToken}`)
      .send({
        checkinMode: "adaptive",
        nudgesEnabled: true,
        rationale: "Hold the full flow after a care update.",
        temporaryForceFullUntil,
      });

    expect(response.status).toBe(200);
    expect(response.body.recoverySupport).toMatchObject({
      patientId: "patient-3",
      checkinMode: "adaptive",
      temporaryForceFullUntil,
    });

    const careEvent = await CareEvent.findOne({
      patientId: "patient-3",
      type: "PATIENT_RECOVERY_SUPPORT_UPDATED",
    }).lean();

    expect(careEvent?.payload).toMatchObject({
      rationale: "Hold the full flow after a care update.",
      updatedByName: "Clinician One",
      current: {
        temporaryForceFullUntil,
      },
    });
  });
});
