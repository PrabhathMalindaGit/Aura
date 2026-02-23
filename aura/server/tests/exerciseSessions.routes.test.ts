import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";

import app from "../src/app";
import ExerciseSession from "../src/models/ExerciseSession";
import Patient from "../src/models/Patient";
import { signAuthToken } from "../src/utils/jwt";
import { signPatientToken } from "../src/utils/patientJwt";

describe("exercise session routes", () => {
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
    await Promise.all([ExerciseSession.deleteMany({}), Patient.deleteMany({})]);
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

  const validSessionPayload = {
    startedAt: "2026-02-23T08:00:00.000Z",
    endedAt: "2026-02-23T08:12:30.000Z",
    planVersion: 2,
    planTitle: "Lower limb strengthening",
    planDayOfWeek: 1,
    exercises: [
      {
        itemKey: "quad-set-1",
        nameSnapshot: "Quad set",
        order: 1,
        planned: { sets: 3, reps: 12, holdSeconds: 5 },
        completed: true,
        setsDone: 3,
        repsDone: 12,
        difficulty: "ok",
        painDuring: 2,
        note: "Felt steady throughout.",
        completedAt: "2026-02-23T08:04:00.000Z",
      },
      {
        itemKey: "heel-slide-1",
        nameSnapshot: "Heel slide",
        order: 2,
        planned: { sets: 3, reps: 10 },
        completed: false,
      },
    ],
  };

  it("patient can post a session and then list it", async () => {
    const token = patientToken("p1");

    const postResponse = await request(app)
      .post("/patient/exercise-sessions")
      .set("Authorization", `Bearer ${token}`)
      .send(validSessionPayload);

    expect(postResponse.status).toBe(200);
    expect(postResponse.body.ok).toBe(true);
    expect(typeof postResponse.body.sessionId).toBe("string");

    const listResponse = await request(app)
      .get("/patient/exercise-sessions?limit=20")
      .set("Authorization", `Bearer ${token}`);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.ok).toBe(true);
    expect(Array.isArray(listResponse.body.sessions)).toBe(true);
    expect(listResponse.body.sessions).toHaveLength(1);
    expect(listResponse.body.sessions[0]).toMatchObject({
      exerciseCount: 2,
      completedCount: 1,
      durationSeconds: 750,
      planTitle: "Lower limb strengthening",
      avgPainDuring: 2,
    });
  });

  it("patient cannot fetch another patient's session by id", async () => {
    const created = await ExerciseSession.create({
      patientId: "p2",
      planPatientId: "p2",
      startedAt: new Date("2026-02-23T08:00:00.000Z"),
      endedAt: new Date("2026-02-23T08:10:00.000Z"),
      durationSeconds: 600,
      exercises: [
        {
          itemKey: "ankle-pump-1",
          nameSnapshot: "Ankle pump",
          order: 1,
          completed: true,
          painDuring: 1,
        },
      ],
    });

    const token = patientToken("p1");
    const response = await request(app)
      .get(`/patient/exercise-sessions/${String(created._id)}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("NOT_FOUND");
  });

  it("clinician can list sessions for a patient", async () => {
    await ExerciseSession.insertMany([
      {
        patientId: "p1",
        planPatientId: "p1",
        startedAt: new Date("2026-02-23T08:00:00.000Z"),
        endedAt: new Date("2026-02-23T08:10:00.000Z"),
        durationSeconds: 600,
        exercises: [
          {
            itemKey: "quad-set-1",
            nameSnapshot: "Quad set",
            order: 1,
            completed: true,
            painDuring: 2,
          },
        ],
      },
      {
        patientId: "p2",
        planPatientId: "p2",
        startedAt: new Date("2026-02-23T09:00:00.000Z"),
        endedAt: new Date("2026-02-23T09:05:00.000Z"),
        durationSeconds: 300,
        exercises: [
          {
            itemKey: "march-1",
            nameSnapshot: "Seated march",
            order: 1,
            completed: true,
          },
        ],
      },
    ]);

    const response = await request(app)
      .get("/clinician/patients/p1/exercise-sessions")
      .set("Authorization", `Bearer ${clinicianToken()}`);

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.patientId).toBe("p1");
    expect(response.body.sessions).toHaveLength(1);
    expect(response.body.sessions[0].exerciseCount).toBe(1);
  });

  it("rejects invalid painDuring and missing itemKey", async () => {
    const token = patientToken("p1");

    const invalidPain = await request(app)
      .post("/patient/exercise-sessions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        ...validSessionPayload,
        exercises: [
          {
            ...validSessionPayload.exercises[0],
            painDuring: 8,
          },
        ],
      });

    expect(invalidPain.status).toBe(400);
    expect(invalidPain.body.error).toBe("VALIDATION_ERROR");

    const missingItemKey = await request(app)
      .post("/patient/exercise-sessions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        ...validSessionPayload,
        exercises: [
          {
            nameSnapshot: "Quad set",
            order: 1,
            completed: true,
          },
        ],
      });

    expect(missingItemKey.status).toBe(400);
    expect(missingItemKey.body.error).toBe("VALIDATION_ERROR");
  });

  it("truncates long note values to 280 characters", async () => {
    const token = patientToken("p1");
    const longNote = "x".repeat(400);

    const response = await request(app)
      .post("/patient/exercise-sessions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        ...validSessionPayload,
        exercises: [
          {
            ...validSessionPayload.exercises[0],
            note: longNote,
          },
        ],
      });

    expect(response.status).toBe(200);
    const created = await ExerciseSession.findById(response.body.sessionId).lean();
    expect(created).toBeTruthy();
    const note = Array.isArray(created?.exercises)
      ? (created?.exercises[0] as { note?: unknown })?.note
      : undefined;
    expect(typeof note).toBe("string");
    expect((note as string).length).toBe(280);
  });
});
