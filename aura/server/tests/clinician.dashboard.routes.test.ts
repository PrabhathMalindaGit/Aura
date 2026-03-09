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
import CareEvent from "../src/models/CareEvent";
import CommunicationReview from "../src/models/CommunicationReview";
import InsightSuggestion from "../src/models/InsightSuggestion";
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

describe("clinician dashboard aggregate routes", () => {
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
    vi.setSystemTime(new Date("2026-03-09T08:00:00.000Z"));

    await Promise.all([
      Alert.deleteMany({}),
      AppointmentRequest.deleteMany({}),
      AppointmentSlot.deleteMany({}),
      CareEvent.deleteMany({}),
      CommunicationReview.deleteMany({}),
      InsightSuggestion.deleteMany({}),
      Patient.deleteMany({}),
      Task.deleteMany({}),
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns dashboard summary, queue, and overview aggregates", async () => {
    await Patient.create({
      patientId: "p1",
      displayName: "Jordan Lee",
      status: "active",
      clinicianId: "clinician-1",
    });

    const alert = await Alert.create({
      patientId: "p1",
      reason: "High pain escalation",
      source: { type: "checkin", sourceId: "checkin-1" },
      status: "open",
      assignedTo: "clinician-1",
    });

    await CareEvent.create({
      type: "ALERT_CREATED",
      patientId: "p1",
      alertId: String(alert._id),
      payload: {
        reasons: ["PAIN_GE_THRESHOLD"],
      },
    });

    await InsightSuggestion.create({
      patientId: "p1",
      windowDays: 14,
      windowStart: new Date("2026-02-24T00:00:00.000Z"),
      windowEnd: new Date("2026-03-09T00:00:00.000Z"),
      status: "pending",
      title: "Pain trend worsened",
      message: "Pain has increased compared with the previous two weeks.",
      category: "symptoms",
      confidence: "high",
      priority: 4,
      fingerprint: "insight-p1",
    });

    await Task.create({
      patientId: "p1",
      title: "Review safety escalation",
      type: "safety_review",
      priority: "urgent",
      status: "open",
      dueAt: new Date("2026-03-09T09:00:00.000Z"),
      assignedTo: "clinician-1",
      createdBy: "clinician-1",
      source: { type: "alert", entityType: "alert", entityId: String(alert._id) },
      linkedAlertId: String(alert._id),
    });

    const slot = await AppointmentSlot.create({
      clinicianId: "clinician-1",
      startsAt: new Date("2026-03-09T13:00:00.000Z"),
      endsAt: new Date("2026-03-09T13:30:00.000Z"),
      status: "available",
      meetingLink: "https://meet.example.com/aura",
    });

    await AppointmentRequest.create({
      slotId: slot._id,
      patientId: "p1",
      status: "pending",
      note: "Please confirm this slot.",
    });

    await CommunicationReview.create({
      patientId: "p1",
      messageId: String(new mongoose.Types.ObjectId()),
      needsResponse: true,
      flaggedBySafety: true,
      followUpRequested: true,
      messageCreatedAt: new Date("2026-03-09T07:30:00.000Z"),
      messagePreview: "My pain feels much worse after yesterday's exercise.",
    });

    const authHeader = { Authorization: `Bearer ${clinicianToken()}` };

    const summaryResponse = await request(app)
      .get("/clinician/dashboard/summary")
      .set(authHeader);

    expect(summaryResponse.status).toBe(200);
    expect(summaryResponse.body.summary).toMatchObject({
      openAlertsCount: 1,
      assignedToMeAlertsCount: 1,
      pendingInsightsCount: 1,
      todayAppointmentsCount: 1,
      openFollowUpTasksCount: 1,
      messagesNeedingResponseCount: 1,
    });

    const priorityQueueResponse = await request(app)
      .get("/clinician/dashboard/priority-queue")
      .set(authHeader);

    expect(priorityQueueResponse.status).toBe(200);
    expect(priorityQueueResponse.body.items.some((item: { itemType?: string }) => item.itemType === "alert")).toBe(
      true
    );
    expect(priorityQueueResponse.body.items.some((item: { itemType?: string }) => item.itemType === "task")).toBe(
      true
    );
    expect(
      priorityQueueResponse.body.items.some((item: { itemType?: string }) => item.itemType === "communication")
    ).toBe(true);

    const recentSafetyEventsResponse = await request(app)
      .get("/clinician/dashboard/recent-safety-events")
      .set(authHeader);

    expect(recentSafetyEventsResponse.status).toBe(200);
    expect(recentSafetyEventsResponse.body.items).toHaveLength(1);
    expect(recentSafetyEventsResponse.body.items[0]).toMatchObject({
      type: "ALERT_CREATED",
      patientId: "p1",
      alertId: String(alert._id),
    });

    const todayAppointmentsResponse = await request(app)
      .get("/clinician/dashboard/today-appointments")
      .set(authHeader);

    expect(todayAppointmentsResponse.status).toBe(200);
    expect(todayAppointmentsResponse.body.items).toHaveLength(1);
    expect(todayAppointmentsResponse.body.items[0].status).toBe("awaiting_confirmation");

    const followUpTasksResponse = await request(app)
      .get("/clinician/dashboard/follow-up-tasks")
      .query({ assignedToMe: "true" })
      .set(authHeader);

    expect(followUpTasksResponse.status).toBe(200);
    expect(followUpTasksResponse.body.items).toHaveLength(1);

    const communicationOverviewResponse = await request(app)
      .get("/clinician/dashboard/communication-overview")
      .set(authHeader);

    expect(communicationOverviewResponse.status).toBe(200);
    expect(communicationOverviewResponse.body.overview.counts).toMatchObject({
      needsResponseCount: 1,
      flaggedBySafetyCount: 1,
      followUpRequestedCount: 1,
    });
    expect(communicationOverviewResponse.body.overview.items).toHaveLength(1);
  });
});
