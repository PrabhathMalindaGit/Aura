import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";

import app from "../src/app";
import NutritionLog from "../src/models/NutritionLog";
import Patient from "../src/models/Patient";
import User from "../src/models/User";
import { signAuthToken } from "../src/utils/jwt";
import { signPatientToken } from "../src/utils/patientJwt";

describe("nutrition routes", () => {
  let mongoServer: MongoMemoryServer | null = null;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    await NutritionLog.init();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  beforeEach(async () => {
    await Promise.all([
      NutritionLog.deleteMany({}),
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

  it("patient can create nutrition log and get latest for today", async () => {
    const token = patientToken("p1");

    const first = await request(app)
      .post("/patient/nutrition/log")
      .set("Authorization", `Bearer ${token}`)
      .send({
        date: "2026-03-01",
        protein: "low",
        fruitVegServings: 2,
        antiInflammatoryFocus: false,
        mealRegularity: "irregular",
        appetite: "low",
        notes: "First note",
      });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post("/patient/nutrition/log")
      .set("Authorization", `Bearer ${token}`)
      .send({
        date: "2026-03-01",
        protein: "high",
        fruitVegServings: 5,
        antiInflammatoryFocus: true,
        mealRegularity: "regular",
        appetite: "normal",
        notes: "Second note",
      });
    expect(second.status).toBe(200);
    expect(second.body.ok).toBe(true);

    const today = await request(app)
      .get("/patient/nutrition/today?date=2026-03-01")
      .set("Authorization", `Bearer ${token}`);

    expect(today.status).toBe(200);
    expect(today.body.ok).toBe(true);
    expect(today.body.date).toBe("2026-03-01");
    expect(today.body.entry).toMatchObject({
      date: "2026-03-01",
      protein: "high",
      fruitVegServings: 5,
      antiInflammatoryFocus: true,
      mealRegularity: "regular",
      appetite: "normal",
      notes: "Second note",
    });
  });

  it("replays keyed nutrition requests without creating duplicates", async () => {
    const token = patientToken("p1");

    const first = await request(app)
      .post("/patient/nutrition/log")
      .set("Authorization", `Bearer ${token}`)
      .send({
        date: "2026-03-01",
        protein: "ok",
        fruitVegServings: 4,
        antiInflammatoryFocus: true,
        mealRegularity: "mostly",
        appetite: "normal",
        notes: "  Soup and fruit  ",
        clientMutationId: "nutrition-key-1",
      });
    const second = await request(app)
      .post("/patient/nutrition/log")
      .set("Authorization", `Bearer ${token}`)
      .send({
        date: "2026-03-01",
        protein: "ok",
        fruitVegServings: 4,
        antiInflammatoryFocus: true,
        mealRegularity: "mostly",
        appetite: "normal",
        notes: "Soup and fruit",
        clientMutationId: "nutrition-key-1",
      });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.id).toBe(first.body.id);
    expect(second.body.createdAt).toBe(first.body.createdAt);
    expect(await NutritionLog.countDocuments({ patientId: "p1" })).toBe(1);
  });

  it("returns 409 when a nutrition idempotency key is reused with different content", async () => {
    const token = patientToken("p1");

    const first = await request(app)
      .post("/patient/nutrition/log")
      .set("Authorization", `Bearer ${token}`)
      .send({
        date: "2026-03-01",
        protein: "low",
        fruitVegServings: 2,
        antiInflammatoryFocus: false,
        mealRegularity: "irregular",
        appetite: "low",
        notes: "First draft",
        clientMutationId: "nutrition-key-2",
      });
    const second = await request(app)
      .post("/patient/nutrition/log")
      .set("Authorization", `Bearer ${token}`)
      .send({
        date: "2026-03-01",
        protein: "high",
        fruitVegServings: 5,
        antiInflammatoryFocus: true,
        mealRegularity: "regular",
        appetite: "normal",
        notes: "Edited draft",
        clientMutationId: "nutrition-key-2",
      });

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    expect(second.body).toMatchObject({
      ok: false,
      error: "IDEMPOTENCY_CONFLICT",
    });
    expect(await NutritionLog.countDocuments({ patientId: "p1" })).toBe(1);
  });

  it("does not create two rows for concurrent duplicate keyed nutrition requests", async () => {
    const token = patientToken("p1");

    const [first, second] = await Promise.all([
      request(app)
        .post("/patient/nutrition/log")
        .set("Authorization", `Bearer ${token}`)
        .send({
          date: "2026-03-01",
          protein: "ok",
          fruitVegServings: 3,
          antiInflammatoryFocus: true,
          mealRegularity: "mostly",
          notes: "Concurrent",
          clientMutationId: "nutrition-race-1",
        }),
      request(app)
        .post("/patient/nutrition/log")
        .set("Authorization", `Bearer ${token}`)
        .send({
          date: "2026-03-01",
          protein: "ok",
          fruitVegServings: 3,
          antiInflammatoryFocus: true,
          mealRegularity: "mostly",
          notes: "Concurrent",
          clientMutationId: "nutrition-race-1",
        }),
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await NutritionLog.countDocuments({ patientId: "p1" })).toBe(1);
  });

  it("range returns per-day latest entries and null for missing days", async () => {
    await NutritionLog.insertMany([
      {
        patientId: "p1",
        date: "2026-03-01",
        protein: "ok",
        fruitVegServings: 3,
        antiInflammatoryFocus: true,
        mealRegularity: "mostly",
        source: "manual",
        createdAt: new Date("2026-03-01T08:00:00.000Z"),
      },
      {
        patientId: "p1",
        date: "2026-03-03",
        protein: "low",
        fruitVegServings: 1,
        antiInflammatoryFocus: false,
        mealRegularity: "irregular",
        source: "manual",
        createdAt: new Date("2026-03-03T07:00:00.000Z"),
      },
      {
        patientId: "p1",
        date: "2026-03-03",
        protein: "high",
        fruitVegServings: 5,
        antiInflammatoryFocus: true,
        mealRegularity: "regular",
        source: "manual",
        createdAt: new Date("2026-03-03T11:00:00.000Z"),
      },
    ]);

    const response = await request(app)
      .get("/patient/nutrition/range?from=2026-03-01&to=2026-03-03")
      .set("Authorization", `Bearer ${patientToken("p1")}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      ok: true,
      from: "2026-03-01",
      to: "2026-03-03",
    });
    expect(response.body.days).toEqual([
      {
        date: "2026-03-01",
        entry: expect.objectContaining({
          protein: "ok",
          fruitVegServings: 3,
        }),
      },
      { date: "2026-03-02", entry: null },
      {
        date: "2026-03-03",
        entry: expect.objectContaining({
          protein: "high",
          fruitVegServings: 5,
          antiInflammatoryFocus: true,
        }),
      },
    ]);
  });

  it("validates enums and servings range", async () => {
    const token = patientToken("p1");

    const invalidEnum = await request(app)
      .post("/patient/nutrition/log")
      .set("Authorization", `Bearer ${token}`)
      .send({
        date: "2026-03-01",
        protein: "bad",
        fruitVegServings: 3,
        antiInflammatoryFocus: true,
        mealRegularity: "regular",
      });
    expect(invalidEnum.status).toBe(400);
    expect(invalidEnum.body.error).toBe("VALIDATION_ERROR");

    const invalidServings = await request(app)
      .post("/patient/nutrition/log")
      .set("Authorization", `Bearer ${token}`)
      .send({
        date: "2026-03-01",
        protein: "ok",
        fruitVegServings: 7,
        antiInflammatoryFocus: true,
        mealRegularity: "regular",
      });
    expect(invalidServings.status).toBe(400);
    expect(invalidServings.body.error).toBe("VALIDATION_ERROR");
  });

  it("patient cannot delete another patient's nutrition entry", async () => {
    const foreign = await NutritionLog.create({
      patientId: "p2",
      date: "2026-03-01",
      protein: "ok",
      fruitVegServings: 4,
      antiInflammatoryFocus: true,
      mealRegularity: "mostly",
      source: "manual",
    });

    const response = await request(app)
      .delete(`/patient/nutrition/entries/${String(foreign._id)}`)
      .set("Authorization", `Bearer ${patientToken("p1")}`);

    expect(response.status).toBe(404);
    const stillExists = await NutritionLog.exists({ _id: foreign._id });
    expect(stillExists).toBeTruthy();
  });

  it("clinician can fetch nutrition range for a patient", async () => {
    await NutritionLog.insertMany([
      {
        patientId: "p1",
        date: "2026-03-01",
        protein: "low",
        fruitVegServings: 1,
        antiInflammatoryFocus: false,
        mealRegularity: "irregular",
        source: "manual",
      },
      {
        patientId: "p1",
        date: "2026-03-02",
        protein: "ok",
        fruitVegServings: 4,
        antiInflammatoryFocus: true,
        mealRegularity: "mostly",
        source: "manual",
      },
    ]);

    const response = await request(app)
      .get("/clinician/patients/p1/nutrition/range?from=2026-03-01&to=2026-03-03")
      .set("Authorization", `Bearer ${clinicianToken()}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      ok: true,
      patientId: "p1",
      from: "2026-03-01",
      to: "2026-03-03",
    });
    expect(response.body.days).toEqual([
      {
        date: "2026-03-01",
        entry: expect.objectContaining({ protein: "low", fruitVegServings: 1 }),
      },
      {
        date: "2026-03-02",
        entry: expect.objectContaining({ protein: "ok", fruitVegServings: 4 }),
      },
      {
        date: "2026-03-03",
        entry: null,
      },
    ]);
  });
});
