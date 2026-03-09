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
import { env } from "../src/env";
import Alert from "../src/models/Alert";
import AppointmentRequest from "../src/models/AppointmentRequest";
import AppointmentSlot from "../src/models/AppointmentSlot";
import CareEvent from "../src/models/CareEvent";
import CheckIn from "../src/models/CheckIn";
import CommunicationReview from "../src/models/CommunicationReview";
import Patient from "../src/models/Patient";
import Task from "../src/models/Task";

describe("internal n8n routes", () => {
  let mongoServer: MongoMemoryServer | null = null;
  const mutableEnv = env as unknown as { AURA_WEBHOOK_KEY: string };
  const originalWebhookKey = mutableEnv.AURA_WEBHOOK_KEY;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  afterAll(async () => {
    mutableEnv.AURA_WEBHOOK_KEY = originalWebhookKey;
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T09:00:00.000Z"));
    mutableEnv.AURA_WEBHOOK_KEY = "test-webhook-key";
    await Promise.all([
      Alert.deleteMany({}),
      AppointmentRequest.deleteMany({}),
      AppointmentSlot.deleteMany({}),
      CareEvent.deleteMany({}),
      CheckIn.deleteMany({}),
      CommunicationReview.deleteMany({}),
      Patient.deleteMany({}),
      Task.deleteMany({}),
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function createAlert(
    overrides: Partial<{ status: "open" | "acknowledged" | "resolved"; patientId: string }> = {}
  ) {
    return Alert.create({
      patientId: overrides.patientId ?? "p1",
      reason: "PAIN_GE_THRESHOLD",
      source: {
        type: "checkin",
        sourceId: new mongoose.Types.ObjectId().toString(),
      },
      status: overrides.status ?? "open",
    });
  }

  it("requires webhook key for list, patch, and follow-through endpoints", async () => {
    const alert = await createAlert();

    const listResponse = await request(app).get("/internal/n8n/alerts");
    const patchResponse = await request(app)
      .patch(`/internal/n8n/alerts/${String(alert._id)}`)
      .send({ status: "acknowledged" });
    const followThroughResponse = await request(app).post(
      "/internal/n8n/follow-through/tasks/process"
    );

    expect(listResponse.status).toBe(401);
    expect(listResponse.body.error).toBe("UNAUTHORIZED");
    expect(patchResponse.status).toBe(401);
    expect(patchResponse.body.error).toBe("UNAUTHORIZED");
    expect(followThroughResponse.status).toBe(401);
    expect(followThroughResponse.body.error).toBe("UNAUTHORIZED");
  });

  it("lists alerts by status with webhook key", async () => {
    await createAlert({ status: "open" });
    await createAlert({ status: "resolved" });

    const response = await request(app)
      .get("/internal/n8n/alerts")
      .query({ status: "open" })
      .set("x-aura-webhook-key", "test-webhook-key");

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(Array.isArray(response.body.alerts)).toBe(true);
    expect(response.body.alerts).toHaveLength(1);
    expect(response.body.alerts[0].status).toBe("open");
  });

  it("updates alert status through internal patch endpoint", async () => {
    const alert = await createAlert({ status: "open" });

    const response = await request(app)
      .patch(`/internal/n8n/alerts/${String(alert._id)}`)
      .set("x-aura-webhook-key", "test-webhook-key")
      .send({ status: "acknowledged" });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.alert.status).toBe("acknowledged");

    const updated = await Alert.findById(alert._id).lean();
    expect(updated?.status).toBe("acknowledged");
    expect(updated?.acknowledgedAt).toBeTruthy();
  });

  it("processes missed check-in follow-through and avoids duplicate delivery after callback", async () => {
    await Patient.create({
      patientId: "p1",
      displayName: "Jordan Hall",
      clinicianId: "clinician-1",
      status: "active",
    });
    await CheckIn.create({
      patientId: "p1",
      date: "2026-06-10",
      mood: 3,
      pain: 8,
      adherence: { exercises: 0.2, medication: false },
      risk: { level: "high", reasons: ["PAIN_GE_THRESHOLD"] },
    });

    const response = await request(app)
      .post("/internal/n8n/follow-through/missed-checkins/process")
      .set("x-aura-webhook-key", "test-webhook-key")
      .send({ limit: 10 });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.workflow).toBe("missed_checkin_reminder");
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0]).toMatchObject({
      patientId: "p1",
      linkedEntityType: "patient",
    });

    const tasks = await Task.find({ patientId: "p1" }).lean();
    expect(tasks).toHaveLength(2);
    expect(
      tasks.some((task) => task.source?.entityType === "missed_checkin_reminder")
    ).toBe(true);
    expect(
      tasks.some((task) => task.source?.entityType === "missed_checkin_follow_up")
    ).toBe(true);

    await CareEvent.create({
      type: "AUTOMATION_STATUS",
      patientId: "p1",
      payload: {
        workflow: "missed_checkin_reminder",
        status: "sent",
        dedupeKey: response.body.items[0].dedupeKey,
        eventKey: `automation:missed_checkin_reminder:sent:${response.body.items[0].dedupeKey}`,
      },
    });

    const dedupedResponse = await request(app)
      .post("/internal/n8n/follow-through/missed-checkins/process")
      .set("x-aura-webhook-key", "test-webhook-key")
      .send({ limit: 10 });

    expect(dedupedResponse.status).toBe(200);
    expect(dedupedResponse.body.items).toHaveLength(0);
  });

  it("returns task reminder candidates for patient-action tasks and dedupes overdue buckets", async () => {
    await Patient.create({
      patientId: "p2",
      displayName: "Ava Chen",
      status: "active",
    });

    const task = await Task.create({
      patientId: "p2",
      title: "Complete tonight's pain check",
      description: "Your care team asked for a quick update tonight.",
      type: "follow_up",
      priority: "high",
      status: "open",
      dueAt: new Date("2026-06-15T07:00:00.000Z"),
      createdBy: "clinician-1",
      source: { type: "manual", entityType: "task", entityId: "pain-check-1" },
      meta: {
        patientAction: { kind: "checkin", label: "Open check-in" },
      },
    });

    const response = await request(app)
      .post("/internal/n8n/follow-through/tasks/process")
      .set("x-aura-webhook-key", "test-webhook-key")
      .send({ limit: 10 });

    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0]).toMatchObject({
      taskId: String(task._id),
      linkedEntityType: "task",
    });
    expect(response.body.items[0].meta.phase).toBe("overdue");

    await CareEvent.create({
      type: "AUTOMATION_STATUS",
      patientId: "p2",
      payload: {
        workflow: "task_reminder_timing",
        status: "sent",
        dedupeKey: response.body.items[0].dedupeKey,
        eventKey: `automation:task_reminder_timing:sent:${response.body.items[0].dedupeKey}`,
      },
    });

    const dedupedResponse = await request(app)
      .post("/internal/n8n/follow-through/tasks/process")
      .set("x-aura-webhook-key", "test-webhook-key")
      .send({ limit: 10 });

    expect(dedupedResponse.status).toBe(200);
    expect(dedupedResponse.body.items).toHaveLength(0);
  });

  it("creates appointment and communication follow-up candidates through internal automation endpoints", async () => {
    await Patient.create([
      { patientId: "p3", displayName: "Noah Diaz", clinicianId: "clinician-2" },
      { patientId: "p4", displayName: "Mila Singh", clinicianId: "clinician-2" },
    ]);

    const slot = await AppointmentSlot.create({
      clinicianId: "clinician-2",
      startsAt: new Date("2026-06-15T05:00:00.000Z"),
      endsAt: new Date("2026-06-15T05:30:00.000Z"),
      modality: "video",
      status: "available",
    });
    await AppointmentRequest.create({
      slotId: slot._id,
      patientId: "p3",
      status: "pending",
      note: "Need to reschedule this visit",
    });

    await CommunicationReview.create({
      patientId: "p4",
      messageId: "507f1f77bcf86cd799439199",
      needsResponse: true,
      flaggedBySafety: false,
      followUpRequested: true,
      messageCreatedAt: new Date("2026-06-14T07:00:00.000Z"),
      messagePreview: "Can someone call me back about my rehab plan?",
    });

    const appointmentResponse = await request(app)
      .post("/internal/n8n/follow-through/appointments/process")
      .set("x-aura-webhook-key", "test-webhook-key")
      .send({ limit: 10 });

    expect(appointmentResponse.status).toBe(200);
    expect(appointmentResponse.body.items).toHaveLength(1);
    expect(appointmentResponse.body.items[0].appointmentRequestId).toBeDefined();

    const communicationResponse = await request(app)
      .post("/internal/n8n/follow-through/communications/process")
      .set("x-aura-webhook-key", "test-webhook-key")
      .send({ limit: 10 });

    expect(communicationResponse.status).toBe(200);
    expect(communicationResponse.body.items).toHaveLength(1);
    expect(communicationResponse.body.items[0].communicationReviewId).toBeDefined();

    const tasks = await Task.find({ patientId: { $in: ["p3", "p4"] } }).lean();
    expect(
      tasks.some((task) => task.source?.entityType === "appointment_follow_up")
    ).toBe(true);
    expect(
      tasks.some((task) => task.source?.entityType === "communication_no_response")
    ).toBe(true);
  });

  it("builds the richer daily clinician digest payload", async () => {
    await Patient.create({
      patientId: "p5",
      displayName: "Iris Cole",
      status: "active",
    });
    await createAlert({ patientId: "p5", status: "open" });
    await Task.create({
      patientId: "p5",
      title: "Call after missed appointment",
      type: "appointment",
      priority: "high",
      status: "open",
      dueAt: new Date("2026-06-15T06:00:00.000Z"),
      createdBy: "clinician-1",
      source: { type: "manual" },
    });

    const response = await request(app)
      .post("/internal/n8n/follow-through/digest/process")
      .set("x-aura-webhook-key", "test-webhook-key")
      .send({ force: true });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.workflow).toBe("daily_clinician_digest");
    expect(response.body.items).toHaveLength(1);
    expect(response.body.messageText).toContain("Aura Daily Digest");
    expect(response.body.messageText).toContain("Open alerts: 1");
  });
});
