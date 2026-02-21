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

describe("PATCH /clinician/alerts/:id/assignment", () => {
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
    vi.setSystemTime(new Date("2026-03-25T10:00:00.000Z"));

    await Promise.all([Alert.deleteMany({}), CareEvent.deleteMany({})]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function createAlert() {
    return Alert.create({
      patientId: "p1",
      reason: "pain_spike",
      source: { type: "checkin", sourceId: "source-1" },
      status: "open",
    });
  }

  it("assigns an unassigned alert", async () => {
    const alert = await createAlert();

    const response = await request(app)
      .patch(`/clinician/alerts/${String(alert._id)}/assignment`)
      .send({
        assignedTo: "c1",
        assignedToName: "Dr One",
        requestedBy: "c1",
        requestedByName: "Dr One",
      });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.alert.assignedTo).toBe("c1");
    expect(response.body.alert.assignedToName).toBe("Dr One");
    expect(typeof response.body.alert.assignedAt).toBe("string");

    const events = await CareEvent.find({
      alertId: String(alert._id),
      type: "ALERT_ASSIGNED",
    }).lean();

    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toMatchObject({
      action: "assign",
      assignedTo: "c1",
      requestedBy: "c1",
      force: false,
    });
  });

  it("is idempotent when assigning to the same clinician", async () => {
    const alert = await createAlert();

    const first = await request(app)
      .patch(`/clinician/alerts/${String(alert._id)}/assignment`)
      .send({
        assignedTo: "c1",
        assignedToName: "Dr One",
        requestedBy: "c1",
      });

    vi.setSystemTime(new Date("2026-03-25T10:05:00.000Z"));

    const second = await request(app)
      .patch(`/clinician/alerts/${String(alert._id)}/assignment`)
      .send({
        assignedTo: "c1",
        assignedToName: "Dr One",
        requestedBy: "c1",
      });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.alert.assignedTo).toBe("c1");
    expect(second.body.alert.assignedAt).toBe(first.body.alert.assignedAt);

    const events = await CareEvent.find({
      alertId: String(alert._id),
      type: "ALERT_ASSIGNED",
    }).lean();

    expect(events).toHaveLength(1);
  });

  it("returns 409 when assigning to a different clinician without force", async () => {
    const alert = await createAlert();

    await request(app)
      .patch(`/clinician/alerts/${String(alert._id)}/assignment`)
      .send({ assignedTo: "c1", requestedBy: "c1" });

    const conflict = await request(app)
      .patch(`/clinician/alerts/${String(alert._id)}/assignment`)
      .send({ assignedTo: "c2", requestedBy: "c2", force: false });

    expect(conflict.status).toBe(409);
    expect(conflict.body.ok).toBe(false);
    expect(conflict.body.error).toBe("ASSIGNMENT_CONFLICT");
    expect(conflict.body.current).toMatchObject({ assignedTo: "c1" });

    const events = await CareEvent.find({
      alertId: String(alert._id),
      type: "ALERT_ASSIGNED",
    }).lean();

    expect(events).toHaveLength(1);
  });

  it("allows takeover when force is true", async () => {
    const alert = await createAlert();

    const first = await request(app)
      .patch(`/clinician/alerts/${String(alert._id)}/assignment`)
      .send({ assignedTo: "c1", requestedBy: "c1" });

    vi.setSystemTime(new Date("2026-03-25T10:10:00.000Z"));

    const takeover = await request(app)
      .patch(`/clinician/alerts/${String(alert._id)}/assignment`)
      .send({
        assignedTo: "c2",
        assignedToName: "Dr Two",
        requestedBy: "c2",
        requestedByName: "Dr Two",
        force: true,
      });

    expect(takeover.status).toBe(200);
    expect(takeover.body.ok).toBe(true);
    expect(takeover.body.alert.assignedTo).toBe("c2");
    expect(takeover.body.alert.assignedToName).toBe("Dr Two");
    expect(Date.parse(takeover.body.alert.assignedAt)).toBeGreaterThan(
      Date.parse(first.body.alert.assignedAt)
    );

    const events = await CareEvent.find({
      alertId: String(alert._id),
      type: "ALERT_ASSIGNED",
    })
      .sort({ createdAt: 1 })
      .lean();

    expect(events).toHaveLength(2);
    expect(events[1]?.payload).toMatchObject({
      action: "takeover",
      assignedTo: "c2",
      previousAssignedTo: "c1",
      requestedBy: "c2",
      force: true,
    });
  });

  it("returns 409 when non-owner tries to unassign without force", async () => {
    const alert = await createAlert();

    await request(app)
      .patch(`/clinician/alerts/${String(alert._id)}/assignment`)
      .send({ assignedTo: "c2", requestedBy: "c2" });

    const response = await request(app)
      .patch(`/clinician/alerts/${String(alert._id)}/assignment`)
      .send({ assignedTo: null, requestedBy: "c1", force: false });

    expect(response.status).toBe(409);
    expect(response.body.ok).toBe(false);
    expect(response.body.error).toBe("ASSIGNMENT_CONFLICT");
    expect(response.body.current).toMatchObject({ assignedTo: "c2" });
  });

  it("unassigns when requested by current owner", async () => {
    const alert = await createAlert();

    await request(app)
      .patch(`/clinician/alerts/${String(alert._id)}/assignment`)
      .send({ assignedTo: "c2", requestedBy: "c2" });

    vi.setSystemTime(new Date("2026-03-25T10:12:00.000Z"));

    const response = await request(app)
      .patch(`/clinician/alerts/${String(alert._id)}/assignment`)
      .send({ assignedTo: null, requestedBy: "c2" });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.alert.assignedTo).toBeNull();
    expect(response.body.alert.assignedToName).toBeNull();
    expect(response.body.alert.assignedAt).toBeNull();

    const events = await CareEvent.find({
      alertId: String(alert._id),
      type: "ALERT_ASSIGNED",
    })
      .sort({ createdAt: 1 })
      .lean();

    expect(events).toHaveLength(2);
    expect(events[1]?.payload).toMatchObject({
      action: "unassign",
      assignedTo: null,
      previousAssignedTo: "c2",
      requestedBy: "c2",
      force: false,
    });
  });

  it("returns 400 for invalid alert id", async () => {
    const response = await request(app)
      .patch("/clinician/alerts/not-an-id/assignment")
      .send({ assignedTo: "c1", requestedBy: "c1" });

    expect(response.status).toBe(400);
    expect(response.body.ok).toBe(false);
    expect(response.body.error).toBe("VALIDATION_ERROR");
  });

  it("returns 404 when alert does not exist", async () => {
    const missingId = new mongoose.Types.ObjectId().toString();

    const response = await request(app)
      .patch(`/clinician/alerts/${missingId}/assignment`)
      .send({ assignedTo: "c1", requestedBy: "c1" });

    expect(response.status).toBe(404);
    expect(response.body.ok).toBe(false);
    expect(response.body.error).toBe("NOT_FOUND");
  });
});
