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
import Patient from "../src/models/Patient";

describe("PATCH /clinician/patients/:patientId", () => {
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
    vi.setSystemTime(new Date("2026-05-05T10:00:00.000Z"));

    await Promise.all([
      Alert.deleteMany({}),
      CareEvent.deleteMany({}),
      ChatMessage.deleteMany({}),
      CheckIn.deleteMany({}),
      Patient.deleteMany({}),
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("upserts and creates a new patient profile", async () => {
    const response = await request(app)
      .patch("/clinician/patients/p1")
      .send({ displayName: "Sam", status: "discharged" });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.patient).toMatchObject({
      patientId: "p1",
      displayName: "Sam",
      status: "discharged",
    });

    const patient = await Patient.findOne({ patientId: "p1" }).lean();
    expect(patient?.displayName).toBe("Sam");
    expect(patient?.status).toBe("discharged");

    const events = await CareEvent.find({
      patientId: "p1",
      type: "PATIENT_UPDATED",
    }).lean();
    expect(events).toHaveLength(1);
  });

  it("updates one field while preserving others", async () => {
    await request(app)
      .patch("/clinician/patients/p1")
      .send({ displayName: "Sam", status: "discharged" });

    const response = await request(app)
      .patch("/clinician/patients/p1")
      .send({ status: "active" });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.patient).toMatchObject({
      patientId: "p1",
      displayName: "Sam",
      status: "active",
    });
  });

  it("is idempotent and does not duplicate audit events", async () => {
    await request(app)
      .patch("/clinician/patients/p1")
      .send({ displayName: "Sam", status: "active" });

    const beforeCount = await CareEvent.countDocuments({
      patientId: "p1",
      type: "PATIENT_UPDATED",
    });

    const response = await request(app)
      .patch("/clinician/patients/p1")
      .send({ displayName: "Sam", status: "active" });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);

    const afterCount = await CareEvent.countDocuments({
      patientId: "p1",
      type: "PATIENT_UPDATED",
    });
    expect(afterCount).toBe(beforeCount);
  });

  it("returns 400 for invalid payloads", async () => {
    const emptyBody = await request(app).patch("/clinician/patients/p1").send({});
    expect(emptyBody.status).toBe(400);
    expect(emptyBody.body.error).toBe("VALIDATION_ERROR");

    const invalidStatus = await request(app)
      .patch("/clinician/patients/p1")
      .send({ status: "paused" });
    expect(invalidStatus.status).toBe(400);
    expect(invalidStatus.body.error).toBe("VALIDATION_ERROR");

    const emptyPatientId = await request(app)
      .patch("/clinician/patients/%20")
      .send({ status: "active" });
    expect(emptyPatientId.status).toBe(400);
    expect(emptyPatientId.body.error).toBe("VALIDATION_ERROR");
  });
});
