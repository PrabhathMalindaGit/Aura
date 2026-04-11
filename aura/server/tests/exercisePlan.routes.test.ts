import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";

import app from "../src/app";
import ExercisePlan from "../src/models/ExercisePlan";
import ExercisePlanRevision from "../src/models/ExercisePlanRevision";
import Patient from "../src/models/Patient";
import { signPatientToken } from "../src/utils/patientJwt";
import { signAuthToken } from "../src/utils/jwt";

describe("exercise plan routes", () => {
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
    await Promise.all([
      ExercisePlan.deleteMany({}),
      ExercisePlanRevision.deleteMany({}),
      Patient.deleteMany({}),
    ]);
    await Patient.insertMany([
      { patientId: "p1", displayName: "Patient One", status: "active" },
      { patientId: "p2", displayName: "Patient Two", status: "active" },
    ]);
  });

  function createClinicianToken(): string {
    return signAuthToken({
      id: "clinician-1",
      role: "clinician",
      email: "clinician@example.com",
      name: "Clinician One",
    });
  }

  it("patient can fetch today's plan and receives ordered items", async () => {
    await ExercisePlan.create({
      patientId: "p1",
      title: "Recovery Plan",
      daysOfWeek: [1, 3, 5],
      items: [
        {
          key: "heel-slide",
          name: "Heel slide",
          instructions: "Slide heel in slowly.",
          order: 2,
        },
        {
          key: "quad-set",
          name: "Quad set",
          instructions: "Tighten thigh and hold.",
          order: 1,
          sets: 3,
          reps: 10,
        },
      ],
      version: 1,
    });

    const token = signPatientToken({ id: "p1", displayName: "Patient One" });
    const response = await request(app)
      .get("/patient/exercise-plan/today?date=2026-02-23")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.patientId).toBe("p1");
    expect(response.body.dayOfWeek).toBe(1);
    expect(response.body.plan.title).toBe("Recovery Plan");
    expect(response.body.plan.items).toHaveLength(2);
    expect(response.body.plan.items[0].key).toBe("quad-set");
    expect(response.body.plan.items[1].key).toBe("heel-slide");
  });

  it("patient endpoint is scoped to req.patient.id only", async () => {
    await ExercisePlan.insertMany([
      {
        patientId: "p1",
        title: "Plan P1",
        daysOfWeek: [1, 2, 3],
        items: [
          {
            key: "p1-item",
            name: "P1 item",
            instructions: "P1",
            order: 1,
          },
        ],
      },
      {
        patientId: "p2",
        title: "Plan P2",
        daysOfWeek: [1, 2, 3],
        items: [
          {
            key: "p2-item",
            name: "P2 item",
            instructions: "P2",
            order: 1,
          },
        ],
      },
    ]);

    const token = signPatientToken({ id: "p1" });
    const response = await request(app)
      .get("/patient/exercise-plan/today")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.patientId).toBe("p1");
    expect(response.body.plan?.title).toBe("Plan P1");
    expect(response.body.plan?.title).not.toBe("Plan P2");
  });

  it("clinician can put and get exercise plan", async () => {
    const token = createClinicianToken();

    const putResponse = await request(app)
      .put("/clinician/patients/p1/exercise-plan")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "Strength Plan",
        daysOfWeek: [1, 3, 5],
        items: [
          {
            key: "sit-stand",
            name: "Sit to stand",
            instructions: "Stand up and sit down with control.",
            sets: 3,
            reps: 8,
            order: 1,
          },
        ],
      });

    expect(putResponse.status).toBe(200);
    expect(putResponse.body.ok).toBe(true);
    expect(putResponse.body.plan.title).toBe("Strength Plan");
    expect(putResponse.body.plan.version).toBe(1);
    expect(putResponse.body.plan.updatedBy).toMatchObject({
      clinicianId: "clinician-1",
      name: "Clinician One",
    });

    const getResponse = await request(app)
      .get("/clinician/patients/p1/exercise-plan")
      .set("Authorization", `Bearer ${token}`);

    expect(getResponse.status).toBe(200);
    expect(getResponse.body.ok).toBe(true);
    expect(getResponse.body.plan.title).toBe("Strength Plan");
    expect(getResponse.body.plan.items[0].key).toBe("sit-stand");
  });

  it("upserts one plan per patient and increments version", async () => {
    const token = createClinicianToken();
    const payload = {
      title: "Mobility Plan",
      daysOfWeek: [2, 4, 6],
      items: [
        {
          key: "ankle-pump",
          name: "Ankle pump",
          instructions: "Point and flex your foot.",
          order: 1,
        },
      ],
    };

    const first = await request(app)
      .put("/clinician/patients/p2/exercise-plan")
      .set("Authorization", `Bearer ${token}`)
      .send(payload);
    expect(first.status).toBe(200);
    expect(first.body.plan.version).toBe(1);

    const second = await request(app)
      .put("/clinician/patients/p2/exercise-plan")
      .set("Authorization", `Bearer ${token}`)
      .send({
        ...payload,
        title: "Updated Mobility Plan",
      });

    expect(second.status).toBe(200);
    expect(second.body.plan.version).toBe(2);
    expect(second.body.plan.title).toBe("Updated Mobility Plan");

    const docsCount = await ExercisePlan.countDocuments({ patientId: "p2" });
    expect(docsCount).toBe(1);
  });

  it("rejects invalid daysOfWeek and missing item fields", async () => {
    const token = createClinicianToken();

    const invalidDays = await request(app)
      .put("/clinician/patients/p1/exercise-plan")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "Invalid Plan",
        daysOfWeek: [9],
        items: [
          {
            key: "x",
            name: "Exercise",
            instructions: "Do it",
            order: 1,
          },
        ],
      });

    expect(invalidDays.status).toBe(400);
    expect(invalidDays.body.error).toBe("VALIDATION_ERROR");

    const missingField = await request(app)
      .put("/clinician/patients/p1/exercise-plan")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "Invalid Plan",
        daysOfWeek: [1],
        items: [
          {
            name: "Exercise without key",
            instructions: "Do it",
            order: 1,
          },
        ],
      });

    expect(missingField.status).toBe(400);
    expect(missingField.body.error).toBe("VALIDATION_ERROR");
  });

  it("returns revision history after clinician saves", async () => {
    const token = createClinicianToken();

    await request(app)
      .put("/clinician/patients/p1/exercise-plan")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "Strength Plan",
        daysOfWeek: [1, 3, 5],
        items: [
          {
            key: "sit-stand",
            name: "Sit to stand",
            instructions: "Stand up and sit down with control.",
            order: 1,
          },
        ],
      });

    const historyResponse = await request(app)
      .get("/clinician/patients/p1/exercise-plan/history")
      .set("Authorization", `Bearer ${token}`);

    expect(historyResponse.status).toBe(200);
    expect(historyResponse.body.ok).toBe(true);
    expect(historyResponse.body.items).toHaveLength(1);
    expect(historyResponse.body.items[0]).toMatchObject({
      version: 1,
      savedBy: {
        clinicianId: "clinician-1",
        name: "Clinician One",
      },
    });
    expect(historyResponse.body.items[0].snapshot.title).toBe("Strength Plan");
  });

  it("returns 409 when expectedVersion is stale", async () => {
    const token = createClinicianToken();

    const firstSave = await request(app)
      .put("/clinician/patients/p1/exercise-plan")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "Version one",
        daysOfWeek: [1, 3, 5],
        items: [
          {
            key: "sit-stand",
            name: "Sit to stand",
            instructions: "Stand up and sit down with control.",
            order: 1,
          },
        ],
      });

    expect(firstSave.status).toBe(200);

    const staleSave = await request(app)
      .put("/clinician/patients/p1/exercise-plan")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "Version two",
        expectedVersion: 0,
        daysOfWeek: [1, 3, 5],
        items: [
          {
            key: "sit-stand",
            name: "Sit to stand",
            instructions: "Stand up and sit down with control.",
            order: 1,
          },
        ],
      });

    expect(staleSave.status).toBe(409);
    expect(staleSave.body.error).toBe("VERSION_CONFLICT");
    expect(staleSave.body.currentVersion).toBe(1);
  });
});
