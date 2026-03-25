import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";

import app from "../src/app";
import HydrationLog from "../src/models/HydrationLog";
import Patient from "../src/models/Patient";
import User from "../src/models/User";
import { signAuthToken } from "../src/utils/jwt";
import { signPatientToken } from "../src/utils/patientJwt";

describe("hydration routes", () => {
  let mongoServer: MongoMemoryServer | null = null;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    await HydrationLog.init();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  beforeEach(async () => {
    await Promise.all([
      HydrationLog.deleteMany({}),
      Patient.deleteMany({}),
      User.deleteMany({}),
    ]);
    await Patient.insertMany([
      { patientId: "p1", displayName: "Patient One", status: "active" },
      { patientId: "p2", displayName: "Patient Two", status: "active" },
    ]);
    await User.create({
      _id: new mongoose.Types.ObjectId("507f1f77bcf86cd799439011"),
      email: "clinician@example.com",
      passwordHash: "hashed-password",
      role: "clinician",
      displayName: "Clinician One",
      sessionVersion: 0,
    });
  });

  function patientToken(patientId: string): string {
    return signPatientToken({ id: patientId, displayName: `Patient ${patientId}` });
  }

  function clinicianToken(): string {
    return signAuthToken({
      id: "507f1f77bcf86cd799439011",
      role: "clinician",
      email: "clinician@example.com",
      name: "Clinician One",
    });
  }

  it("patient can log hydration and read today's total", async () => {
    const token = patientToken("p1");

    const postOne = await request(app)
      .post("/patient/hydration/log")
      .set("Authorization", `Bearer ${token}`)
      .send({ date: "2026-03-01", amountMl: 250 });
    expect(postOne.status).toBe(200);
    expect(postOne.body.ok).toBe(true);

    const postTwo = await request(app)
      .post("/patient/hydration/log")
      .set("Authorization", `Bearer ${token}`)
      .send({ date: "2026-03-01", amountMl: 500 });
    expect(postTwo.status).toBe(200);

    await HydrationLog.create({
      patientId: "p2",
      date: "2026-03-01",
      amountMl: 900,
      source: "manual",
    });

    const today = await request(app)
      .get("/patient/hydration/today?date=2026-03-01")
      .set("Authorization", `Bearer ${token}`);

    expect(today.status).toBe(200);
    expect(today.body).toMatchObject({
      ok: true,
      date: "2026-03-01",
      totalMl: 750,
      targetMl: 2000,
    });
    expect(Array.isArray(today.body.entries)).toBe(true);
    expect(today.body.entries).toHaveLength(2);
  });

  it("replays keyed hydration requests without creating duplicates", async () => {
    const token = patientToken("p1");

    const first = await request(app)
      .post("/patient/hydration/log")
      .set("Authorization", `Bearer ${token}`)
      .send({
        date: "2026-03-01",
        amountMl: 250,
        clientMutationId: "hydration-key-1",
      });
    const second = await request(app)
      .post("/patient/hydration/log")
      .set("Authorization", `Bearer ${token}`)
      .send({
        date: "2026-03-01",
        amountMl: 250,
        clientMutationId: "hydration-key-1",
      });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.id).toBe(first.body.id);
    expect(second.body.createdAt).toBe(first.body.createdAt);
    expect(await HydrationLog.countDocuments({ patientId: "p1" })).toBe(1);
  });

  it("returns 409 when a hydration idempotency key is reused with different content", async () => {
    const token = patientToken("p1");

    const first = await request(app)
      .post("/patient/hydration/log")
      .set("Authorization", `Bearer ${token}`)
      .send({
        date: "2026-03-01",
        amountMl: 250,
        clientMutationId: "hydration-key-2",
      });
    const second = await request(app)
      .post("/patient/hydration/log")
      .set("Authorization", `Bearer ${token}`)
      .send({
        date: "2026-03-01",
        amountMl: 500,
        clientMutationId: "hydration-key-2",
      });

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    expect(second.body).toMatchObject({
      ok: false,
      error: "IDEMPOTENCY_CONFLICT",
    });
    expect(await HydrationLog.countDocuments({ patientId: "p1" })).toBe(1);
  });

  it("does not create two rows for concurrent duplicate keyed hydration requests", async () => {
    const token = patientToken("p1");

    const [first, second] = await Promise.all([
      request(app)
        .post("/patient/hydration/log")
        .set("Authorization", `Bearer ${token}`)
        .send({
          date: "2026-03-01",
          amountMl: 350,
          clientMutationId: "hydration-race-1",
        }),
      request(app)
        .post("/patient/hydration/log")
        .set("Authorization", `Bearer ${token}`)
        .send({
          date: "2026-03-01",
          amountMl: 350,
          clientMutationId: "hydration-race-1",
        }),
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await HydrationLog.countDocuments({ patientId: "p1" })).toBe(1);
  });

  it("validates hydration log payload", async () => {
    const token = patientToken("p1");

    const invalidAmount = await request(app)
      .post("/patient/hydration/log")
      .set("Authorization", `Bearer ${token}`)
      .send({ date: "2026-03-01", amountMl: 9 });
    expect(invalidAmount.status).toBe(400);
    expect(invalidAmount.body.error).toBe("VALIDATION_ERROR");

    const invalidDate = await request(app)
      .post("/patient/hydration/log")
      .set("Authorization", `Bearer ${token}`)
      .send({ date: "2026-13-99", amountMl: 250 });
    expect(invalidDate.status).toBe(400);
    expect(invalidDate.body.error).toBe("VALIDATION_ERROR");
  });

  it("range endpoint returns inclusive daily totals", async () => {
    await HydrationLog.insertMany([
      {
        patientId: "p1",
        date: "2026-03-01",
        amountMl: 250,
        source: "manual",
      },
      {
        patientId: "p1",
        date: "2026-03-03",
        amountMl: 500,
        source: "manual",
      },
    ]);

    const response = await request(app)
      .get("/patient/hydration/range?from=2026-03-01&to=2026-03-03")
      .set("Authorization", `Bearer ${patientToken("p1")}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      ok: true,
      from: "2026-03-01",
      to: "2026-03-03",
      targetMl: 2000,
    });
    expect(response.body.days).toEqual([
      { date: "2026-03-01", totalMl: 250, metTarget: false },
      { date: "2026-03-02", totalMl: 0, metTarget: false },
      { date: "2026-03-03", totalMl: 500, metTarget: false },
    ]);
  });

  it("patient cannot delete another patient's hydration entry", async () => {
    const foreign = await HydrationLog.create({
      patientId: "p2",
      date: "2026-03-01",
      amountMl: 300,
      source: "manual",
    });

    const response = await request(app)
      .delete(`/patient/hydration/entries/${String(foreign._id)}`)
      .set("Authorization", `Bearer ${patientToken("p1")}`);

    expect(response.status).toBe(404);
    const stillExists = await HydrationLog.exists({ _id: foreign._id });
    expect(stillExists).toBeTruthy();
  });

  it("clinician can fetch hydration range for a patient", async () => {
    await HydrationLog.insertMany([
      {
        patientId: "p1",
        date: "2026-03-02",
        amountMl: 1500,
        source: "manual",
      },
      {
        patientId: "p1",
        date: "2026-03-02",
        amountMl: 600,
        source: "manual",
      },
    ]);

    const response = await request(app)
      .get("/clinician/patients/p1/hydration/range?from=2026-03-01&to=2026-03-03")
      .set("Authorization", `Bearer ${clinicianToken()}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      ok: true,
      patientId: "p1",
      from: "2026-03-01",
      to: "2026-03-03",
      targetMl: 2000,
    });
    expect(response.body.days).toEqual([
      { date: "2026-03-01", totalMl: 0, metTarget: false },
      { date: "2026-03-02", totalMl: 2100, metTarget: true },
      { date: "2026-03-03", totalMl: 0, metTarget: false },
    ]);
  });
});
