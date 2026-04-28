import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";

import app from "../src/app";
import Alert from "../src/models/Alert";
import AppointmentRequest from "../src/models/AppointmentRequest";
import AppointmentSlot from "../src/models/AppointmentSlot";
import CareEvent from "../src/models/CareEvent";
import ChatMessage from "../src/models/ChatMessage";
import CheckIn from "../src/models/CheckIn";
import ClinicianCoordination from "../src/models/ClinicianCoordination";
import CommunicationEvent from "../src/models/CommunicationEvent";
import CommunicationReview from "../src/models/CommunicationReview";
import ExercisePlan from "../src/models/ExercisePlan";
import ExerciseSession from "../src/models/ExerciseSession";
import HydrationLog from "../src/models/HydrationLog";
import InsightSuggestion from "../src/models/InsightSuggestion";
import Medication from "../src/models/Medication";
import MedicationLog from "../src/models/MedicationLog";
import MedicationSchedule from "../src/models/MedicationSchedule";
import NutritionLog from "../src/models/NutritionLog";
import Patient from "../src/models/Patient";
import PatientRecoverySupportConfig from "../src/models/PatientRecoverySupportConfig";
import PatientThresholdConfig from "../src/models/PatientThresholdConfig";
import PromInstance from "../src/models/PromInstance";
import Task from "../src/models/Task";
import User from "../src/models/User";
import WearableDaily from "../src/models/WearableDaily";
import { env } from "../src/env";
import { PRESENTATION_DEMO_TAG } from "../src/services/presentationSeedService";

const route = "/clinician/dev/presentation/seed";

const mutableEnv = env as unknown as {
  ALLOW_UNAUTH_CLINICIAN_BODY_IDS: boolean;
  AURA_PRESENTATION_SEED_ENABLED: boolean;
};

async function clearCollections() {
  await Promise.all([
    Alert.deleteMany({}),
    AppointmentRequest.deleteMany({}),
    AppointmentSlot.deleteMany({}),
    CareEvent.deleteMany({}),
    ChatMessage.deleteMany({}),
    CheckIn.deleteMany({}),
    ClinicianCoordination.deleteMany({}),
    CommunicationEvent.deleteMany({}),
    CommunicationReview.deleteMany({}),
    ExercisePlan.deleteMany({}),
    ExerciseSession.deleteMany({}),
    HydrationLog.deleteMany({}),
    InsightSuggestion.deleteMany({}),
    Medication.deleteMany({}),
    MedicationLog.deleteMany({}),
    MedicationSchedule.deleteMany({}),
    NutritionLog.deleteMany({}),
    Patient.deleteMany({}),
    PatientRecoverySupportConfig.deleteMany({}),
    PatientThresholdConfig.deleteMany({}),
    PromInstance.deleteMany({}),
    Task.deleteMany({}),
    User.deleteMany({}),
    WearableDaily.deleteMany({}),
  ]);
}

