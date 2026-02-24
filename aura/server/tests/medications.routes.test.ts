import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";

import app from "../src/app";
import Medication from "../src/models/Medication";
import MedicationLog from "../src/models/MedicationLog";
import MedicationSchedule from "../src/models/MedicationSchedule";
import Patient from "../src/models/Patient";
import { signAuthToken } from "../src/utils/jwt";
import { signPatientToken } from "../src/utils/patientJwt";

describe("medications routes", () => {
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
      Medication.deleteMany({}),
      MedicationSchedule.deleteMany({}),
      MedicationLog.deleteMany({}),
      Patient.deleteMany({}),
    ]);
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

  it("patient medications returns only own active medications", async () => {
    const [p1Medication] = await Medication.insertMany([
      {
        patientId: "p1",
        name: "Ibuprofen",
        type: "medication",
        instructions: "Take as prescribed.",
        active: true,
      },
      {
        patientId: "p2",
        name: "Magnesium",
        type: "supplement",
        active: true,
      },
    ]);

    await MedicationSchedule.insertMany([
      {
        patientId: "p1",
        medicationId: p1Medication._id,
        times: ["08:00", "20:00"],
      },
    ]);

    const response = await request(app)
      .get("/patient/medications")
      .set("Authorization", `Bearer ${patientToken("p1")}`);

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.medications).toHaveLength(1);
    expect(response.body.medications[0]).toMatchObject({
      name: "Ibuprofen",
      type: "medication",
      schedule: {
        times: ["08:00", "20:00"],
      },
    });
  });

  it("today checklist includes due/taken/skipped status", async () => {
    const [p1Medication] = await Medication.insertMany([
      {
        patientId: "p1",
        name: "Ibuprofen",
        type: "medication",
        active: true,
      },
    ]);

    await MedicationSchedule.create({
      patientId: "p1",
      medicationId: p1Medication._id,
      times: ["08:00", "20:00"],
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    });

    await MedicationLog.create({
      patientId: "p1",
      medicationId: p1Medication._id,
      date: "2026-03-01",
      time: "08:00",
      status: "taken",
    });

    const response = await request(app)
      .get("/patient/medications/today?date=2026-03-01")
      .set("Authorization", `Bearer ${patientToken("p1")}`);

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].doses).toEqual([
      expect.objectContaining({ time: "08:00", status: "taken" }),
      expect.objectContaining({ time: "20:00", status: "due" }),
    ]);
  });

  it("patient POST log upserts the same dose key", async () => {
    const medication = await Medication.create({
      patientId: "p1",
      name: "Ibuprofen",
      type: "medication",
      active: true,
    });

    const first = await request(app)
      .post("/patient/medications/log")
      .set("Authorization", `Bearer ${patientToken("p1")}`)
      .send({
        medicationId: String(medication._id),
        date: "2026-03-01",
        time: "08:00",
        status: "taken",
      });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post("/patient/medications/log")
      .set("Authorization", `Bearer ${patientToken("p1")}`)
      .send({
        medicationId: String(medication._id),
        date: "2026-03-01",
        time: "08:00",
        status: "skipped",
      });
    expect(second.status).toBe(200);
    expect(second.body.status).toBe("skipped");

    const logs = await MedicationLog.find({
      patientId: "p1",
      medicationId: medication._id,
      date: "2026-03-01",
      time: "08:00",
    }).lean();
    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe("skipped");
  });

  it("patient cannot log dose for another patient's medication", async () => {
    const foreignMedication = await Medication.create({
      patientId: "p2",
      name: "Foreign med",
      type: "medication",
      active: true,
    });

    const response = await request(app)
      .post("/patient/medications/log")
      .set("Authorization", `Bearer ${patientToken("p1")}`)
      .send({
        medicationId: String(foreignMedication._id),
        date: "2026-03-01",
        time: "08:00",
        status: "taken",
      });

    expect(response.status).toBe(404);
    const count = await MedicationLog.countDocuments({});
    expect(count).toBe(0);
  });

  it("patient adherence range returns daily counts", async () => {
    const medication = await Medication.create({
      patientId: "p1",
      name: "Ibuprofen",
      type: "medication",
      active: true,
    });

    await MedicationSchedule.create({
      patientId: "p1",
      medicationId: medication._id,
      times: ["08:00", "20:00"],
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    });

    await MedicationLog.insertMany([
      {
        patientId: "p1",
        medicationId: medication._id,
        date: "2026-03-01",
        time: "08:00",
        status: "taken",
      },
      {
        patientId: "p1",
        medicationId: medication._id,
        date: "2026-03-02",
        time: "20:00",
        status: "skipped",
      },
    ]);

    const response = await request(app)
      .get("/patient/medications/logs/range?from=2026-03-01&to=2026-03-03")
      .set("Authorization", `Bearer ${patientToken("p1")}`);

    expect(response.status).toBe(200);
    expect(response.body.days).toEqual([
      { date: "2026-03-01", taken: 1, skipped: 0, totalScheduled: 2 },
      { date: "2026-03-02", taken: 0, skipped: 1, totalScheduled: 2 },
      { date: "2026-03-03", taken: 0, skipped: 0, totalScheduled: 2 },
    ]);
  });

  it("clinician can fetch medications and adherence range for a patient", async () => {
    const medication = await Medication.create({
      patientId: "p1",
      name: "Ibuprofen",
      type: "medication",
      active: true,
    });
    await MedicationSchedule.create({
      patientId: "p1",
      medicationId: medication._id,
      times: ["08:00"],
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    });
    await MedicationLog.create({
      patientId: "p1",
      medicationId: medication._id,
      date: "2026-03-01",
      time: "08:00",
      status: "taken",
    });

    const medicationsResponse = await request(app)
      .get("/clinician/patients/p1/medications")
      .set("Authorization", `Bearer ${clinicianToken()}`);
    expect(medicationsResponse.status).toBe(200);
    expect(medicationsResponse.body.medications).toHaveLength(1);

    const adherenceResponse = await request(app)
      .get("/clinician/patients/p1/medications/adherence?from=2026-03-01&to=2026-03-02")
      .set("Authorization", `Bearer ${clinicianToken()}`);
    expect(adherenceResponse.status).toBe(200);
    expect(adherenceResponse.body.days).toEqual([
      { date: "2026-03-01", taken: 1, skipped: 0, totalScheduled: 1 },
      { date: "2026-03-02", taken: 0, skipped: 0, totalScheduled: 1 },
    ]);
  });
});
