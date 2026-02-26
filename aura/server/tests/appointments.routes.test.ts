import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";

import app from "../src/app";
import AppointmentRequest from "../src/models/AppointmentRequest";
import AppointmentSlot from "../src/models/AppointmentSlot";
import Patient from "../src/models/Patient";
import { signAuthToken } from "../src/utils/jwt";
import { signPatientToken } from "../src/utils/patientJwt";

function patientToken(patientId: string): string {
  return signPatientToken({
    id: patientId,
    displayName: `Patient ${patientId}`,
  });
}

function clinicianToken(userId = "clinician-1"): string {
  return signAuthToken({
    id: userId,
    role: "clinician",
    email: `${userId}@example.com`,
    name: "Clinician",
  });
}

function isoIn(hoursFromNow: number): string {
  return new Date(Date.now() + hoursFromNow * 60 * 60 * 1000).toISOString();
}

describe("appointments routes", () => {
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
      AppointmentRequest.deleteMany({}),
      AppointmentSlot.deleteMany({}),
      Patient.deleteMany({}),
    ]);

    await Patient.insertMany([
      { patientId: "p1", displayName: "Patient One", status: "active" },
      { patientId: "p2", displayName: "Patient Two", status: "active" },
    ]);
  });

  it("patient can list available upcoming slots", async () => {
    await AppointmentSlot.insertMany([
      {
        clinicianId: "clinician-1",
        startsAt: new Date(isoIn(24)),
        endsAt: new Date(isoIn(24.5)),
        status: "available",
      },
      {
        clinicianId: "clinician-1",
        startsAt: new Date(isoIn(26)),
        endsAt: new Date(isoIn(26.5)),
        status: "closed",
      },
    ]);

    const response = await request(app)
      .get("/patient/appointments/slots")
      .set("Authorization", `Bearer ${patientToken("p1")}`);

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].modality).toBe("video");
  });

  it("patient can request slot and clinician can approve it", async () => {
    const slot = await AppointmentSlot.create({
      clinicianId: "clinician-1",
      startsAt: new Date(isoIn(24)),
      endsAt: new Date(isoIn(24.5)),
      status: "available",
    });

    const createRequest = await request(app)
      .post("/patient/appointments/requests")
      .set("Authorization", `Bearer ${patientToken("p1")}`)
      .send({ slotId: String(slot._id), note: "Can do this time." });

    expect(createRequest.status).toBe(200);
    expect(createRequest.body.status).toBe("pending");

    const approve = await request(app)
      .patch(`/clinician/appointments/requests/${createRequest.body.requestId as string}`)
      .set("Authorization", `Bearer ${clinicianToken()}`)
      .send({ status: "approved" });

    expect(approve.status).toBe(200);
    expect(approve.body.item.status).toBe("approved");

    const refreshedSlot = await AppointmentSlot.findById(slot._id).lean();
    expect(refreshedSlot?.status).toBe("closed");
  });

  it("prevents double approval for the same slot", async () => {
    const slot = await AppointmentSlot.create({
      clinicianId: "clinician-1",
      startsAt: new Date(isoIn(30)),
      endsAt: new Date(isoIn(30.5)),
      status: "available",
    });

    const [firstRequest, secondRequest] = await Promise.all([
      request(app)
        .post("/patient/appointments/requests")
        .set("Authorization", `Bearer ${patientToken("p1")}`)
        .send({ slotId: String(slot._id) }),
      request(app)
        .post("/patient/appointments/requests")
        .set("Authorization", `Bearer ${patientToken("p2")}`)
        .send({ slotId: String(slot._id) }),
    ]);

    expect(firstRequest.status).toBe(200);
    expect(secondRequest.status).toBe(200);

    const firstApprove = await request(app)
      .patch(`/clinician/appointments/requests/${firstRequest.body.requestId as string}`)
      .set("Authorization", `Bearer ${clinicianToken()}`)
      .send({ status: "approved" });
    expect(firstApprove.status).toBe(200);

    const secondApprove = await request(app)
      .patch(`/clinician/appointments/requests/${secondRequest.body.requestId as string}`)
      .set("Authorization", `Bearer ${clinicianToken()}`)
      .send({ status: "approved" });
    expect(secondApprove.status).toBeGreaterThanOrEqual(400);

    const requests = await AppointmentRequest.find({ slotId: slot._id }).lean();
    const approvedCount = requests.filter((item) => item.status === "approved").length;
    expect(approvedCount).toBe(1);
  });

  it("patient cannot request a closed slot", async () => {
    const slot = await AppointmentSlot.create({
      clinicianId: "clinician-1",
      startsAt: new Date(isoIn(24)),
      endsAt: new Date(isoIn(24.5)),
      status: "closed",
    });

    const response = await request(app)
      .post("/patient/appointments/requests")
      .set("Authorization", `Bearer ${patientToken("p1")}`)
      .send({ slotId: String(slot._id) });

    expect(response.status).toBe(409);
  });

  it("patient cannot access another patient's request", async () => {
    const slot = await AppointmentSlot.create({
      clinicianId: "clinician-1",
      startsAt: new Date(isoIn(24)),
      endsAt: new Date(isoIn(24.5)),
      status: "available",
    });
    const ownRequest = await request(app)
      .post("/patient/appointments/requests")
      .set("Authorization", `Bearer ${patientToken("p1")}`)
      .send({ slotId: String(slot._id) });
    expect(ownRequest.status).toBe(200);

    const cancelByOther = await request(app)
      .post(`/patient/appointments/requests/${ownRequest.body.requestId as string}/cancel`)
      .set("Authorization", `Bearer ${patientToken("p2")}`);
    expect(cancelByOther.status).toBe(404);
  });

  it("patient cancel on approved request reopens slot", async () => {
    const slot = await AppointmentSlot.create({
      clinicianId: "clinician-1",
      startsAt: new Date(isoIn(24)),
      endsAt: new Date(isoIn(24.5)),
      status: "available",
    });

    const created = await request(app)
      .post("/patient/appointments/requests")
      .set("Authorization", `Bearer ${patientToken("p1")}`)
      .send({ slotId: String(slot._id) });
    expect(created.status).toBe(200);

    const approved = await request(app)
      .patch(`/clinician/appointments/requests/${created.body.requestId as string}`)
      .set("Authorization", `Bearer ${clinicianToken()}`)
      .send({ status: "approved" });
    expect(approved.status).toBe(200);

    const canceled = await request(app)
      .post(`/patient/appointments/requests/${created.body.requestId as string}/cancel`)
      .set("Authorization", `Bearer ${patientToken("p1")}`);
    expect(canceled.status).toBe(200);
    expect(canceled.body.item.status).toBe("canceled");

    const refreshedSlot = await AppointmentSlot.findById(slot._id).lean();
    expect(refreshedSlot?.status).toBe("available");
  });

  it("enforces 2-hour lead time for requests", async () => {
    const slot = await AppointmentSlot.create({
      clinicianId: "clinician-1",
      startsAt: new Date(isoIn(1)),
      endsAt: new Date(isoIn(1.5)),
      status: "available",
    });

    const response = await request(app)
      .post("/patient/appointments/requests")
      .set("Authorization", `Bearer ${patientToken("p1")}`)
      .send({ slotId: String(slot._id) });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("LEAD_TIME_VIOLATION");
  });
});
