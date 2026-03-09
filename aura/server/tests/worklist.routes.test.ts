import mongoose from "mongoose";
import request from "supertest";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";

import app from "../src/app";
import Alert from "../src/models/Alert";
import AppointmentRequest from "../src/models/AppointmentRequest";
import AppointmentSlot from "../src/models/AppointmentSlot";
import CheckIn from "../src/models/CheckIn";
import CommunicationReview from "../src/models/CommunicationReview";
import Patient from "../src/models/Patient";
import Task from "../src/models/Task";
import { signAuthToken } from "../src/utils/jwt";

function clinicianToken(userId = "clinician-1"): string {
  return signAuthToken({
    id: userId,
    role: "clinician",
    email: `${userId}@example.com`,
    name: "Clinician One",
  });
}

describe("clinician worklist route", () => {
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
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-09T12:00:00.000Z"));

    await Promise.all([
      Alert.deleteMany({}),
      AppointmentRequest.deleteMany({}),
      AppointmentSlot.deleteMany({}),
      CheckIn.deleteMany({}),
      CommunicationReview.deleteMany({}),
      Patient.deleteMany({}),
      Task.deleteMany({}),
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns an aggregated operational worklist", async () => {
    await Patient.insertMany([
      {
        patientId: "p1",
        displayName: "Jordan Lee",
        status: "active",
        clinicianId: "clinician-1",
        rehab: {
          currentKey: "phase-strength",
          phases: [
            {
              key: "phase-early",
              title: "Early Recovery",
              order: 0,
              status: "done",
            },
            {
              key: "phase-strength",
              title: "Strength & Control",
              order: 1,
              status: "current",
            },
          ],
        },
      },
      {
        patientId: "p2",
        displayName: "Avery Chen",
        status: "active",
      },
    ]);

    await CheckIn.create({
      patientId: "p1",
      date: "2026-03-09",
      mood: 3,
      pain: 8,
      adherence: {
        exercises: 0.4,
        medication: false,
      },
      risk: {
        level: "high",
        reasons: ["PAIN_GE_THRESHOLD"],
      },
    });

    await CheckIn.create({
      patientId: "p2",
      date: "2026-03-04",
      mood: 4,
      pain: 3,
      adherence: {
        exercises: 0.8,
        medication: true,
      },
      risk: {
        level: "low",
        reasons: [],
      },
    });

    await Alert.create({
      patientId: "p1",
      reason: "High pain",
      source: { type: "checkin", sourceId: "checkin-p1" },
      status: "open",
      assignedTo: "clinician-1",
    });

    await Task.create({
      patientId: "p1",
      title: "Safety follow-up",
      type: "safety_review",
      priority: "urgent",
      status: "open",
      assignedTo: "clinician-1",
      createdBy: "clinician-1",
      source: { type: "alert" },
    });

    await CommunicationReview.create({
      patientId: "p1",
      messageId: String(new mongoose.Types.ObjectId()),
      needsResponse: true,
      flaggedBySafety: true,
      followUpRequested: true,
      messageCreatedAt: new Date("2026-03-09T09:00:00.000Z"),
      messagePreview: "Pain is worse and I need advice.",
    });

    const slot = await AppointmentSlot.create({
      clinicianId: "clinician-1",
      startsAt: new Date("2026-03-09T16:00:00.000Z"),
      endsAt: new Date("2026-03-09T16:30:00.000Z"),
      status: "available",
    });

    await AppointmentRequest.create({
      slotId: slot._id,
      patientId: "p1",
      status: "approved",
      note: "Confirmed for today.",
    });

    const response = await request(app)
      .get("/clinician/worklist")
      .set("Authorization", `Bearer ${clinicianToken()}`);

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.items).toHaveLength(2);

    const p1 = response.body.items.find((item: { patientId: string }) => item.patientId === "p1");
    const p2 = response.body.items.find((item: { patientId: string }) => item.patientId === "p2");

    expect(p1).toMatchObject({
      patientId: "p1",
      patientName: "Jordan Lee",
      patientStatus: "active",
      rehabPhase: "Strength & Control",
      openAlertsCount: 1,
      latestRiskLevel: "high",
      lastPainScore: 8,
      communicationNeedsResponse: true,
      activeTaskCount: 1,
    });
    expect(p1.missedCheckins.flag).toBe(false);
    expect(typeof p1.nextAppointmentAt).toBe("string");
    expect(typeof p1.updatedAt).toBe("string");
    expect(typeof p1.priorityScore).toBe("number");

    expect(p2).toMatchObject({
      patientId: "p2",
      patientName: "Avery Chen",
      patientStatus: "active",
      openAlertsCount: 0,
      latestRiskLevel: "low",
    });
    expect(p2.missedCheckins.flag).toBe(true);

    const filteredResponse = await request(app)
      .get("/clinician/worklist")
      .query({
        highRiskOnly: "true",
        assignedToMe: "true",
      })
      .set("Authorization", `Bearer ${clinicianToken()}`);

    expect(filteredResponse.status).toBe(200);
    expect(filteredResponse.body.items).toHaveLength(1);
    expect(filteredResponse.body.items[0].patientId).toBe("p1");
  });
});
