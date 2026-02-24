import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";

import app from "../src/app";
import Patient from "../src/models/Patient";
import { buildDefaultPhases, recomputePhaseStatuses } from "../src/services/rehabPhaseService";
import { signAuthToken } from "../src/utils/jwt";
import { signPatientToken } from "../src/utils/patientJwt";

describe("rehab phase routes", () => {
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
    await Patient.deleteMany({});

    const now = new Date("2026-02-24T09:00:00.000Z");
    await Patient.insertMany([
      {
        patientId: "p1",
        displayName: "Patient One",
        status: "active",
      },
      {
        patientId: "p2",
        displayName: "Patient Two",
        status: "active",
        rehab: {
          ...recomputePhaseStatuses(buildDefaultPhases(), "phase-strength", now),
          updatedAt: now,
          updatedBy: {
            clinicianId: "clinician-1",
            name: "Clinician One",
          },
        },
      },
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

  it("patient GET returns own rehab phases and auto-initializes defaults", async () => {
    const response = await request(app)
      .get("/patient/rehab-phases")
      .set("Authorization", `Bearer ${patientToken("p1")}`);

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.patientId).toBe("p1");
    expect(response.body.rehab.currentKey).toBe("phase-early");
    expect(Array.isArray(response.body.rehab.phases)).toBe(true);
    expect(response.body.rehab.phases.length).toBeGreaterThanOrEqual(4);

    const p1Doc = await Patient.findOne({ patientId: "p1" }).lean();
    expect(p1Doc?.rehab?.currentKey).toBe("phase-early");
  });

  it("clinician PATCH updates currentKey and recomputes statuses", async () => {
    const patchResponse = await request(app)
      .patch("/clinician/patients/p2/rehab-phase")
      .set("Authorization", `Bearer ${clinicianToken()}`)
      .send({ currentKey: "phase-return" });

    expect(patchResponse.status).toBe(200);
    expect(patchResponse.body.ok).toBe(true);
    expect(patchResponse.body.rehab.currentKey).toBe("phase-return");

    const statuses = new Map(
      patchResponse.body.rehab.phases.map((phase: { key: string; status: string }) => [
        phase.key,
        phase.status,
      ])
    );
    expect(statuses.get("phase-early")).toBe("done");
    expect(statuses.get("phase-strength")).toBe("done");
    expect(statuses.get("phase-return")).toBe("current");
    expect(statuses.get("phase-maintain")).toBe("locked");
    expect(patchResponse.body.rehab.updatedBy).toMatchObject({
      clinicianId: "clinician-1",
      name: "Clinician One",
    });

    const getResponse = await request(app)
      .get("/clinician/patients/p2/rehab-phases")
      .set("Authorization", `Bearer ${clinicianToken()}`);

    expect(getResponse.status).toBe(200);
    expect(getResponse.body.rehab.currentKey).toBe("phase-return");
  });

  it("patient cannot update rehab phases through clinician endpoint", async () => {
    const response = await request(app)
      .patch("/clinician/patients/p1/rehab-phase")
      .set("Authorization", `Bearer ${patientToken("p1")}`)
      .send({ currentKey: "phase-strength" });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("UNAUTHORIZED");
  });

  it("rejects invalid currentKey on clinician PATCH", async () => {
    const response = await request(app)
      .patch("/clinician/patients/p2/rehab-phase")
      .set("Authorization", `Bearer ${clinicianToken()}`)
      .send({ currentKey: "phase-unknown" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("VALIDATION_ERROR");
  });
});
