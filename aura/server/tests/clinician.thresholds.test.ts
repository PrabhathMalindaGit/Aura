import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";

import app from "../src/app";
import CareEvent from "../src/models/CareEvent";
import PatientThresholdConfig from "../src/models/PatientThresholdConfig";
import User from "../src/models/User";
import { signAuthToken } from "../src/utils/jwt";

describe("clinician patient thresholds routes", () => {
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
      CareEvent.deleteMany({}),
      PatientThresholdConfig.deleteMany({}),
      User.deleteMany({}),
    ]);
  });

  async function createClinicianToken(): Promise<string> {
    const clinician = await User.create({
      email: "clinician-1@example.com",
      passwordHash: "unused-password-hash",
      role: "clinician",
      displayName: "Clinician One",
      sessionVersion: 0,
    });

    return signAuthToken({
      id: String(clinician._id),
      role: "clinician",
      email: clinician.email,
      name: clinician.displayName,
      sessionVersion: clinician.sessionVersion ?? 0,
    });
  }

  it("returns defaults before any patient-specific threshold override is saved", async () => {
    const token = await createClinicianToken();

    const response = await request(app)
      .get("/clinician/patients/p1/thresholds")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.thresholds.patientId).toBe("p1");
    expect(response.body.thresholds.configured).toBe(false);
    expect(response.body.thresholds.version).toBe(0);
  });

  it("saves patient thresholds and writes an audit event", async () => {
    const token = await createClinicianToken();

    const response = await request(app)
      .put("/clinician/patients/p1/thresholds")
      .set("Authorization", `Bearer ${token}`)
      .send({
        painHighThreshold: 6,
        missedCheckinDays: 3,
        responseDelayHours: 36,
        safetyFlaggedResponseDelayHours: 8,
        rationale: "Recent recovery regression requires tighter review.",
      });

    expect(response.status).toBe(200);
    expect(response.body.thresholds).toMatchObject({
      patientId: "p1",
      painHighThreshold: 6,
      missedCheckinDays: 3,
      responseDelayHours: 36,
      safetyFlaggedResponseDelayHours: 8,
      rationale: "Recent recovery regression requires tighter review.",
      configured: true,
      version: 1,
    });

    const careEvent = await CareEvent.findOne({
      patientId: "p1",
      type: "PATIENT_THRESHOLD_UPDATED",
    }).lean();

    expect(careEvent).not.toBeNull();
    expect(careEvent?.payload).toMatchObject({
      rationale: "Recent recovery regression requires tighter review.",
      updatedByName: "Clinician One",
    });
  });
});
