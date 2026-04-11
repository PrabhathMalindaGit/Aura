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
import CareEvent from "../src/models/CareEvent";
import ChatMessage from "../src/models/ChatMessage";
import CheckIn from "../src/models/CheckIn";

describe("GET /clinician/alerts/:id/context", () => {
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
    vi.setSystemTime(new Date("2026-03-15T12:00:00.000Z"));

    await Promise.all([
      Alert.deleteMany({}),
      CareEvent.deleteMany({}),
      ChatMessage.deleteMany({}),
      CheckIn.deleteMany({}),
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns check-in triggering context and audit trail in ascending order", async () => {
    vi.setSystemTime(new Date("2026-03-11T09:00:00.000Z"));
    const checkin = await CheckIn.create({
      patientId: "p1",
      date: "2026-03-11",
      mood: 2,
      pain: 8,
      adherence: {
        exercises: 0.3,
        medication: false,
      },
      notes: "Pain has increased overnight",
      risk: {
        level: "high",
        reasons: ["pain_spike"],
      },
    });

    vi.setSystemTime(new Date("2026-03-11T09:05:00.000Z"));
    const alert = await Alert.create({
      patientId: "p1",
      reason: "pain_spike",
      source: {
        type: "checkin",
        sourceId: String(checkin._id),
      },
      status: "open",
      seenBy: ["clinician-1"],
      seenAt: new Date("2026-03-11T09:05:45.000Z"),
      notification: {
        channel: "telegram",
        status: "failed",
        failedAt: new Date("2026-03-11T09:05:30.000Z"),
        error: "N8N_WEBHOOK_DELIVERY_FAILED",
        retryCount: 1,
      },
    });

    vi.setSystemTime(new Date("2026-03-11T09:06:00.000Z"));
    await CareEvent.create({
      type: "ALERT_CREATED",
      patientId: "p1",
      alertId: String(alert._id),
      payload: {
        reasonCode: "pain_spike",
        text: "sensitive message should not be returned",
      },
    });

    vi.setSystemTime(new Date("2026-03-11T09:07:00.000Z"));
    await CareEvent.create({
      type: "NOTIFICATION_FAILED",
      patientId: "p1",
      alertId: String(alert._id),
      payload: {
        errorCode: "N8N_WEBHOOK_DELIVERY_FAILED",
        notes: "sensitive note should not be returned",
      },
    });

    const response = await request(app).get(
      `/clinician/alerts/${String(alert._id)}/context`
    );

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.alert._id).toBe(String(alert._id));
    expect(response.body.triggering?.type).toBe("checkin");
    expect(response.body.triggering?.checkin?.pain).toBe(8);
    expect(Array.isArray(response.body.auditTrail)).toBe(true);
    expect(response.body.auditTrail.length).toBeGreaterThanOrEqual(2);

    const eventTypes = response.body.auditTrail.map((entry: { eventType: string }) => entry.eventType);
    expect(eventTypes).toEqual(
      expect.arrayContaining(["ALERT_CREATED", "NOTIFICATION_FAILED", "ALERT_SEEN"]),
    );

    const firstAt = Date.parse(response.body.auditTrail[0]?.occurredAt as string);
    const lastAt = Date.parse(
      response.body.auditTrail[response.body.auditTrail.length - 1]?.occurredAt as string,
    );
    expect(firstAt).toBeLessThanOrEqual(lastAt);

    const createdEntry = response.body.auditTrail.find(
      (entry: { eventType: string }) => entry.eventType === "ALERT_CREATED",
    );
    const failureEntry = response.body.auditTrail.find(
      (entry: { eventType: string }) => entry.eventType === "NOTIFICATION_FAILED",
    );

    expect(createdEntry?.meta?.text).toBeUndefined();
    expect(failureEntry?.meta?.notes).toBeUndefined();
  });

  it("returns bounded chat message context window", async () => {
    vi.setSystemTime(new Date("2026-03-14T09:00:00.000Z"));
    const msg1 = await ChatMessage.create({
      patientId: "p1",
      role: "user",
      text: "message-1",
      risk: { level: "low", reasons: [] },
    });

    vi.setSystemTime(new Date("2026-03-14T09:01:00.000Z"));
    const msg2 = await ChatMessage.create({
      patientId: "p1",
      role: "assistant",
      text: "message-2",
      risk: { level: "low", reasons: [] },
    });

    vi.setSystemTime(new Date("2026-03-14T09:02:00.000Z"));
    const msg3 = await ChatMessage.create({
      patientId: "p1",
      role: "user",
      text: "message-3",
      risk: { level: "high", reasons: ["suicidal_language"] },
    });

    vi.setSystemTime(new Date("2026-03-14T09:03:00.000Z"));
    const msg4 = await ChatMessage.create({
      patientId: "p1",
      role: "assistant",
      text: "message-4",
      risk: { level: "high", reasons: ["suicidal_language"] },
    });

    vi.setSystemTime(new Date("2026-03-14T09:04:00.000Z"));
    const msg5 = await ChatMessage.create({
      patientId: "p1",
      role: "user",
      text: "message-5",
      risk: { level: "high", reasons: ["suicidal_language"] },
    });

    await ChatMessage.create({
      patientId: "p2",
      role: "user",
      text: "different-patient",
      risk: { level: "low", reasons: [] },
    });

    const alert = await Alert.create({
      patientId: "p1",
      reason: "suicidal_language",
      source: {
        type: "chat",
        sourceId: String(msg3._id),
      },
      status: "open",
    });

    const response = await request(app).get(
      `/clinician/alerts/${String(alert._id)}/context`
    );

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.triggering?.type).toBe("chat");

    const windowMessages = response.body.triggering?.messageWindow as Array<{
      id: string;
    }>;

    expect(Array.isArray(windowMessages)).toBe(true);
    expect(windowMessages.length).toBeLessThanOrEqual(5);

    const returnedIds = windowMessages.map((message) => message.id);
    expect(returnedIds).toContain(String(msg3._id));
    expect(returnedIds).toEqual([
      String(msg1._id),
      String(msg2._id),
      String(msg3._id),
      String(msg4._id),
      String(msg5._id),
    ]);
  });

  it("returns 400 for invalid alert id", async () => {
    const response = await request(app).get("/clinician/alerts/not-an-id/context");

    expect(response.status).toBe(400);
    expect(response.body.ok).toBe(false);
    expect(response.body.error).toBe("VALIDATION_ERROR");
  });

  it("returns 404 when alert is not found", async () => {
    const missingId = new mongoose.Types.ObjectId().toString();
    const response = await request(app).get(
      `/clinician/alerts/${missingId}/context`
    );

    expect(response.status).toBe(404);
    expect(response.body.ok).toBe(false);
    expect(response.body.error).toBe("NOT_FOUND");
  });
});
