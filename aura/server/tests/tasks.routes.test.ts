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
import CommunicationReview from "../src/models/CommunicationReview";
import Task from "../src/models/Task";
import { signAuthToken } from "../src/utils/jwt";

function clinicianToken(userId = "clinician-1"): string {
  return signAuthToken({
    id: userId,
    role: "clinician",
    email: `${userId}@example.com`,
    name: "Clinician One",
  });
}

describe("clinician task routes", () => {
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
    vi.setSystemTime(new Date("2026-03-09T08:00:00.000Z"));

    await Promise.all([Task.deleteMany({}), CommunicationReview.deleteMany({})]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates, filters, updates, and completes clinician tasks", async () => {
    await CommunicationReview.create({
      patientId: "p1",
      messageId: "507f1f77bcf86cd799439011",
      needsResponse: true,
      flaggedBySafety: true,
      followUpRequested: true,
      messageCreatedAt: new Date("2026-03-09T07:45:00.000Z"),
      messagePreview: "I am worried about my pain today.",
    });

    const createResponse = await request(app)
      .post("/clinician/tasks")
      .set("Authorization", `Bearer ${clinicianToken()}`)
      .send({
        patientId: "p1",
        title: "Call patient after safety escalation",
        type: "communication",
        priority: "high",
        assignedTo: "clinician-1",
        linkedMessageId: "507f1f77bcf86cd799439011",
        dueAt: "2026-03-09T12:00:00.000Z",
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.ok).toBe(true);
    expect(createResponse.body.task).toMatchObject({
      patientId: "p1",
      type: "communication",
      priority: "high",
      status: "open",
      createdBy: "clinician-1",
      linkedMessageId: "507f1f77bcf86cd799439011",
    });

    const linkedReview = await CommunicationReview.findOne({
      messageId: "507f1f77bcf86cd799439011",
    }).lean();
    expect(linkedReview?.linkedTaskId).toBe(createResponse.body.task.id);

    const listResponse = await request(app)
      .get("/clinician/tasks")
      .set("Authorization", `Bearer ${clinicianToken()}`)
      .query({
        patientId: "p1",
        status: "open",
        assignedTo: "clinician-1",
        sortBy: "priority",
      });

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.tasks).toHaveLength(1);

    const patchResponse = await request(app)
      .patch(`/clinician/tasks/${createResponse.body.task.id as string}`)
      .set("Authorization", `Bearer ${clinicianToken()}`)
      .send({
        status: "in_progress",
        description: "Patient requested a check-in call before noon.",
      });

    expect(patchResponse.status).toBe(200);
    expect(patchResponse.body.task.status).toBe("in_progress");

    const completeResponse = await request(app)
      .post(`/clinician/tasks/${createResponse.body.task.id as string}/complete`)
      .set("Authorization", `Bearer ${clinicianToken()}`);

    expect(completeResponse.status).toBe(200);
    expect(completeResponse.body.task.status).toBe("completed");
    expect(typeof completeResponse.body.task.completedAt).toBe("string");

    const completedReview = await CommunicationReview.findOne({
      messageId: "507f1f77bcf86cd799439011",
    }).lean();
    expect(completedReview?.needsResponse).toBe(false);
    expect(completedReview?.followUpRequested).toBe(false);
    expect(completedReview?.lastClinicianReplyAt).toBeInstanceOf(Date);

    const secondCompleteResponse = await request(app)
      .post(`/clinician/tasks/${createResponse.body.task.id as string}/complete`)
      .set("Authorization", `Bearer ${clinicianToken()}`);

    expect(secondCompleteResponse.status).toBe(200);
    expect(secondCompleteResponse.body.task.status).toBe("completed");
  });

  it("returns validation errors for bad task input", async () => {
    const createResponse = await request(app)
      .post("/clinician/tasks")
      .set("Authorization", `Bearer ${clinicianToken()}`)
      .send({
        patientId: "",
        title: "",
        dueAt: "not-a-date",
      });

    expect(createResponse.status).toBe(400);
    expect(createResponse.body.error).toBe("VALIDATION_ERROR");

    const task = await Task.create({
      patientId: "p2",
      title: "Review adherence",
      type: "adherence_review",
      priority: "medium",
      status: "open",
      createdBy: "clinician-1",
      source: { type: "manual" },
    });

    const patchResponse = await request(app)
      .patch(`/clinician/tasks/${String(task._id)}`)
      .set("Authorization", `Bearer ${clinicianToken()}`)
      .send({});

    expect(patchResponse.status).toBe(400);
    expect(patchResponse.body.error).toBe("VALIDATION_ERROR");
  });
});
