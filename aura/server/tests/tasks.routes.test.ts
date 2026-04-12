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
import CommunicationEvent from "../src/models/CommunicationEvent";
import CommunicationReview from "../src/models/CommunicationReview";
import Task from "../src/models/Task";
import { signAuthToken } from "../src/utils/jwt";
import { signPatientToken } from "../src/utils/patientJwt";

function clinicianToken(userId = "clinician-1"): string {
  return signAuthToken({
    id: userId,
    role: "clinician",
    email: `${userId}@example.com`,
    name: "Clinician One",
  });
}

function patientToken(patientId: string): string {
  return signPatientToken({
    id: patientId,
    displayName: `Patient ${patientId}`,
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

    await Promise.all([
      Task.deleteMany({}),
      CommunicationReview.deleteMany({}),
      CommunicationEvent.deleteMany({}),
    ]);
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
    expect(linkedReview?.followUpRequested).toBe(true);
    expect(linkedReview?.lastReviewedAt).toBeInstanceOf(Date);
    expect(linkedReview?.lastReviewedBy).toMatchObject({
      clinicianId: "clinician-1",
      displayName: "Clinician One",
    });

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
    expect(completedReview?.lastClinicianReplyAt).toBeNull();
    expect(completedReview?.resolvedAt).toBeInstanceOf(Date);
    expect(completedReview?.resolutionKind).toBe("no_follow_up_needed");
    expect(completedReview?.resolvedBy).toMatchObject({
      clinicianId: "clinician-1",
      displayName: "Clinician One",
    });

    const events = await CommunicationEvent.find({
      patientId: "p1",
      messageId: "507f1f77bcf86cd799439011",
    })
      .sort({ createdAt: 1 })
      .lean();
    expect(events.map((event) => event.eventType)).toEqual([
      "follow_up_requested",
      "review_recorded",
      "follow_up_requested",
      "review_recorded",
      "resolved_no_follow_up",
    ]);

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

  it("lists patient-scoped tasks and only completes explicitly patient-completable tasks", async () => {
    const [patientCompletable, needsActionOnly, otherPatientTask] = await Task.create([
      {
        patientId: "p1",
        title: "Complete today’s check-in",
        description: "Your care team asked for one more update tonight.",
        type: "follow_up",
        priority: "high",
        status: "open",
        createdBy: "clinician-1",
        source: { type: "manual", label: "Clinician follow-up" },
        meta: {
          patientCompletable: true,
          patientAction: { kind: "checkin", label: "Open check-in" },
        },
      },
      {
        patientId: "p1",
        title: "Reply to your care team",
        type: "communication",
        priority: "medium",
        status: "in_progress",
        createdBy: "clinician-1",
        linkedMessageId: "507f1f77bcf86cd799439099",
        source: { type: "chat", label: "Chat follow-up" },
      },
      {
        patientId: "p2",
        title: "Other patient task",
        type: "follow_up",
        priority: "low",
        status: "open",
        createdBy: "clinician-2",
        source: { type: "manual" },
      },
    ]);

    const listResponse = await request(app)
      .get("/patient/tasks")
      .set("Authorization", `Bearer ${patientToken("p1")}`);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.items).toHaveLength(2);
    expect(listResponse.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: String(patientCompletable._id),
          title: "Complete today’s check-in",
          patientCompletable: true,
          patientAction: { kind: "checkin", label: "Open check-in" },
        }),
        expect.objectContaining({
          id: String(needsActionOnly._id),
          title: "Reply to your care team",
          linkedMessageId: "507f1f77bcf86cd799439099",
          patientCompletable: false,
        }),
      ]),
    );
    expect(
      listResponse.body.items.some((item: { id?: string }) => item.id === String(otherPatientTask._id)),
    ).toBe(false);

    const completedResponse = await request(app)
      .post(`/patient/tasks/${String(patientCompletable._id)}/complete`)
      .set("Authorization", `Bearer ${patientToken("p1")}`);

    expect(completedResponse.status).toBe(200);
    expect(completedResponse.body.item.status).toBe("completed");

    const blockedResponse = await request(app)
      .post(`/patient/tasks/${String(needsActionOnly._id)}/complete`)
      .set("Authorization", `Bearer ${patientToken("p1")}`);

    expect(blockedResponse.status).toBe(409);
    expect(blockedResponse.body.error).toBe("ACTION_NOT_ALLOWED");

    const otherPatientResponse = await request(app)
      .post(`/patient/tasks/${String(otherPatientTask._id)}/complete`)
      .set("Authorization", `Bearer ${patientToken("p1")}`);

    expect(otherPatientResponse.status).toBe(404);
  });
});
