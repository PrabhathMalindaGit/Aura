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
import { signAuthToken } from "../src/utils/jwt";

const route = "/clinician/dev/presentation/seed";

const mutableEnv = env as unknown as {
  ALLOW_UNAUTH_CLINICIAN_BODY_IDS: boolean;
  AURA_PRESENTATION_SEED_ENABLED: boolean;
};

function dateAt(date: string, hour: number): Date {
  return new Date(`${date}T${String(hour).padStart(2, "0")}:00:00.000Z`);
}

function dateKeyFromOffset(offsetDays: number): string {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function isoBoundaryFromOffset(offsetDays: number, endOfDay = false): string {
  const date = new Date();
  date.setUTCHours(
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0
  );
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString();
}

function buildLegacyPresentationAppointmentSlot(
  index: number,
  overrides: Record<string, unknown> = {}
) {
  const slots = [
    ["2026-04-27", 14],
    ["2026-04-28", 15],
    ["2026-04-29", 13],
    ["2026-04-29", 16],
    ["2026-04-30", 14],
    ["2026-05-01", 10],
    ["2026-05-01", 15],
    ["2026-05-02", 9],
    ["2026-05-02", 11],
    ["2026-05-03", 10],
  ].map(([date, hour], slotIndex) => ({
    clinicianId: "presentation-clinician",
    startsAt: dateAt(String(date), Number(hour)),
    endsAt: dateAt(String(date), Number(hour) + 1),
    modality: "video",
    status: slotIndex % 3 === 0 ? "closed" : "available",
    meetingLink: `https://meet.example.com/presentation-${slotIndex + 1}`,
  }));

  return {
    ...slots[index],
    ...overrides,
  };
}

function buildLegacyPresentationCommunicationEvent(
  patientIndex: number,
  eventType: "patient_message_sent" | "follow_up_requested" = "patient_message_sent",
  overrides: Record<string, unknown> = {}
) {
  const patients = [
    "presentation-emily-chen",
    "presentation-robert-jackson",
    "presentation-maria-gonzalez",
    "presentation-jacob-patel",
    "presentation-sarah-kim",
    "presentation-michael-brown",
    "presentation-emily-lee",
    "presentation-david-lee",
  ];
  const patientId = patients[patientIndex];
  const messageId = `${String(patientIndex + 1).padStart(24, "0")}`;
  const reviewId = `${String(patientIndex + 101).padStart(24, "0")}`;

  return {
    patientId,
    threadKey: `presentation-thread-${patientId}`,
    channel: "patient_chat",
    messageId: `presentation-message-${messageId}`,
    eventType,
    actorType: eventType === "patient_message_sent" ? "patient" : "automation",
    actorId: eventType === "patient_message_sent" ? patientId : "presentation-seed",
    sourceSurface: "presentation-seed",
    sourceRecordId: reviewId,
    createdAt:
      eventType === "patient_message_sent"
        ? dateAt("2026-04-18", 9 + patientIndex)
        : dateAt("2026-04-18", 18),
    ...overrides,
  };
}

function clinicianToken(user: { _id: unknown; email: string; displayName?: string }): string {
  return signAuthToken({
    id: String(user._id),
    role: "clinician",
    email: user.email,
    name: user.displayName,
  });
}

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

  it("loads seeded appointment data for the requesting clinician through normal appointment APIs", async () => {
    mutableEnv.ALLOW_UNAUTH_CLINICIAN_BODY_IDS = false;
    mutableEnv.AURA_PRESENTATION_SEED_ENABLED = true;
    const clinician = await User.create({
      email: "presentation-clinician@example.com",
      passwordHash: "test-password-hash",
      role: "clinician",
      displayName: "Presentation Tester",
    });
    const staleLegacySlots = await AppointmentSlot.insertMany([
      buildLegacyPresentationAppointmentSlot(0),
      buildLegacyPresentationAppointmentSlot(1),
    ]);
    const token = clinicianToken(clinician);
    const auth = { Authorization: `Bearer ${token}` };

    const seed = await request(app).post(route).set(auth);
    expect(seed.status).toBe(200);
    expect(
      await AppointmentSlot.countDocuments({
        _id: { $in: staleLegacySlots.map((slot) => slot._id) },
      })
    ).toBe(0);

    const slots = await request(app)
      .get(
        `/clinician/appointments/slots?status=available&from=${encodeURIComponent(
          isoBoundaryFromOffset(0)
        )}&to=${encodeURIComponent(isoBoundaryFromOffset(6, true))}&limit=100`
      )
      .set(auth);
    expect(slots.status).toBe(200);
    expect(slots.body.items.length).toBeGreaterThan(0);
    expect(
      slots.body.items.every(
        (item: { clinicianId: string }) => item.clinicianId === String(clinician._id)
      )
    ).toBe(true);

    const requests = await request(app)
      .get(
        `/clinician/appointments/requests?status=pending&from=${encodeURIComponent(
          isoBoundaryFromOffset(0)
        )}&to=${encodeURIComponent(isoBoundaryFromOffset(6, true))}&limit=100`
      )
      .set(auth);
    expect(requests.status).toBe(200);
    expect(requests.body.items.length).toBeGreaterThan(0);
    expect(requests.body.items[0].patientId).toMatch(/^presentation-/);

    const review = await request(app)
      .patch(`/clinician/appointments/requests/${requests.body.items[0].requestId as string}`)
      .set(auth)
      .send({ status: "rejected" });
    expect(review.status).toBe(200);
    expect(review.body.item.reviewedBy).toEqual({
      clinicianId: String(clinician._id),
      name: "Presentation Tester",
    });

    const presentationPatient = await Patient.findOne({
      patientId: "presentation-emily-chen",
    }).lean();
    expect(presentationPatient?.clinicianId).toBe(String(clinician._id));
    expect(presentationPatient?.rehab?.updatedBy?.clinicianId).toBe(String(clinician._id));
    expect(presentationPatient?.rehab?.updatedBy?.name).toBe("Presentation Tester");

    const assignedTask = await Task.findOne({
      demoTag: PRESENTATION_DEMO_TAG,
      patientId: "presentation-emily-chen",
    }).lean();
    expect(assignedTask?.assignedTo).toBe(String(clinician._id));

    const assignedAlert = await Alert.findOne({
      demoTag: PRESENTATION_DEMO_TAG,
      assignedTo: String(clinician._id),
    }).lean();
    expect(assignedAlert?.assignedToName).toBe("Presentation Tester");
  });

  it("seeds health and coordination records inside current rolling dashboard windows", async () => {
    mutableEnv.AURA_PRESENTATION_SEED_ENABLED = true;

    const seed = await request(app).post(route);

    expect(seed.status).toBe(200);

    const todayKey = dateKeyFromOffset(0);
    const sevenDaysAgoKey = dateKeyFromOffset(-6);
    const tomorrowKey = dateKeyFromOffset(1);

    expect(
      await CheckIn.countDocuments({
        demoTag: PRESENTATION_DEMO_TAG,
        date: { $gte: sevenDaysAgoKey, $lte: todayKey },
      })
    ).toBeGreaterThan(0);
    expect(
      await HydrationLog.countDocuments({
        demoTag: PRESENTATION_DEMO_TAG,
        date: { $gte: sevenDaysAgoKey, $lte: todayKey },
      })
    ).toBeGreaterThan(0);
    expect(
      await NutritionLog.countDocuments({
        demoTag: PRESENTATION_DEMO_TAG,
        date: { $gte: sevenDaysAgoKey, $lte: todayKey },
      })
    ).toBeGreaterThan(0);
    expect(
      await MedicationLog.countDocuments({
        demoTag: PRESENTATION_DEMO_TAG,
        date: { $gte: sevenDaysAgoKey, $lte: todayKey },
      })
    ).toBeGreaterThan(0);
    expect(
      await WearableDaily.countDocuments({
        demoTag: PRESENTATION_DEMO_TAG,
        date: { $gte: sevenDaysAgoKey, $lte: todayKey },
      })
    ).toBeGreaterThan(0);

    const dueProm = await PromInstance.findOne({
      demoTag: PRESENTATION_DEMO_TAG,
      status: "due",
    }).lean();
    expect(dueProm?.dueAt?.toISOString().slice(0, 10)).toBe(tomorrowKey);

    const insight = await InsightSuggestion.findOne({
      demoTag: PRESENTATION_DEMO_TAG,
      patientId: "presentation-emily-chen",
    }).lean();
    expect(insight?.windowEnd.toISOString().slice(0, 10)).toBe(todayKey);
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

  it("recovers from untagged legacy presentation patient records during load", async () => {
    mutableEnv.AURA_PRESENTATION_SEED_ENABLED = true;
    await Patient.create({
      patientId: "presentation-emily-chen",
      displayName: "Emily Chen",
      accessCode: "presentation-1",
      status: "active",
    });
    await CheckIn.create({
      patientId: "presentation-emily-chen",
      date: "2026-04-18",
      mood: 4,
      pain: 3,
      adherence: { exercises: 0.9, medication: true },
      risk: { level: "low", reasons: [] },
    });

    const seed = await request(app).post(route);

    expect(seed.status).toBe(200);
    expect(seed.body.deleted.patients).toBe(1);
    expect(seed.body.deleted.checkIns).toBe(1);
    expect(seed.body.counts.patients).toBe(8);
    expect(await Patient.countDocuments({ patientId: "presentation-emily-chen" })).toBe(1);
    expect(await Patient.countDocuments({ demoTag: PRESENTATION_DEMO_TAG })).toBe(8);
    expect(await CheckIn.countDocuments({ demoTag: PRESENTATION_DEMO_TAG })).toBe(112);
  });

  it("reset removes untagged legacy presentation appointments without touching normal appointments", async () => {
    mutableEnv.AURA_PRESENTATION_SEED_ENABLED = true;
    const legacySlot = await AppointmentSlot.create(buildLegacyPresentationAppointmentSlot(0));
    const legacyRequest = await AppointmentRequest.create({
      slotId: legacySlot._id,
      patientId: "presentation-emily-chen",
      status: "pending",
      note: "Presentation request for scheduling review.",
    });
    const realSlot = await AppointmentSlot.create({
      clinicianId: "real-clinician",
      startsAt: dateAt("2026-04-27", 14),
      endsAt: dateAt("2026-04-27", 15),
      modality: "video",
      status: "available",
      meetingLink: "https://example.com/meet/real-slot",
    });
    const realRequest = await AppointmentRequest.create({
      slotId: realSlot._id,
      patientId: "p1",
      status: "pending",
      note: "Normal request",
    });

    const reset = await request(app).delete(route);

    expect(reset.status).toBe(200);
    expect(reset.body.deleted.appointmentSlots).toBe(1);
    expect(reset.body.deleted.appointmentRequests).toBe(1);
    expect(await AppointmentSlot.exists({ _id: legacySlot._id })).toBeFalsy();
    expect(await AppointmentRequest.exists({ _id: legacyRequest._id })).toBeFalsy();
    expect(await AppointmentSlot.exists({ _id: realSlot._id })).toBeTruthy();
    expect(await AppointmentRequest.exists({ _id: realRequest._id })).toBeTruthy();
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
    const realSlot = await AppointmentSlot.create({
      clinicianId: "presentation-clinician",
      startsAt: dateAt("2026-04-20", 14),
      endsAt: dateAt("2026-04-20", 15),
      modality: "video",
      status: "available",
      meetingLink: "https://example.com/meet/real-slot",
    });
    const realCommunicationEvent = await CommunicationEvent.create({
      patientId: "p1",
      threadKey: "thread-p1-real",
      channel: "patient_chat",
      eventType: "thread_opened",
      actorType: "clinician",
      actorId: "real-clinician",
      sourceSurface: "clinician-inbox",
      sourceRecordId: "real-thread-p1",
      createdAt: dateAt("2026-04-18", 15),
    });

    const seed = await request(app).post(route);
    const reset = await request(app).delete(route);

    expect(seed.status).toBe(200);
    expect(reset.status).toBe(200);
    expect(reset.body.deleted.patients).toBe(8);
    expect(reset.body.counts.patients).toBe(0);
    expect(await Patient.exists({ patientId: "p1", displayName: "Patient One" })).toBeTruthy();
    expect(await CheckIn.exists({ patientId: "p1", date: "2026-04-18" })).toBeTruthy();
    expect(await AppointmentSlot.exists({ _id: realSlot._id })).toBeTruthy();
    expect(await CommunicationEvent.exists({ _id: realCommunicationEvent._id })).toBeTruthy();
    expect(await Patient.countDocuments({ demoTag: PRESENTATION_DEMO_TAG })).toBe(0);
  });

  it("safely retags legacy untagged presentation communication events before reseeding", async () => {
    mutableEnv.AURA_PRESENTATION_SEED_ENABLED = true;
    const legacyEvents = await CommunicationEvent.insertMany([
      buildLegacyPresentationCommunicationEvent(0, "patient_message_sent"),
      buildLegacyPresentationCommunicationEvent(1, "patient_message_sent"),
      buildLegacyPresentationCommunicationEvent(2, "follow_up_requested"),
      {
        patientId: "presentation-maria-gonzalez",
        threadKey: "patient_chat:presentation-maria-gonzalez",
        channel: "patient_chat",
        eventType: "thread_opened",
        actorType: "clinician",
        actorId: "presentation-clinician",
        sourceSurface: "communication_inbox",
        createdAt: dateAt("2026-04-28", 9),
      },
    ]);

    const seed = await request(app).post(route);
    const reset = await request(app).delete(route);

    expect(seed.status).toBe(200);
    expect(seed.body.deleted.communicationEvents).toBe(4);
    expect(seed.body.counts.communicationEvents).toBe(16);
    expect(
      await CommunicationEvent.countDocuments({
        _id: { $in: legacyEvents.map((event) => event._id) },
      })
    ).toBe(0);
    expect(reset.status).toBe(200);
    expect(reset.body.deleted.communicationEvents).toBe(16);
    expect(await CommunicationEvent.countDocuments({
      demoTag: PRESENTATION_DEMO_TAG,
    })).toBe(0);
  });

  it("cleans legacy service-recorded presentation communication events before loading seed", async () => {
    mutableEnv.AURA_PRESENTATION_SEED_ENABLED = true;
    const legacyEvents = await CommunicationEvent.insertMany(
      Array.from({ length: 7 }, (_value, index) => ({
        patientId: "presentation-maria-gonzalez",
        threadKey: "patient_chat:presentation-maria-gonzalez",
        channel: "patient_chat",
        eventType: "thread_opened",
        actorType: "clinician",
        actorId: "69f00dec65b8b3b35331d7f7",
        sourceSurface: "communication_inbox",
        createdAt: dateAt("2026-04-28", 9 + index),
      }))
    );
    const realEvent = await CommunicationEvent.create({
      patientId: "p1",
      threadKey: "patient_chat:p1",
      channel: "patient_chat",
      eventType: "thread_opened",
      actorType: "clinician",
      actorId: "69f00dec65b8b3b35331d7f7",
      sourceSurface: "communication_inbox",
      createdAt: dateAt("2026-04-28", 12),
    });

    const seed = await request(app).post(route);
    const reset = await request(app).delete(route);

    expect(seed.status).toBe(200);
    expect(seed.body.deleted.communicationEvents).toBe(7);
    expect(seed.body.counts.communicationEvents).toBe(16);
    expect(
      await CommunicationEvent.countDocuments({
        _id: { $in: legacyEvents.map((event) => event._id) },
      })
    ).toBe(0);
    expect(await CommunicationEvent.exists({ _id: realEvent._id })).toBeTruthy();
    expect(reset.status).toBe(200);
    expect(reset.body.deleted.communicationEvents).toBe(16);
    expect(await CommunicationEvent.exists({ _id: realEvent._id })).toBeTruthy();
  });

  it("fails safely with diagnostics for unsafe untagged communication event collisions", async () => {
    mutableEnv.AURA_PRESENTATION_SEED_ENABLED = true;
    const realEvent = await CommunicationEvent.create({
      patientId: "presentation-emily-chen",
      threadKey: "presentation-thread-presentation-emily-chen",
      channel: "patient_chat",
      messageId: "real-message-id",
      eventType: "patient_message_sent",
      actorType: "patient",
      actorId: "presentation-emily-chen",
      sourceSurface: "clinician-inbox",
      sourceRecordId: "real-record-id",
      createdAt: dateAt("2026-04-18", 8),
    });

    const seed = await request(app).post(route);
    const reset = await request(app).delete(route);

    expect(seed.status).toBe(409);
    expect(seed.body.error).toBe("PRESENTATION_SEED_COLLISION");
    expect(seed.body.collisions).toContain("communicationEvents:1");
    expect(seed.body.details).toEqual([
      expect.objectContaining({
        collection: "communicationEvents",
        count: 1,
        ids: [String(realEvent._id)],
        safeToAutoClean: false,
      }),
    ]);
    expect(seed.body.details[0].records).toEqual([
      expect.objectContaining({
        id: String(realEvent._id),
        patientId: "presentation-emily-chen",
        threadKey: "presentation-thread-presentation-emily-chen",
        eventType: "patient_message_sent",
        sourceSurface: "clinician-inbox",
        createdAt: "2026-04-18T08:00:00.000Z",
        demoTag: null,
      }),
    ]);
    expect(await CommunicationEvent.exists({ _id: realEvent._id })).toBeTruthy();
    expect(reset.status).toBe(200);
    expect(await CommunicationEvent.exists({ _id: realEvent._id })).toBeTruthy();
  });

  it("safely retags legacy untagged presentation appointment slots before reseeding", async () => {
    mutableEnv.AURA_PRESENTATION_SEED_ENABLED = true;
    const legacySlots = await AppointmentSlot.insertMany(
      Array.from({ length: 8 }, (_value, index) =>
        buildLegacyPresentationAppointmentSlot(index)
      )
    );

    const first = await request(app).post(route);
    const second = await request(app).post(route);

    expect(first.status).toBe(200);
    expect(first.body.deleted.appointmentSlots).toBe(8);
    expect(first.body.counts.appointmentSlots).toBe(10);
    expect(second.status).toBe(200);
    expect(second.body.counts).toEqual(first.body.counts);
    expect(await AppointmentSlot.countDocuments({
      _id: { $in: legacySlots.map((slot) => slot._id) },
    })).toBe(0);
    expect(await AppointmentSlot.countDocuments({
      demoTag: PRESENTATION_DEMO_TAG,
    })).toBe(10);

    const reset = await request(app).delete(route);

    expect(reset.status).toBe(200);
    expect(reset.body.deleted.appointmentSlots).toBe(10);
    expect(await AppointmentSlot.countDocuments({
      demoTag: PRESENTATION_DEMO_TAG,
    })).toBe(0);
  });

  it("fails safely with diagnostics for unsafe untagged appointment slot collisions", async () => {
    mutableEnv.AURA_PRESENTATION_SEED_ENABLED = true;
    const realSlot = await AppointmentSlot.create(
      buildLegacyPresentationAppointmentSlot(0, {
        meetingLink: "https://example.com/meet/real-collision",
      })
    );

    const seed = await request(app).post(route);
    const reset = await request(app).delete(route);

    expect(seed.status).toBe(409);
    expect(seed.body.error).toBe("PRESENTATION_SEED_COLLISION");
    expect(seed.body.collisions).toContain("appointmentSlots:1");
    expect(seed.body.details).toEqual([
      expect.objectContaining({
        collection: "appointmentSlots",
        count: 1,
        ids: [String(realSlot._id)],
        reason: "untagged records collide with deterministic presentation appointment slots",
        safeToAutoClean: false,
      }),
    ]);
    expect(seed.body.details[0].records).toEqual([
      expect.objectContaining({
        id: String(realSlot._id),
        clinicianId: "presentation-clinician",
        startsAt: "2026-04-27T14:00:00.000Z",
        endsAt: "2026-04-27T15:00:00.000Z",
        meetingLink: "https://example.com/meet/real-collision",
        demoTag: null,
      }),
    ]);
    expect(await AppointmentSlot.exists({ _id: realSlot._id })).toBeTruthy();
    expect(reset.status).toBe(200);
    expect(await AppointmentSlot.exists({ _id: realSlot._id })).toBeTruthy();
  });

  it("treats reserved presentation patient IDs as presentation-owned during load", async () => {
    mutableEnv.AURA_PRESENTATION_SEED_ENABLED = true;
    await Patient.create({
      patientId: "presentation-emily-chen",
      displayName: "Legacy Presentation Patient",
      status: "active",
    });

    const seed = await request(app).post(route);

    expect(seed.status).toBe(200);
    expect(seed.body.deleted.patients).toBe(1);
    expect(await Patient.countDocuments({ patientId: "presentation-emily-chen" })).toBe(1);
    expect(await Patient.countDocuments({ demoTag: PRESENTATION_DEMO_TAG })).toBe(8);
    const reset = await request(app).delete(route);

    expect(reset.status).toBe(200);
    expect(await Patient.exists({ patientId: "presentation-emily-chen" })).toBeFalsy();
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
    expect(afterSeed.body.metadata.firstPatientId).toBe("presentation-emily-chen");
    expect(afterSeed.body.metadata.patientIds).toContain("presentation-emily-chen");
    expect(afterSeed.body.metadata.healthDateRange.end).toBe(dateKeyFromOffset(0));
    expect(afterSeed.body.metadata.appointmentDateRange.start).toBe(dateKeyFromOffset(0));

    await request(app).delete(route);
    const afterReset = await request(app).get(route);
    expect(afterReset.body.loaded).toBe(false);
    expect(afterReset.body.counts.patients).toBe(0);
    expect(afterReset.body.lastLoadedAt).toBeNull();
    expect(afterReset.body.metadata).toBeNull();
  });
});
