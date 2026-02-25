import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";

import app from "../src/app";
import Alert from "../src/models/Alert";
import CheckIn from "../src/models/CheckIn";
import HydrationLog from "../src/models/HydrationLog";
import InsightSuggestion from "../src/models/InsightSuggestion";
import Patient from "../src/models/Patient";
import PromInstance from "../src/models/PromInstance";
import { signAuthToken } from "../src/utils/jwt";
import { signPatientToken } from "../src/utils/patientJwt";

function toDateOnlyUtc(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate()
  ).padStart(2, "0")}`;
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

describe("insight suggestion routes", () => {
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
      InsightSuggestion.deleteMany({}),
      CheckIn.deleteMany({}),
      HydrationLog.deleteMany({}),
      PromInstance.deleteMany({}),
      Alert.deleteMany({}),
      Patient.deleteMany({}),
    ]);
    await Patient.insertMany([
      { patientId: "p1", displayName: "Patient One", status: "active" },
      { patientId: "p2", displayName: "Patient Two", status: "active" },
    ]);
  });

  function clinicianToken(): string {
    return signAuthToken({
      id: "clinician-1",
      role: "clinician",
      email: "clinician@example.com",
      name: "Clinician One",
    });
  }

  function patientToken(patientId: string): string {
    return signPatientToken({ id: patientId, displayName: `Patient ${patientId}` });
  }

  async function seedSignalsForInsightGeneration(patientId: string): Promise<void> {
    const checkins = Array.from({ length: 5 }, (_unused, index) => {
      const createdAt = daysAgo(index + 1);
      const date = toDateOnlyUtc(createdAt);
      return {
        patientId,
        date,
        pain: 4 + (index % 2),
        mood: 3,
        adherence: { exercises: 0.6, medication: index % 2 === 0 },
        sleep: { hours: 5.4, quality: 3, disturbances: 1 },
        risk: { level: "low", reasons: [] },
        createdAt,
        updatedAt: createdAt,
      };
    });

    await CheckIn.insertMany(checkins, { ordered: true });

    await HydrationLog.insertMany([
      {
        patientId,
        date: toDateOnlyUtc(daysAgo(1)),
        amountMl: 900,
      },
      {
        patientId,
        date: toDateOnlyUtc(daysAgo(2)),
        amountMl: 1000,
      },
    ]);

    await PromInstance.create({
      patientId,
      templateKey: "AURA_RECOVERY_5",
      templateVersion: 1,
      titleSnapshot: "Aura recovery 5",
      dueAt: new Date(),
      status: "due",
      questionsSnapshot: [
        {
          id: "q1",
          text: "Pain today",
          type: "likert",
          min: 0,
          max: 4,
          required: true,
          reverse: false,
        },
      ],
      answers: [],
      score: null,
    });

    await Alert.create({
      patientId,
      risk: "high",
      reason: "Safety trigger",
      source: { type: "checkin", sourceId: "source-1" },
      status: "open",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  it("patient sees only approved insights", async () => {
    await InsightSuggestion.insertMany([
      {
        patientId: "p1",
        windowDays: 14,
        windowStart: daysAgo(14),
        windowEnd: new Date(),
        status: "pending",
        title: "Pending title",
        message: "Pending message",
        category: "adherence",
        confidence: "medium",
        priority: 2,
        fingerprint: "fp-pending-p1",
      },
      {
        patientId: "p1",
        windowDays: 14,
        windowStart: daysAgo(14),
        windowEnd: new Date(),
        status: "approved",
        title: "Approved title",
        message: "Approved message",
        category: "habits",
        confidence: "high",
        priority: 3,
        fingerprint: "fp-approved-p1",
        reviewedAt: new Date(),
      },
      {
        patientId: "p1",
        windowDays: 14,
        windowStart: daysAgo(14),
        windowEnd: new Date(),
        status: "rejected",
        title: "Rejected title",
        message: "Rejected message",
        category: "recovery",
        confidence: "low",
        priority: 1,
        fingerprint: "fp-rejected-p1",
      },
      {
        patientId: "p2",
        windowDays: 14,
        windowStart: daysAgo(14),
        windowEnd: new Date(),
        status: "approved",
        title: "Approved title p2",
        message: "Approved message p2",
        category: "habits",
        confidence: "high",
        priority: 3,
        fingerprint: "fp-approved-p2",
      },
    ]);

    const response = await request(app)
      .get("/patient/insights?limit=10")
      .set("Authorization", `Bearer ${patientToken("p1")}`);

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].title).toBe("Approved title");
  });

  it("clinician queue lists pending insights", async () => {
    await InsightSuggestion.insertMany([
      {
        patientId: "p1",
        windowDays: 14,
        windowStart: daysAgo(14),
        windowEnd: new Date(),
        status: "pending",
        title: "Pending p1",
        message: "Pending insight p1",
        category: "adherence",
        confidence: "high",
        priority: 4,
        fingerprint: "pending-p1",
      },
      {
        patientId: "p2",
        windowDays: 14,
        windowStart: daysAgo(14),
        windowEnd: new Date(),
        status: "pending",
        title: "Pending p2",
        message: "Pending insight p2",
        category: "habits",
        confidence: "medium",
        priority: 3,
        fingerprint: "pending-p2",
      },
      {
        patientId: "p1",
        windowDays: 14,
        windowStart: daysAgo(14),
        windowEnd: new Date(),
        status: "approved",
        title: "Approved p1",
        message: "Approved insight p1",
        category: "recovery",
        confidence: "medium",
        priority: 2,
        fingerprint: "approved-p1",
      },
    ]);

    const response = await request(app)
      .get("/clinician/insights?status=pending&limit=50")
      .set("Authorization", `Bearer ${clinicianToken()}`);

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.items).toHaveLength(2);
    expect(response.body.items[0].status).toBe("pending");
  });

  it("clinician approve transitions to approved and patient can see it", async () => {
    const created = await InsightSuggestion.create({
      patientId: "p1",
      windowDays: 14,
      windowStart: daysAgo(14),
      windowEnd: new Date(),
      status: "pending",
      title: "Needs review",
      message: "Pending review",
      category: "adherence",
      confidence: "medium",
      priority: 3,
      fingerprint: "approve-me",
    });

    const review = await request(app)
      .patch(`/clinician/insights/${created._id.toString()}`)
      .set("Authorization", `Bearer ${clinicianToken()}`)
      .send({ status: "approved" });

    expect(review.status).toBe(200);
    expect(review.body.item.status).toBe("approved");

    const patientList = await request(app)
      .get("/patient/insights")
      .set("Authorization", `Bearer ${patientToken("p1")}`);
    expect(patientList.status).toBe(200);
    expect(patientList.body.items).toHaveLength(1);
    expect(patientList.body.items[0].id).toBe(created._id.toString());
  });

  it("clinician reject transitions to rejected and patient cannot see it", async () => {
    const created = await InsightSuggestion.create({
      patientId: "p1",
      windowDays: 14,
      windowStart: daysAgo(14),
      windowEnd: new Date(),
      status: "pending",
      title: "Reject me",
      message: "Pending review",
      category: "questionnaires",
      confidence: "low",
      priority: 2,
      fingerprint: "reject-me",
    });

    const review = await request(app)
      .patch(`/clinician/insights/${created._id.toString()}`)
      .set("Authorization", `Bearer ${clinicianToken()}`)
      .send({ status: "rejected" });

    expect(review.status).toBe(200);
    expect(review.body.item.status).toBe("rejected");

    const patientList = await request(app)
      .get("/patient/insights")
      .set("Authorization", `Bearer ${patientToken("p1")}`);
    expect(patientList.status).toBe(200);
    expect(patientList.body.items).toHaveLength(0);
  });

  it("generate endpoint creates deterministic pending insights and dedupes repeated calls", async () => {
    await seedSignalsForInsightGeneration("p1");

    const first = await request(app)
      .post("/clinician/patients/p1/insights/generate")
      .set("Authorization", `Bearer ${clinicianToken()}`)
      .send({ windowDays: 14 });

    expect(first.status).toBe(200);
    expect(first.body.ok).toBe(true);
    expect(first.body.created).toBeGreaterThanOrEqual(2);

    const second = await request(app)
      .post("/clinician/patients/p1/insights/generate")
      .set("Authorization", `Bearer ${clinicianToken()}`)
      .send({ windowDays: 14 });

    expect(second.status).toBe(200);
    expect(second.body.created).toBe(0);
    expect(second.body.skipped).toBeGreaterThan(0);

    const queue = await request(app)
      .get("/clinician/insights?status=pending")
      .set("Authorization", `Bearer ${clinicianToken()}`);
    expect(queue.status).toBe(200);
    expect(queue.body.items.length).toBeGreaterThanOrEqual(2);
  });

  it("enforces access control and 404 handling", async () => {
    const denied = await request(app)
      .get("/clinician/insights")
      .set("Authorization", `Bearer ${patientToken("p1")}`);
    expect([401, 403]).toContain(denied.status);

    const missing = await request(app)
      .patch(`/clinician/insights/${new mongoose.Types.ObjectId().toString()}`)
      .set("Authorization", `Bearer ${clinicianToken()}`)
      .send({ status: "approved" });
    expect(missing.status).toBe(404);

    await InsightSuggestion.create({
      patientId: "p1",
      windowDays: 14,
      windowStart: daysAgo(14),
      windowEnd: new Date(),
      status: "approved",
      title: "Visible to p1 only",
      message: "Approved",
      category: "habits",
      confidence: "high",
      priority: 2,
      fingerprint: "visible-p1-only",
    });

    const patientTwoList = await request(app)
      .get("/patient/insights")
      .set("Authorization", `Bearer ${patientToken("p2")}`);
    expect(patientTwoList.status).toBe(200);
    expect(patientTwoList.body.items).toHaveLength(0);
  });
});