describe("presentation seed clinician dev routes", () => {
  let mongoServer: MongoMemoryServer | null = null;
  const originalAuthBypass = mutableEnv.ALLOW_UNAUTH_CLINICIAN_BODY_IDS;
  const originalSeedEnabled = mutableEnv.AURA_PRESENTATION_SEED_ENABLED;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  afterAll(async () => {
    mutableEnv.ALLOW_UNAUTH_CLINICIAN_BODY_IDS = originalAuthBypass;
    mutableEnv.AURA_PRESENTATION_SEED_ENABLED = originalSeedEnabled;
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  beforeEach(async () => {
    mutableEnv.ALLOW_UNAUTH_CLINICIAN_BODY_IDS = true;
    mutableEnv.AURA_PRESENTATION_SEED_ENABLED = false;
    await clearCollections();
  });

  it("requires clinician auth when auth bypass is disabled", async () => {
    mutableEnv.ALLOW_UNAUTH_CLINICIAN_BODY_IDS = false;
    mutableEnv.AURA_PRESENTATION_SEED_ENABLED = true;

    const response = await request(app).get(route);

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("UNAUTHORIZED");
  });

  it("reports disabled status and rejects seed/reset when the env flag is off", async () => {
    const status = await request(app).get(route);
    expect(status.status).toBe(200);
    expect(status.body.enabled).toBe(false);
    expect(status.body.loaded).toBe(false);
    expect(status.body.counts).toEqual({});

    const seed = await request(app).post(route);
    expect(seed.status).toBe(403);
    expect(seed.body.error).toBe("PRESENTATION_SEED_DISABLED");

    const reset = await request(app).delete(route);
    expect(reset.status).toBe(403);
    expect(reset.body.error).toBe("PRESENTATION_SEED_DISABLED");
  });

  it("loads presentation records with linked dashboard data", async () => {
    mutableEnv.AURA_PRESENTATION_SEED_ENABLED = true;

    const response = await request(app).post(route);

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.loaded).toBe(true);
    expect(response.body.counts.patients).toBe(8);
    expect(response.body.counts.checkIns).toBe(112);
    expect(response.body.counts.appointmentSlots).toBe(10);
    expect(response.body.counts.appointmentRequests).toBe(6);
    expect(response.body.counts.tasks).toBe(8);
    expect(response.body.counts.insightSuggestions).toBe(8);

    const patient = await Patient.findOne({
      patientId: "presentation-emily-chen",
    }).lean();
    expect(patient?.demoTag).toBe(PRESENTATION_DEMO_TAG);

    const alert = await Alert.findOne({ demoTag: PRESENTATION_DEMO_TAG }).lean();
    expect(alert).toBeTruthy();
    const linkedCheckin = await CheckIn.exists({
      _id: alert?.source?.sourceId,
      demoTag: PRESENTATION_DEMO_TAG,
    });
    const linkedChat = await ChatMessage.exists({
      _id: alert?.source?.sourceId,
      demoTag: PRESENTATION_DEMO_TAG,
    });
    expect(Boolean(linkedCheckin || linkedChat)).toBe(true);

    const appointmentRequest = await AppointmentRequest.findOne({
      demoTag: PRESENTATION_DEMO_TAG,
    }).lean();
    const linkedSlot = await AppointmentSlot.exists({
      _id: appointmentRequest?.slotId,
      demoTag: PRESENTATION_DEMO_TAG,
    });
    expect(linkedSlot).toBeTruthy();
  });

  it("is idempotent and keeps counts stable on repeated seed", async () => {
    mutableEnv.AURA_PRESENTATION_SEED_ENABLED = true;

    const first = await request(app).post(route);
    const second = await request(app).post(route);
    const status = await request(app).get(route);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.counts).toEqual(first.body.counts);
    expect(status.body.loaded).toBe(true);
    expect(status.body.counts).toEqual(first.body.counts);
    expect(await Patient.countDocuments({ demoTag: PRESENTATION_DEMO_TAG })).toBe(8);
    expect(await CheckIn.countDocuments({ demoTag: PRESENTATION_DEMO_TAG })).toBe(112);
  });

  it("resets only presentation records and leaves real patient data untouched", async () => {
    mutableEnv.AURA_PRESENTATION_SEED_ENABLED = true;
    await Patient.create({
      patientId: "p1",
      displayName: "Patient One",
      status: "active",
    });
    await CheckIn.create({
      patientId: "p1",
      date: "2026-04-18",
      mood: 4,
      pain: 2,
      adherence: { exercises: 1, medication: true },
      risk: { level: "low", reasons: [] },
    });

    await request(app).post(route);
    const reset = await request(app).delete(route);

    expect(reset.status).toBe(200);
    expect(reset.body.deleted.patients).toBe(8);
    expect(reset.body.counts.patients).toBe(0);
    expect(await Patient.exists({ patientId: "p1", displayName: "Patient One" })).toBeTruthy();
    expect(await CheckIn.exists({ patientId: "p1", date: "2026-04-18" })).toBeTruthy();
    expect(await Patient.countDocuments({ demoTag: PRESENTATION_DEMO_TAG })).toBe(0);
  });

  it("fails safely when untagged data uses reserved presentation patient IDs", async () => {
    mutableEnv.AURA_PRESENTATION_SEED_ENABLED = true;
    await Patient.create({
      patientId: "presentation-emily-chen",
      displayName: "Real Collision",
      status: "active",
    });

    const seed = await request(app).post(route);
    const reset = await request(app).delete(route);

    expect(seed.status).toBe(409);
    expect(seed.body.error).toBe("PRESENTATION_SEED_COLLISION");
    expect(seed.body.collisions).toContain("patients:1");
    expect(await Patient.exists({ patientId: "presentation-emily-chen" })).toBeTruthy();
    expect(reset.status).toBe(200);
    expect(await Patient.exists({ patientId: "presentation-emily-chen" })).toBeTruthy();
  });

  it("reports status before seed, after seed, and after reset", async () => {
    mutableEnv.AURA_PRESENTATION_SEED_ENABLED = true;

    const beforeSeed = await request(app).get(route);
    expect(beforeSeed.body.enabled).toBe(true);
    expect(beforeSeed.body.loaded).toBe(false);
    expect(beforeSeed.body.counts.patients).toBe(0);

    await request(app).post(route);
    const afterSeed = await request(app).get(route);
    expect(afterSeed.body.loaded).toBe(true);
    expect(afterSeed.body.counts.patients).toBe(8);
    expect(afterSeed.body.lastLoadedAt).toEqual(expect.any(String));

    await request(app).delete(route);
    const afterReset = await request(app).get(route);
    expect(afterReset.body.loaded).toBe(false);
    expect(afterReset.body.counts.patients).toBe(0);
    expect(afterReset.body.lastLoadedAt).toBeNull();
  });
});
