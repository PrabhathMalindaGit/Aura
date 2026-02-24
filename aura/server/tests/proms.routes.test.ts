import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";

import app from "../src/app";
import Patient from "../src/models/Patient";
import PromInstance from "../src/models/PromInstance";
import PromTemplate from "../src/models/PromTemplate";
import { buildDefaultPromTemplate } from "../src/services/promsService";
import { signAuthToken } from "../src/utils/jwt";
import { signPatientToken } from "../src/utils/patientJwt";

function toQuestionSnapshot(template: ReturnType<typeof buildDefaultPromTemplate>) {
  return template.questions.map((question) => ({
    id: question.id,
    text: question.text,
    type: question.type,
    min: question.min,
    max: question.max,
    labels: question.labels,
    required: question.required !== false,
    reverse: question.reverse === true,
  }));
}

describe("prom routes", () => {
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
      Patient.deleteMany({}),
      PromTemplate.deleteMany({}),
      PromInstance.deleteMany({}),
    ]);

    await Patient.insertMany([
      { patientId: "p1", displayName: "Patient One", status: "active" },
      { patientId: "p2", displayName: "Patient Two", status: "active" },
    ]);

    const template = buildDefaultPromTemplate();
    await PromTemplate.create({
      ...template,
      questions: toQuestionSnapshot(template),
      scoring: {
        ...template.scoring,
        normalizeTo100: template.scoring.normalizeTo100 !== false,
      },
    });

    await PromInstance.insertMany([
      {
        patientId: "p1",
        templateKey: template.key,
        templateVersion: template.version,
        titleSnapshot: template.title,
        questionsSnapshot: toQuestionSnapshot(template),
        dueAt: new Date("2026-02-24T08:00:00.000Z"),
        status: "due",
        answers: [],
        score: null,
      },
      {
        patientId: "p2",
        templateKey: template.key,
        templateVersion: template.version,
        titleSnapshot: template.title,
        questionsSnapshot: toQuestionSnapshot(template),
        dueAt: new Date("2026-02-24T09:00:00.000Z"),
        status: "due",
        answers: [],
        score: null,
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

  it("patient can fetch due list scoped to self", async () => {
    const response = await request(app)
      .get("/patient/proms/due")
      .set("Authorization", `Bearer ${patientToken("p1")}`);

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(Array.isArray(response.body.due)).toBe(true);
    expect(response.body.due).toHaveLength(1);
    expect(response.body.due[0].templateKey).toBe("AURA_RECOVERY_5");
  });

  it("patient cannot fetch another patient's prom instance", async () => {
    const p2Instance = await PromInstance.findOne({ patientId: "p2" }).lean();
    expect(p2Instance?._id).toBeTruthy();

    const response = await request(app)
      .get(`/patient/proms/${String(p2Instance?._id)}`)
      .set("Authorization", `Bearer ${patientToken("p1")}`);

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("NOT_FOUND");
  });

  it("patient submit computes score and marks completed", async () => {
    const instance = await PromInstance.findOne({ patientId: "p1", status: "due" }).lean();
    expect(instance?._id).toBeTruthy();

    const response = await request(app)
      .post(`/patient/proms/${String(instance?._id)}/submit`)
      .set("Authorization", `Bearer ${patientToken("p1")}`)
      .send({
        answers: [
          { questionId: "q1", value: 4 },
          { questionId: "q2", value: 3 },
          { questionId: "q3", value: 2 },
          { questionId: "q4", value: 1 },
          { questionId: "q5", value: 0 },
        ],
      });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.score).toMatchObject({
      raw: 10,
      normalized: 50,
      bandKey: "amber",
      bandLabel: "Moderate concern",
    });

    const updated = await PromInstance.findById(instance?._id).lean();
    expect(updated?.status).toBe("completed");
    expect(updated?.completedAt instanceof Date).toBe(true);
    expect(updated?.score).toMatchObject({
      raw: 10,
      normalized: 50,
      bandKey: "amber",
    });
  });

  it("submit rejects out-of-range values and missing required answers", async () => {
    const instance = await PromInstance.findOne({ patientId: "p1", status: "due" }).lean();
    expect(instance?._id).toBeTruthy();

    const outOfRange = await request(app)
      .post(`/patient/proms/${String(instance?._id)}/submit`)
      .set("Authorization", `Bearer ${patientToken("p1")}`)
      .send({
        answers: [
          { questionId: "q1", value: 9 },
          { questionId: "q2", value: 2 },
          { questionId: "q3", value: 2 },
          { questionId: "q4", value: 2 },
          { questionId: "q5", value: 2 },
        ],
      });

    expect(outOfRange.status).toBe(400);
    expect(outOfRange.body.error).toBe("VALIDATION_ERROR");

    const missingRequired = await request(app)
      .post(`/patient/proms/${String(instance?._id)}/submit`)
      .set("Authorization", `Bearer ${patientToken("p1")}`)
      .send({
        answers: [
          { questionId: "q1", value: 1 },
          { questionId: "q2", value: 1 },
          { questionId: "q3", value: 1 },
          { questionId: "q4", value: 1 },
        ],
      });

    expect(missingRequired.status).toBe(400);
    expect(missingRequired.body.error).toBe("VALIDATION_ERROR");
  });

  it("clinician can assign and patient sees new due prom", async () => {
    const assign = await request(app)
      .post("/clinician/patients/p1/proms/assign")
      .set("Authorization", `Bearer ${clinicianToken()}`)
      .send({ templateKey: "AURA_RECOVERY_5" });

    expect(assign.status).toBe(200);
    expect(assign.body.ok).toBe(true);
    expect(assign.body.due.templateKey).toBe("AURA_RECOVERY_5");

    const dueResponse = await request(app)
      .get("/patient/proms/due")
      .set("Authorization", `Bearer ${patientToken("p1")}`);

    expect(dueResponse.status).toBe(200);
    expect(dueResponse.body.due.length).toBe(2);
  });

  it("clinician can list patient proms and fetch prom detail", async () => {
    const p1Due = await PromInstance.findOne({ patientId: "p1", status: "due" });
    expect(p1Due?._id).toBeTruthy();

    p1Due?.set({
      status: "completed",
      completedAt: new Date("2026-02-24T10:00:00.000Z"),
      answers: [
        { questionId: "q1", value: 1 },
        { questionId: "q2", value: 1 },
        { questionId: "q3", value: 1 },
        { questionId: "q4", value: 1 },
        { questionId: "q5", value: 1 },
      ],
      score: {
        raw: 5,
        normalized: 25,
        bandKey: "green",
        bandLabel: "Low concern",
      },
    });
    await p1Due?.save();

    const listResponse = await request(app)
      .get("/clinician/patients/p1/proms")
      .set("Authorization", `Bearer ${clinicianToken()}`);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.ok).toBe(true);
    expect(Array.isArray(listResponse.body.completed)).toBe(true);
    expect(listResponse.body.completed).toHaveLength(1);

    const detailResponse = await request(app)
      .get(`/clinician/proms/${String(p1Due?._id)}`)
      .set("Authorization", `Bearer ${clinicianToken()}`);

    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body.ok).toBe(true);
    expect(detailResponse.body.prom.id).toBe(String(p1Due?._id));
    expect(detailResponse.body.prom.status).toBe("completed");
    expect(detailResponse.body.prom.score).toMatchObject({
      normalized: 25,
      bandLabel: "Low concern",
    });
  });
});
