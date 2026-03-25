import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";

import app from "../src/app";
import { env } from "../src/env";
import Alert from "../src/models/Alert";
import CareEvent from "../src/models/CareEvent";
import User from "../src/models/User";
import { signAuthToken } from "../src/utils/jwt";

describe("clinician route auth and RBAC", () => {
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
    mutableEnv.JWT_SECRET = "test-jwt-secret";
    mutableEnv.ALLOW_UNAUTH_CLINICIAN_BODY_IDS = false;
    await Promise.all([Alert.deleteMany({}), CareEvent.deleteMany({}), User.deleteMany({})]);
  });

  async function createAlert() {
    return Alert.create({
      patientId: "p1",
      reason: "PAIN_GE_THRESHOLD",
      source: {
        type: "checkin",
        sourceId: new mongoose.Types.ObjectId().toString(),
      },
      status: "open",
    });
  }

  async function createClinicianAuth(overrides: Partial<{ email: string; displayName: string; role: "clinician" | "admin" | "patient"; sessionVersion: number }> = {}) {
    const user = await User.create({
      email: overrides.email ?? "clinician@example.com",
      passwordHash: "unused-password-hash",
      role: overrides.role ?? "clinician",
      displayName: overrides.displayName ?? "Clinician Token",
      sessionVersion: overrides.sessionVersion ?? 0,
    });

    return {
      user,
      token: signAuthToken({
        id: String(user._id),
        role: user.role,
        email: user.email,
        name: user.displayName,
        sessionVersion: user.sessionVersion,
      }),
    };
  }

  it("returns 401 without token when ALLOW_UNAUTH_CLINICIAN_BODY_IDS is false", async () => {
    mutableEnv.ALLOW_UNAUTH_CLINICIAN_BODY_IDS = false;

    const response = await request(app).get("/clinician/alerts?status=open");
    expect(response.status).toBe(401);
    expect(response.body.error).toBe("UNAUTHORIZED");
  });

  it("returns 403 when patient token accesses clinician route", async () => {
    const patientToken = signAuthToken({
      id: "patient-1",
      role: "patient",
      email: "patient@example.com",
      name: "Patient User",
    });

    const response = await request(app)
      .get("/clinician/alerts?status=open")
      .set("Authorization", `Bearer ${patientToken}`);

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("FORBIDDEN");
  });

  it("uses token identity for seen endpoint even when body is spoofed", async () => {
    const alert = await createAlert();
    const { user, token } = await createClinicianAuth();

    const response = await request(app)
      .patch(`/clinician/alerts/${String(alert._id)}/seen`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        clinicianId: "spoofed-id",
        clinicianName: "Spoofed Name",
      });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);

    const updatedAlert = await Alert.findById(alert._id).lean();
    expect(updatedAlert?.seenBy).toContain(String(user._id));
    expect(updatedAlert?.seenBy).not.toContain("spoofed-id");

    const careEvent = await CareEvent.findOne({
      alertId: String(alert._id),
      type: "ALERT_SEEN",
    }).lean();
    expect(careEvent?.payload).toMatchObject({
      clinicianId: String(user._id),
      clinicianName: "Clinician Token",
    });
  });

  it("uses req.user for assignment requestedBy and supports assign-to-me shortcut", async () => {
    const alert = await createAlert();
    const { user, token } = await createClinicianAuth({
      email: "clinician2@example.com",
      displayName: "Clinician Two",
    });

    const response = await request(app)
      .patch(`/clinician/alerts/${String(alert._id)}/assignment`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        assignedTo: "me",
        requestedBy: "spoofed-requested-by",
      });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.alert.assignedTo).toBe(String(user._id));

    const careEvent = await CareEvent.findOne({
      alertId: String(alert._id),
      type: "ALERT_ASSIGNED",
    }).lean();
    expect(careEvent?.payload).toMatchObject({
      requestedBy: String(user._id),
      requestedByName: "Clinician Two",
      assignedTo: String(user._id),
    });
  });

  it("returns 401 when a clinician token points to a missing user", async () => {
    const missingUserId = new mongoose.Types.ObjectId().toString();
    const token = signAuthToken({
      id: missingUserId,
      role: "clinician",
      email: "missing@example.com",
      name: "Missing Clinician",
      sessionVersion: 0,
    });

    const response = await request(app)
      .get("/clinician/alerts?status=open")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("UNAUTHORIZED");
  });

  it("accepts non-ObjectId clinician tokens only when the legacy test flag is enabled", async () => {
    mutableEnv.ALLOW_UNAUTH_CLINICIAN_BODY_IDS = true;
    const token = signAuthToken({
      id: "legacy-clinician-id",
      role: "clinician",
      email: "legacy@example.com",
      name: "Legacy Clinician",
      sessionVersion: 0,
    });

    const response = await request(app)
      .get("/clinician/alerts?status=open")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
  });

  it("returns 401 when a clinician token has a stale sessionVersion", async () => {
    const user = await User.create({
      email: "stale@example.com",
      passwordHash: "unused-password-hash",
      role: "clinician",
      displayName: "Stale Session",
      sessionVersion: 1,
    });
    const token = signAuthToken({
      id: String(user._id),
      role: "clinician",
      email: user.email,
      name: user.displayName,
      sessionVersion: 0,
    });

    const response = await request(app)
      .get("/clinician/alerts?status=open")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("UNAUTHORIZED");
  });

  it("returns 403 when the live user role no longer has clinician access", async () => {
    const { token } = await createClinicianAuth({
      email: "downgraded@example.com",
      displayName: "Downgraded Clinician",
    });

    await User.updateOne(
      { email: "downgraded@example.com" },
      {
        $set: {
          role: "patient",
        },
      }
    );

    const response = await request(app)
      .get("/clinician/alerts?status=open")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("FORBIDDEN");
  });

  it("accepts legacy body clinician ids without token when ALLOW_UNAUTH... is true", async () => {
    mutableEnv.ALLOW_UNAUTH_CLINICIAN_BODY_IDS = true;
    const alert = await createAlert();

    const response = await request(app)
      .patch(`/clinician/alerts/${String(alert._id)}/seen`)
      .send({
        clinicianId: "legacy-clinician-id",
        clinicianName: "Legacy Clinician",
      });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);

    const updatedAlert = await Alert.findById(alert._id).lean();
    expect(updatedAlert?.seenBy).toContain("legacy-clinician-id");
  });
});
