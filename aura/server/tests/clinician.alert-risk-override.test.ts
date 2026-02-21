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

describe("PATCH /clinician/alerts/:id/risk-override", () => {
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
    vi.setSystemTime(new Date("2026-03-30T10:00:00.000Z"));

    await Promise.all([Alert.deleteMany({}), CareEvent.deleteMany({})]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function createAlert() {
    return Alert.create({
      patientId: "p1",
      reason: "PAIN_GE_7",
      source: { type: "checkin", sourceId: "source-1" },
      status: "open",
    });
  }

  it("applies risk override and writes audit event", async () => {
    const alert = await createAlert();

    const response = await request(app)
      .patch(`/clinician/alerts/${String(alert._id)}/risk-override`)
      .send({
        riskFinal: "medium",
        overrideReason: "Pain is improving",
        overriddenBy: "c1",
        overriddenByName: "Dr One",
      });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.alert.riskFinal).toBe("medium");
    expect(response.body.alert.overrideReason).toBe("Pain is improving");
    expect(response.body.alert.overriddenBy).toBe("c1");
    expect(typeof response.body.alert.overriddenAt).toBe("string");

    const events = await CareEvent.find({
      alertId: String(alert._id),
      type: "ALERT_RISK_OVERRIDDEN",
    }).lean();

    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toMatchObject({
      riskFinal: "medium",
      overrideReason: "Pain is improving",
      overriddenBy: "c1",
      previousRiskFinal: null,
      previousOverrideReason: null,
    });
  });

  it("returns 400 when overrideReason is missing/blank", async () => {
    const alert = await createAlert();

    const response = await request(app)
      .patch(`/clinician/alerts/${String(alert._id)}/risk-override`)
      .send({
        riskFinal: "medium",
        overrideReason: "  ",
        overriddenBy: "c1",
      });

    expect(response.status).toBe(400);
    expect(response.body.ok).toBe(false);
    expect(response.body.error).toBe("VALIDATION_ERROR");
  });

  it("is idempotent for the same override payload", async () => {
    const alert = await createAlert();

    const first = await request(app)
      .patch(`/clinician/alerts/${String(alert._id)}/risk-override`)
      .send({
        riskFinal: "medium",
        overrideReason: "Pain is improving",
        overriddenBy: "c1",
      });

    vi.setSystemTime(new Date("2026-03-30T10:15:00.000Z"));

    const second = await request(app)
      .patch(`/clinician/alerts/${String(alert._id)}/risk-override`)
      .send({
        riskFinal: "medium",
        overrideReason: "Pain is improving",
        overriddenBy: "c1",
      });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.alert.overriddenAt).toBe(first.body.alert.overriddenAt);

    const events = await CareEvent.find({
      alertId: String(alert._id),
      type: "ALERT_RISK_OVERRIDDEN",
    }).lean();

    expect(events).toHaveLength(1);
  });

  it("writes a new audit event when override changes", async () => {
    const alert = await createAlert();

    await request(app)
      .patch(`/clinician/alerts/${String(alert._id)}/risk-override`)
      .send({
        riskFinal: "medium",
        overrideReason: "Pain is improving",
        overriddenBy: "c1",
      });

    vi.setSystemTime(new Date("2026-03-30T10:30:00.000Z"));

    const response = await request(app)
      .patch(`/clinician/alerts/${String(alert._id)}/risk-override`)
      .send({
        riskFinal: "high",
        overrideReason: "Worsening symptoms reported",
        overriddenBy: "c1",
      });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.alert.riskFinal).toBe("high");

    const events = await CareEvent.find({
      alertId: String(alert._id),
      type: "ALERT_RISK_OVERRIDDEN",
    })
      .sort({ createdAt: 1 })
      .lean();

    expect(events).toHaveLength(2);
    expect(events[1]?.payload).toMatchObject({
      riskFinal: "high",
      previousRiskFinal: "medium",
      previousOverrideReason: "Pain is improving",
    });
  });

  it("returns 400 for invalid alert id", async () => {
    const response = await request(app)
      .patch("/clinician/alerts/not-an-id/risk-override")
      .send({
        riskFinal: "high",
        overrideReason: "Needs immediate escalation",
        overriddenBy: "c1",
      });

    expect(response.status).toBe(400);
    expect(response.body.ok).toBe(false);
    expect(response.body.error).toBe("VALIDATION_ERROR");
  });

  it("returns 404 when alert does not exist", async () => {
    const missingId = new mongoose.Types.ObjectId().toString();

    const response = await request(app)
      .patch(`/clinician/alerts/${missingId}/risk-override`)
      .send({
        riskFinal: "high",
        overrideReason: "Needs immediate escalation",
        overriddenBy: "c1",
      });

    expect(response.status).toBe(404);
    expect(response.body.ok).toBe(false);
    expect(response.body.error).toBe("NOT_FOUND");
  });
});
