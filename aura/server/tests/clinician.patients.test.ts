import mongoose from "mongoose";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";

import app from "../src/app";
import Alert from "../src/models/Alert";
import CheckIn from "../src/models/CheckIn";
import Patient from "../src/models/Patient";

describe("GET /clinician/patients", () => {
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
    vi.setSystemTime(new Date("2026-03-10T12:00:00.000Z"));

    await Promise.all([
      Alert.deleteMany({}),
      CheckIn.deleteMany({}),
      Patient.deleteMany({}),
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns aggregated summaries with profile enrichment and defaults", async () => {
    vi.setSystemTime(new Date("2026-03-09T10:00:00.000Z"));
    await CheckIn.create({
      patientId: "p1",
      date: "2026-03-09",
      mood: 4,
      pain: 5,
      adherence: {
        exercises: 0.6,
        medication: true,
      },
    });

    vi.setSystemTime(new Date("2026-03-01T08:00:00.000Z"));
    await CheckIn.create({
      patientId: "p2",
      date: "2026-03-01",
      mood: 2,
      pain: 8,
      adherence: {
        exercises: 0.1,
        medication: false,
      },
    });

    vi.setSystemTime(new Date("2026-03-10T12:00:00.000Z"));

    await Alert.create([
      {
        patientId: "p2",
        reason: "High pain",
        source: { type: "checkin", sourceId: "checkin-p2-1" },
        status: "open",
      },
      {
        patientId: "p2",
        reason: "Escalating symptoms",
        source: { type: "chat", sourceId: "chat-p2-1" },
        status: "open",
      },
      {
        patientId: "p1",
        reason: "Concerning trend",
        source: { type: "checkin", sourceId: "checkin-p1-1" },
        status: "open",
      },
    ]);

    await Patient.create({
      patientId: "p1",
      displayName: "Jordan Lee",
      status: "on_hold",
      clinicianId: "clin-1",
    });

    const response = await request(app).get("/clinician/patients");

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(Array.isArray(response.body.patients)).toBe(true);

    const patients = response.body.patients as Array<Record<string, unknown>>;
    expect(patients.length).toBe(2);
    expect(patients[0]?.id).toBe("p2");

    const p1Summary = patients.find((item) => item.id === "p1");
    const p2Summary = patients.find((item) => item.id === "p2");

    expect(p1Summary).toMatchObject({
      id: "p1",
      displayName: "Jordan Lee",
      status: "on_hold",
      clinicianId: "clin-1",
      openAlertCount: 1,
      missedCheckins: false,
    });

    expect(p2Summary).toMatchObject({
      id: "p2",
      status: "active",
      openAlertCount: 2,
      missedCheckins: true,
    });

    expect(typeof p1Summary?.lastCheckinAt).toBe("string");
    expect(typeof p2Summary?.lastCheckinAt).toBe("string");
    expect(p2Summary?.lastPain).toBe(8);
  });
});
