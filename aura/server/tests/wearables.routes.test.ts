import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";

import app from "../src/app";
import Patient from "../src/models/Patient";
import WearableDaily from "../src/models/WearableDaily";
import { signAuthToken } from "../src/utils/jwt";
import { signPatientToken } from "../src/utils/patientJwt";

describe("wearables routes", () => {
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
    await Promise.all([WearableDaily.deleteMany({}), Patient.deleteMany({})]);
    await Patient.insertMany([
      { patientId: "p1", displayName: "Patient One", status: "active" },
      { patientId: "p2", displayName: "Patient Two", status: "active" },
    ]);
  });

  function patientToken(patientId: string): string {
    return signPatientToken({ id: patientId, displayName: `Patient ${patientId}` });
  }

  function clinicianToken(): string {
    return signAuthToken({
      id: "clinician-1",
      role: "clinician",
      email: "clinician@example.com",
      name: "Clinician One",
    });
  }

  it("bulk upsert works and is idempotent for patient daily wearables", async () => {
    const token = patientToken("p1");
    const first = await request(app)
      .post("/patient/wearables/daily/bulk")
      .set("Authorization", `Bearer ${token}`)
      .send({
        source: "mock",
        days: [
          { date: "2026-03-01", steps: 3200, activeMinutes: 22, restingHr: 76 },
          { date: "2026-03-02", steps: 4500, activeMinutes: 30, restingHr: 74 },
        ],
      });

    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({
      ok: true,
      source: "mock",
      upserted: 2,
      updated: 0,
    });

    const second = await request(app)
      .post("/patient/wearables/daily/bulk")
      .set("Authorization", `Bearer ${token}`)
      .send({
        source: "mock",
        days: [
          { date: "2026-03-01", steps: 3500, activeMinutes: 24, restingHr: 75 },
          { date: "2026-03-02", steps: 4500, activeMinutes: 30, restingHr: 74 },
        ],
      });

    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({
      ok: true,
      source: "mock",
      upserted: 0,
      updated: 2,
    });

    const count = await WearableDaily.countDocuments({ patientId: "p1", source: "mock" });
    expect(count).toBe(2);

    const daily = await request(app)
      .get("/patient/wearables/daily?from=2026-03-01&to=2026-03-02&source=mock")
      .set("Authorization", `Bearer ${token}`);

    expect(daily.status).toBe(200);
    expect(daily.body.days).toEqual([
      { date: "2026-03-01", steps: 3500, activeMinutes: 24, restingHr: 75 },
      { date: "2026-03-02", steps: 4500, activeMinutes: 30, restingHr: 74 },
    ]);
  });

  it("patient endpoints remain scoped to signed-in patient", async () => {
    await WearableDaily.insertMany([
      {
        patientId: "p1",
        source: "mock",
        date: "2026-03-01",
        steps: 5000,
        activeMinutes: 35,
      },
      {
        patientId: "p2",
        source: "mock",
        date: "2026-03-01",
        steps: 9000,
        activeMinutes: 65,
      },
    ]);

    const p1Summary = await request(app)
      .get("/patient/wearables/summary?from=2026-03-01&to=2026-03-01&source=mock")
      .set("Authorization", `Bearer ${patientToken("p1")}`);
    const p2Summary = await request(app)
      .get("/patient/wearables/summary?from=2026-03-01&to=2026-03-01&source=mock")
      .set("Authorization", `Bearer ${patientToken("p2")}`);

    expect(p1Summary.status).toBe(200);
    expect(p1Summary.body.totalSteps).toBe(5000);
    expect(p2Summary.status).toBe(200);
    expect(p2Summary.body.totalSteps).toBe(9000);
  });

  it("patient summary computes expected totals and averages", async () => {
    await WearableDaily.insertMany([
      {
        patientId: "p1",
        source: "mock",
        date: "2026-03-01",
        steps: 3000,
        activeMinutes: 20,
        restingHr: 80,
      },
      {
        patientId: "p1",
        source: "mock",
        date: "2026-03-02",
        steps: 5000,
        activeMinutes: 40,
        restingHr: 70,
      },
      {
        patientId: "p1",
        source: "mock",
        date: "2026-03-03",
        steps: 4000,
        activeMinutes: 30,
      },
    ]);

    const summary = await request(app)
      .get("/patient/wearables/summary?from=2026-03-01&to=2026-03-03&source=mock")
      .set("Authorization", `Bearer ${patientToken("p1")}`);

    expect(summary.status).toBe(200);
    expect(summary.body).toMatchObject({
      ok: true,
      source: "mock",
      trackedDays: 3,
      avgSteps: 4000,
      avgActiveMinutes: 30,
      avgRestingHr: 75,
      totalSteps: 12000,
      totalActiveMinutes: 90,
    });
  });

  it("clinician can fetch patient wearables summary and daily range", async () => {
    await WearableDaily.insertMany([
      {
        patientId: "p1",
        source: "mock",
        date: "2026-03-01",
        steps: 3000,
        activeMinutes: 20,
      },
      {
        patientId: "p1",
        source: "mock",
        date: "2026-03-02",
        steps: 4500,
        activeMinutes: 32,
      },
      {
        patientId: "p2",
        source: "mock",
        date: "2026-03-01",
        steps: 9000,
        activeMinutes: 60,
      },
    ]);

    const summary = await request(app)
      .get("/clinician/patients/p1/wearables/summary?from=2026-03-01&to=2026-03-02&source=mock")
      .set("Authorization", `Bearer ${clinicianToken()}`);
    expect(summary.status).toBe(200);
    expect(summary.body).toMatchObject({
      ok: true,
      patientId: "p1",
      trackedDays: 2,
      totalSteps: 7500,
      totalActiveMinutes: 52,
    });

    const daily = await request(app)
      .get("/clinician/patients/p1/wearables/daily?from=2026-03-01&to=2026-03-02&source=mock")
      .set("Authorization", `Bearer ${clinicianToken()}`);
    expect(daily.status).toBe(200);
    expect(daily.body.days).toEqual([
      { date: "2026-03-01", steps: 3000, activeMinutes: 20 },
      { date: "2026-03-02", steps: 4500, activeMinutes: 32 },
    ]);
  });

  it("validates wearable payload ranges and metric presence", async () => {
    const response = await request(app)
      .post("/patient/wearables/daily/bulk")
      .set("Authorization", `Bearer ${patientToken("p1")}`)
      .send({
        source: "mock",
        days: [
          { date: "2026-03-01", steps: 120000 },
          { date: "2026-03-02" },
        ],
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("VALIDATION_ERROR");
  });
});
