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
import PatientThresholdConfig from "../src/models/PatientThresholdConfig";
import PromInstance from "../src/models/PromInstance";
import Task from "../src/models/Task";
import User from "../src/models/User";
import { signAuthToken } from "../src/utils/jwt";

function clinicianToken(user: {
  _id: unknown;
  email: string;
  displayName?: string;
  sessionVersion?: number;
}): string {
  return signAuthToken({
    id: String(user._id),
    role: "clinician",
    email: user.email,
    name: user.displayName ?? "Clinician One",
    sessionVersion: user.sessionVersion ?? 0,
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
      PatientThresholdConfig.deleteMany({}),
      PromInstance.deleteMany({}),
      Task.deleteMany({}),
      User.deleteMany({}),
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns an aggregated operational worklist", async () => {
    const clinicianUser = await User.create({
      email: "clinician-1@example.com",
      passwordHash: "unused-password-hash",
      role: "clinician",
      displayName: "Clinician One",
      sessionVersion: 0,
    });
    const clinicianId = String(clinicianUser._id);

    await Patient.insertMany([
      {
        patientId: "p1",
        displayName: "Jordan Lee",
        status: "active",
        clinicianId,
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
      {
        patientId: "p3",
        displayName: "Taylor Fox",
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
      date: "2026-03-09",
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

    await CheckIn.create({
      patientId: "p3",
      date: "2026-03-09",
      mood: 5,
      pain: 2,
      adherence: {
        exercises: 0.9,
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
      assignedTo: clinicianId,
    });

    await Task.create({
      patientId: "p1",
      title: "Safety follow-up",
      type: "safety_review",
      priority: "urgent",
      status: "open",
      assignedTo: clinicianId,
      createdBy: clinicianId,
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

    await PatientThresholdConfig.create({
      patientId: "p1",
      painHighThreshold: 6,
      missedCheckinDays: 3,
      responseDelayHours: 36,
      safetyFlaggedResponseDelayHours: 8,
      version: 1,
      updatedBy: {
        clinicianId,
        name: "Clinician One",
      },
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

    await PromInstance.insertMany([
      {
        patientId: "p1",
        templateKey: "koos",
        templateVersion: 1,
        titleSnapshot: "KOOS",
        questionsSnapshot: [
          {
            id: "q1",
            text: "How is your knee today?",
            type: "likert",
            min: 0,
            max: 10,
            required: true,
          },
        ],
        dueAt: new Date("2026-03-09T06:00:00.000Z"),
        status: "due",
      },
      {
        patientId: "p1",
        templateKey: "promis",
        templateVersion: 1,
        titleSnapshot: "PROMIS Function",
        questionsSnapshot: [
          {
            id: "q1",
            text: "How is your movement today?",
            type: "likert",
            min: 0,
            max: 10,
            required: true,
          },
        ],
        dueAt: new Date("2026-03-10T08:00:00.000Z"),
        status: "due",
      },
      {
        patientId: "p2",
        templateKey: "lefs",
        templateVersion: 1,
        titleSnapshot: "LEFS",
        questionsSnapshot: [
          {
            id: "q1",
            text: "How easy was walking today?",
            type: "likert",
            min: 0,
            max: 10,
            required: true,
          },
        ],
        dueAt: new Date("2026-03-07T08:00:00.000Z"),
        status: "due",
      },
    ]);

    const response = await request(app)
      .get("/clinician/worklist")
      .set("Authorization", `Bearer ${clinicianToken(clinicianUser)}`);

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.items).toHaveLength(3);

    expect(response.body.items[0].patientId).toBe("p1");

    const p1 = response.body.items.find((item: { patientId: string }) => item.patientId === "p1");
    const p2 = response.body.items.find((item: { patientId: string }) => item.patientId === "p2");
    const p3 = response.body.items.find((item: { patientId: string }) => item.patientId === "p3");

    expect(p1).toMatchObject({
      patientId: "p1",
      patientName: "Jordan Lee",
      patientStatus: "active",
      rehabPhase: "Strength & Control",
      openAlertsCount: 1,
      latestRiskLevel: "high",
      lastPainScore: 8,
      communicationNeedsResponse: true,
      communicationSummary: {
        needsResponseCount: 1,
        flaggedBySafetyCount: 1,
        delayedResponse: false,
        responseDelayHours: 8,
      },
      activeTaskCount: 1,
      proms: {
        dueCount: 2,
        overdueCount: 1,
      },
      thresholdSummary: {
        painHighThreshold: 6,
        missedCheckinDays: 3,
        responseDelayHours: 36,
        safetyFlaggedResponseDelayHours: 8,
        configured: true,
        updatedByName: "Clinician One",
      },
    });
    expect(p1.missedCheckins.flag).toBe(false);
    expect(typeof p1.nextAppointmentAt).toBe("string");
    expect(typeof p1.proms.nextDueAt).toBe("string");
    expect(typeof p1.updatedAt).toBe("string");
    expect(typeof p1.priorityScore).toBe("number");

    expect(p2).toMatchObject({
      patientId: "p2",
      patientName: "Avery Chen",
      patientStatus: "active",
      openAlertsCount: 0,
      latestRiskLevel: "low",
      topIssue: "1 overdue PROM",
      reviewReason: "1 overdue PROM",
      proms: {
        dueCount: 1,
        overdueCount: 1,
      },
    });
    expect(p2.missedCheckins.flag).toBe(false);

    expect(p3).toMatchObject({
      patientId: "p3",
      proms: {
        dueCount: 0,
        overdueCount: 0,
      },
    });

    const filteredResponse = await request(app)
      .get("/clinician/worklist")
      .query({
        highRiskOnly: "true",
        assignedToMe: "true",
      })
      .set("Authorization", `Bearer ${clinicianToken(clinicianUser)}`);

    expect(filteredResponse.status).toBe(200);
    expect(filteredResponse.body.items).toHaveLength(1);
    expect(filteredResponse.body.items[0].patientId).toBe("p1");

    const promFilteredResponse = await request(app)
      .get("/clinician/worklist")
      .query({
        needsPromReview: "true",
      })
      .set("Authorization", `Bearer ${clinicianToken(clinicianUser)}`);

    expect(promFilteredResponse.status).toBe(200);
    expect(promFilteredResponse.body.items).toHaveLength(2);
    expect(promFilteredResponse.body.items.map((item: { patientId: string }) => item.patientId)).toEqual([
      "p1",
      "p2",
    ]);
  });
});
