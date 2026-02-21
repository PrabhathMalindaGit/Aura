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

describe("PATCH /clinician/alerts/:id/seen", () => {
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
    vi.setSystemTime(new Date("2026-03-20T10:00:00.000Z"));

    await Promise.all([Alert.deleteMany({}), CareEvent.deleteMany({})]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("marks alert seen on first call and creates one ALERT_SEEN care event", async () => {
    const alert = await Alert.create({
      patientId: "p1",
      reason: "pain_spike",
      source: { type: "checkin", sourceId: "source-1" },
      status: "open",
      seenBy: [],
    });

    const response = await request(app)
      .patch(`/clinician/alerts/${String(alert._id)}/seen`)
      .send({ clinicianId: "c1", clinicianName: "Dr One" });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.alert._id).toBe(String(alert._id));
    expect(response.body.alert.seenBy).toEqual(["c1"]);
    expect(typeof response.body.alert.seenAt).toBe("string");

    const seenEvents = await CareEvent.find({
      alertId: String(alert._id),
      type: "ALERT_SEEN",
    }).lean();

    expect(seenEvents).toHaveLength(1);
    expect(seenEvents[0]?.payload).toEqual({
      clinicianId: "c1",
      clinicianName: "Dr One",
    });
  });

  it("is idempotent for the same clinician", async () => {
    const alert = await Alert.create({
      patientId: "p1",
      reason: "pain_spike",
      source: { type: "checkin", sourceId: "source-1" },
      status: "open",
      seenBy: [],
    });

    const first = await request(app)
      .patch(`/clinician/alerts/${String(alert._id)}/seen`)
      .send({ clinicianId: "c1" });

    const second = await request(app)
      .patch(`/clinician/alerts/${String(alert._id)}/seen`)
      .send({ clinicianId: "c1" });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.alert.seenBy).toEqual(["c1"]);
    expect(second.body.alert.seenAt).toBe(first.body.alert.seenAt);

    const seenEvents = await CareEvent.find({
      alertId: String(alert._id),
      type: "ALERT_SEEN",
    }).lean();

    expect(seenEvents).toHaveLength(1);
  });

  it("adds a second clinician and creates one more ALERT_SEEN event", async () => {
    const alert = await Alert.create({
      patientId: "p1",
      reason: "pain_spike",
      source: { type: "checkin", sourceId: "source-1" },
      status: "open",
      seenBy: [],
    });

    await request(app)
      .patch(`/clinician/alerts/${String(alert._id)}/seen`)
      .send({ clinicianId: "c1" });

    const second = await request(app)
      .patch(`/clinician/alerts/${String(alert._id)}/seen`)
      .send({ clinicianId: "c2" });

    expect(second.status).toBe(200);
    expect(second.body.ok).toBe(true);
    expect(second.body.alert.seenBy).toEqual(expect.arrayContaining(["c1", "c2"]));
    expect(second.body.alert.seenBy).toHaveLength(2);

    const seenEvents = await CareEvent.find({
      alertId: String(alert._id),
      type: "ALERT_SEEN",
    })
      .sort({ createdAt: 1 })
      .lean();

    expect(seenEvents).toHaveLength(2);
    expect(seenEvents[0]?.payload).toMatchObject({ clinicianId: "c1" });
    expect(seenEvents[1]?.payload).toMatchObject({ clinicianId: "c2" });
  });

  it("returns 400 for invalid alert id", async () => {
    const response = await request(app)
      .patch("/clinician/alerts/not-an-id/seen")
      .send({ clinicianId: "c1" });

    expect(response.status).toBe(400);
    expect(response.body.ok).toBe(false);
    expect(response.body.error).toBe("VALIDATION_ERROR");
  });

  it("returns 404 when alert does not exist", async () => {
    const missingId = new mongoose.Types.ObjectId().toString();

    const response = await request(app)
      .patch(`/clinician/alerts/${missingId}/seen`)
      .send({ clinicianId: "c1" });

    expect(response.status).toBe(404);
    expect(response.body.ok).toBe(false);
    expect(response.body.error).toBe("NOT_FOUND");
  });
});
