import mongoose from "mongoose";
import request from "supertest";
import {
  afterEach,
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";

import app from "../src/app";
import { env } from "../src/env";
import CareEvent from "../src/models/CareEvent";
import CheckIn from "../src/models/CheckIn";
import ExercisePlan from "../src/models/ExercisePlan";
import Patient from "../src/models/Patient";
import User from "../src/models/User";
import { buildDischargeExportDocument } from "../src/services/dischargeExportService";
import { signAuthToken } from "../src/utils/jwt";

function parseBinary(
  res: any,
  callback: (error: Error | null, body: Buffer) => void
): void {
  const chunks: Buffer[] = [];
  res.on("data", (chunk) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });
  res.on("end", () => {
    callback(null, Buffer.concat(chunks));
  });
}

describe("clinician discharge export routes", () => {
  let mongoServer: MongoMemoryServer | null = null;
  const mutableEnv = env as unknown as {
    ALLOW_UNAUTH_CLINICIAN_BODY_IDS: boolean;
    JWT_SECRET: string;
  };
  const originalAllowLegacy = mutableEnv.ALLOW_UNAUTH_CLINICIAN_BODY_IDS;
  const originalJwtSecret = mutableEnv.JWT_SECRET;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
  });

  afterAll(async () => {
    mutableEnv.ALLOW_UNAUTH_CLINICIAN_BODY_IDS = originalAllowLegacy;
    mutableEnv.JWT_SECRET = originalJwtSecret;
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-12T09:15:00.000Z"));
    mutableEnv.JWT_SECRET = "test-jwt-secret";
    mutableEnv.ALLOW_UNAUTH_CLINICIAN_BODY_IDS = false;

    await Promise.all([
      CareEvent.deleteMany({}),
      CheckIn.deleteMany({}),
      ExercisePlan.deleteMany({}),
      Patient.deleteMany({}),
      User.deleteMany({}),
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function createClinicianAuth() {
    const user = await User.create({
      email: "clinician@example.com",
      passwordHash: "unused-password-hash",
      role: "clinician",
      displayName: "Dr Elena Hall",
      sessionVersion: 0,
    });

    return signAuthToken({
      id: String(user._id),
      role: user.role,
      email: user.email,
      name: user.displayName,
      sessionVersion: user.sessionVersion,
    });
  }

  async function seedDischargePatient(
    patientId: string,
    overrides: Partial<{
      status: "discharged" | "inactive";
      independentModeEnabled: boolean;
      summary: string;
      contactInstructions: string;
    }> = {}
  ) {
    const status = overrides.status ?? "discharged";
    const independentModeEnabled = overrides.independentModeEnabled ?? false;
    const summary =
      overrides.summary ??
      "Recovery goals were met and routine clinician monitoring has ended.";
    const contactInstructions =
      overrides.contactInstructions ??
      "Contact the clinic within 2 business days if pain increases or function drops.";

    await Patient.create({
      patientId,
      displayName: "Taylor Moss",
      status,
      discharge: {
        dischargedAt: new Date("2026-04-10T11:00:00.000Z"),
        dischargedBy: {
          clinicianId: "clinician-123",
          name: "Dr Elena Hall",
        },
        independentModeEnabled,
        summary,
        contactInstructions,
      },
    });

    await CheckIn.insertMany([
      {
        patientId,
        date: "2026-04-10",
        mood: 4,
        pain: 3,
        adherence: { exercises: 0.9, medication: true },
        notes: "Feeling steadier on stairs.",
        createdAt: new Date("2026-04-10T09:00:00.000Z"),
        updatedAt: new Date("2026-04-10T09:00:00.000Z"),
      },
      {
        patientId,
        date: "2026-04-08",
        mood: 4,
        pain: 4,
        adherence: { exercises: 0.8, medication: true },
        notes: "Mild stiffness after exercises.",
        createdAt: new Date("2026-04-08T09:00:00.000Z"),
        updatedAt: new Date("2026-04-08T09:00:00.000Z"),
      },
      {
        patientId,
        date: "2026-04-05",
        mood: 3,
        pain: 5,
        adherence: { exercises: 0.7, medication: true },
        createdAt: new Date("2026-04-05T09:00:00.000Z"),
        updatedAt: new Date("2026-04-05T09:00:00.000Z"),
      },
    ]);

    await ExercisePlan.create({
      patientId,
      title: "Home exercise plan",
      timezone: "UTC",
      daysOfWeek: [1, 3, 5],
      items: [
        {
          key: "heel-slides",
          name: "Heel slides",
          instructions: "Perform a slow heel slide within comfort.",
          sets: 2,
          reps: 10,
          intensity: "easy",
          order: 0,
        },
      ],
      version: 3,
      updatedBy: {
        clinicianId: "clinician-123",
        name: "Dr Elena Hall",
      },
    });
  }

  it("keeps JSON summary reads side-effect free", async () => {
    await seedDischargePatient("patient-json");
    const token = await createClinicianAuth();

    const response = await request(app)
      .get("/clinician/patients/patient-json/discharge-summary")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.summary).toMatchObject({
      patientId: "patient-json",
      status: "discharged",
      summary: "Recovery goals were met and routine clinician monitoring has ended.",
    });

    const patient = await Patient.findOne({ patientId: "patient-json" }).lean();
    expect(patient?.discharge?.lastExportedAt ?? null).toBeNull();
    expect(patient?.discharge?.lastExportedBy).toBeUndefined();

    const events = await CareEvent.find({
      patientId: "patient-json",
      type: "DISCHARGE_SUMMARY_EXPORTED",
    }).lean();
    expect(events).toHaveLength(0);
  });

  it("rejects PDF export for active and on-hold patients", async () => {
    await Patient.insertMany([
      { patientId: "patient-active", displayName: "Active Patient", status: "active" },
      { patientId: "patient-hold", displayName: "Hold Patient", status: "on_hold" },
    ]);
    const token = await createClinicianAuth();

    const activeResponse = await request(app)
      .get("/clinician/patients/patient-active/discharge-summary/pdf")
      .set("Authorization", `Bearer ${token}`);
    expect(activeResponse.status).toBe(409);
    expect(activeResponse.body.error).toBe("INVALID_CARE_STATE");
    expect(activeResponse.body.status).toBe("active");

    const onHoldResponse = await request(app)
      .get("/clinician/patients/patient-hold/discharge-summary/pdf")
      .set("Authorization", `Bearer ${token}`);
    expect(onHoldResponse.status).toBe(409);
    expect(onHoldResponse.body.error).toBe("INVALID_CARE_STATE");
    expect(onHoldResponse.body.status).toBe("on_hold");
  });

  it("streams a PDF export and records audit state only on export", async () => {
    await seedDischargePatient("patient-pdf", { independentModeEnabled: true });
    const token = await createClinicianAuth();

    const response = await request(app)
      .get("/clinician/patients/patient-pdf/discharge-summary/pdf")
      .set("Authorization", `Bearer ${token}`)
      .buffer(true)
      .parse(parseBinary);

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("application/pdf");
    expect(response.headers["content-disposition"]).toContain(
      'attachment; filename="Aura_Discharge_Summary_patient-pdf_2026-04-12.pdf"'
    );
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body).toBeInstanceOf(Buffer);
    expect(response.body.length).toBeGreaterThan(500);
    expect(response.body.subarray(0, 4).toString("utf8")).toBe("%PDF");

    const patient = await Patient.findOne({ patientId: "patient-pdf" }).lean();
    expect(patient?.discharge?.lastExportedAt?.toISOString()).toBe(
      "2026-04-12T09:15:00.000Z"
    );
    expect(patient?.discharge?.lastExportedBy).toMatchObject({
      clinicianId: expect.any(String),
      name: "Dr Elena Hall",
    });

    const events = await CareEvent.find({
      patientId: "patient-pdf",
      type: "DISCHARGE_SUMMARY_EXPORTED",
    }).lean();
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toMatchObject({
      requestedByName: "Dr Elena Hall",
      format: "pdf",
      surface: "clinician_dashboard",
      generatedAt: "2026-04-12T09:15:00.000Z",
      filename: "Aura_Discharge_Summary_patient-pdf_2026-04-12.pdf",
    });
  });

  it("builds a patient-safe whitelist export DTO for each allowed care state", async () => {
    await seedDischargePatient("patient-discharged");
    await seedDischargePatient("patient-independent", {
      independentModeEnabled: true,
    });
    await seedDischargePatient("patient-inactive", {
      status: "inactive",
      independentModeEnabled: false,
      summary: "This record has moved to inactive archive after care completion.",
    });

    const discharged = await buildDischargeExportDocument("patient-discharged");
    const independent = await buildDischargeExportDocument("patient-independent");
    const inactive = await buildDischargeExportDocument("patient-inactive");

    expect(discharged.ok && discharged.document.careState).toBe("discharged");
    expect(independent.ok && independent.document.careState).toBe("independent_mode");
    expect(inactive.ok && inactive.document.careState).toBe("inactive");

    if (!discharged.ok || !independent.ok || !inactive.ok) {
      throw new Error("Expected export document builders to succeed");
    }

    expect(independent.document.careStateLabel).toBe("Independent recovery mode");
    expect(independent.document.monitoringCaveat).toContain("monitoring new entries");
    expect(inactive.document.careStateSummary).toContain("inactive");

    expect(independent.document).not.toHaveProperty("notes");
    expect(independent.document).not.toHaveProperty("thresholds");
    expect(independent.document).not.toHaveProperty("caregiverMetadata");
    expect(independent.document).not.toHaveProperty("messages");
    expect(independent.document).not.toHaveProperty("photos");
    expect(independent.document).not.toHaveProperty("clinicianId");
  });
});
