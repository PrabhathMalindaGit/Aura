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
import ClinicianCoordination from "../src/models/ClinicianCoordination";
import Task from "../src/models/Task";
import User from "../src/models/User";
import { signAuthToken } from "../src/utils/jwt";

function clinicianToken(user: {
  _id: unknown;
  email: string;
  displayName?: string;
  sessionVersion?: number;
}): string {
  return signAuthToken({
    id: String(user._id),
    role: "clinician",
    email: user.email,
    name: user.displayName ?? "Clinician One",
    sessionVersion: user.sessionVersion ?? 0,
  });
}

describe("clinician coordination routes", () => {
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
    vi.setSystemTime(new Date("2026-04-05T09:00:00.000Z"));

    await Promise.all([
      ClinicianCoordination.deleteMany({}),
      Task.deleteMany({}),
      User.deleteMany({}),
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function createClinicianUser() {
    return User.create({
      email: "clinician-1@example.com",
      passwordHash: "unused-password-hash",
      role: "clinician",
      displayName: "Dr Elena Hall",
      sessionVersion: 0,
    });
  }

  it("returns null coordination when no shared record exists", async () => {
    const clinicianUser = await createClinicianUser();

    const response = await request(app)
      .get("/clinician/patients/patient-1/coordination")
      .set("Authorization", `Bearer ${clinicianToken(clinicianUser)}`);

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.coordination).toBeNull();
  });

  it("creates a shared current handoff with authorship snapshot and timestamps", async () => {
    const clinicianUser = await createClinicianUser();

    const response = await request(app)
      .put("/clinician/patients/patient-1/coordination/current-handoff")
      .set("Authorization", `Bearer ${clinicianToken(clinicianUser)}`)
      .send({
        summary: "Review alerts first, then reopen the patient plan if pain stays elevated.",
        nextStep: "alerts",
        followUpOwner: {
          kind: "clinician",
          clinicianId: String(clinicianUser._id),
          displayName: "Dr Elena Hall",
        },
      });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.coordination).toMatchObject({
      patientId: "patient-1",
      currentHandoff: {
        summary:
          "Review alerts first, then reopen the patient plan if pain stays elevated.",
        nextStep: "alerts",
        followUpOwner: {
          kind: "clinician",
          clinicianId: String(clinicianUser._id),
          displayName: "Dr Elena Hall",
        },
        updatedBy: {
          clinicianId: String(clinicianUser._id),
          displayName: "Dr Elena Hall",
        },
      },
      noteHistory: [],
    });
    expect(typeof response.body.coordination.createdAt).toBe("string");
    expect(typeof response.body.coordination.updatedAt).toBe("string");
    expect(typeof response.body.coordination.currentHandoff.updatedAt).toBe("string");

    const stored = await ClinicianCoordination.findOne({
      patientId: "patient-1",
    }).lean();
    expect(stored?.currentHandoff?.updatedBy).toMatchObject({
      clinicianId: String(clinicianUser._id),
      displayName: "Dr Elena Hall",
    });
  });

  it("updates the current handoff and advances both currentHandoff.updatedAt and root updatedAt", async () => {
    const clinicianUser = await createClinicianUser();

    const first = await request(app)
      .put("/clinician/patients/patient-1/coordination/current-handoff")
      .set("Authorization", `Bearer ${clinicianToken(clinicianUser)}`)
      .send({
        summary: "Start with alerts.",
        nextStep: "alerts",
        followUpOwner: { kind: "unassigned" },
      });

    vi.setSystemTime(new Date("2026-04-05T09:30:00.000Z"));

    const second = await request(app)
      .put("/clinician/patients/patient-1/coordination/current-handoff")
      .set("Authorization", `Bearer ${clinicianToken(clinicianUser)}`)
      .send({
        summary: "The next review should stay in communication follow-up.",
        nextStep: "communication",
        followUpOwner: { kind: "custom", label: "Weekend coverage" },
      });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.coordination.currentHandoff).toMatchObject({
      summary: "The next review should stay in communication follow-up.",
      nextStep: "communication",
      followUpOwner: { kind: "custom", label: "Weekend coverage" },
    });
    expect(
      Date.parse(second.body.coordination.currentHandoff.updatedAt)
    ).toBeGreaterThan(Date.parse(first.body.coordination.currentHandoff.updatedAt));
    expect(Date.parse(second.body.coordination.updatedAt)).toBeGreaterThan(
      Date.parse(first.body.coordination.updatedAt)
    );
  });

  it("saves a valid linked task id and returns the resolved linked task summary without mutating the task", async () => {
    const clinicianUser = await createClinicianUser();
    const task = await Task.create({
      patientId: "patient-1",
      title: "Review missed check-in follow-up",
      type: "follow_up",
      priority: "high",
      status: "open",
      assignedTo: "clinician-1",
      createdBy: "clinician-1",
      dueAt: new Date("2026-04-05T10:00:00.000Z"),
      source: {
        type: "manual",
        entityType: "follow_up",
        entityId: "task-1",
        label: "Manual follow-up",
      },
    });

    const response = await request(app)
      .put("/clinician/patients/patient-1/coordination/current-handoff")
      .set("Authorization", `Bearer ${clinicianToken(clinicianUser)}`)
      .send({
        summary: "Keep the task visible for the next reviewer.",
        nextStep: "tasks",
        followUpOwner: { kind: "custom", label: "Weekend review desk" },
        linkedTaskId: String(task._id),
      });

    expect(response.status).toBe(200);
    expect(response.body.coordination.currentHandoff).toMatchObject({
      summary: "Keep the task visible for the next reviewer.",
      nextStep: "tasks",
      followUpOwner: { kind: "custom", label: "Weekend review desk" },
      linkedTaskId: String(task._id),
      linkedTask: {
        id: String(task._id),
        title: "Review missed check-in follow-up",
        status: "open",
        priority: "high",
        assignedTo: "clinician-1",
      },
    });

    const readResponse = await request(app)
      .get("/clinician/patients/patient-1/coordination")
      .set("Authorization", `Bearer ${clinicianToken(clinicianUser)}`);

    expect(readResponse.status).toBe(200);
    expect(readResponse.body.coordination.currentHandoff.linkedTask).toMatchObject({
      id: String(task._id),
      title: "Review missed check-in follow-up",
      source: {
        label: "Manual follow-up",
      },
    });

    const storedTask = await Task.findById(task._id).lean();
    expect(storedTask?.status).toBe("open");
    expect(storedTask?.assignedTo).toBe("clinician-1");
  });

  it("rejects invalid or wrong-patient linked task ids", async () => {
    const clinicianUser = await createClinicianUser();
    const otherPatientTask = await Task.create({
      patientId: "patient-2",
      title: "Other patient task",
      type: "follow_up",
      priority: "medium",
      status: "open",
      createdBy: "clinician-1",
      source: { type: "manual" },
    });

    const missingTaskResponse = await request(app)
      .put("/clinician/patients/patient-1/coordination/current-handoff")
      .set("Authorization", `Bearer ${clinicianToken(clinicianUser)}`)
      .send({
        summary: "Attempt invalid link.",
        nextStep: "tasks",
        followUpOwner: { kind: "unassigned" },
        linkedTaskId: String(new mongoose.Types.ObjectId()),
      });

    expect(missingTaskResponse.status).toBe(400);
    expect(missingTaskResponse.body.error).toBe("VALIDATION_ERROR");

    const wrongPatientResponse = await request(app)
      .put("/clinician/patients/patient-1/coordination/current-handoff")
      .set("Authorization", `Bearer ${clinicianToken(clinicianUser)}`)
      .send({
        summary: "Attempt wrong-patient link.",
        nextStep: "tasks",
        followUpOwner: { kind: "unassigned" },
        linkedTaskId: String(otherPatientTask._id),
      });

    expect(wrongPatientResponse.status).toBe(400);
    expect(wrongPatientResponse.body.error).toBe("VALIDATION_ERROR");
  });

  it("appends coordination notes in newest-first order without replacing current handoff", async () => {
    const clinicianUser = await createClinicianUser();
    const authHeader = {
      Authorization: `Bearer ${clinicianToken(clinicianUser)}`,
    };

    await request(app)
      .put("/clinician/patients/patient-1/coordination/current-handoff")
      .set(authHeader)
      .send({
        summary: "Hold a short summary for the next review.",
        nextStep: "plan",
        followUpOwner: { kind: "unassigned" },
      });

    const firstNote = await request(app)
      .post("/clinician/patients/patient-1/coordination/notes")
      .set(authHeader)
      .send({
        text: "Plan review stayed local to the care team.",
      });

    vi.setSystemTime(new Date("2026-04-05T09:10:00.000Z"));

    const secondNote = await request(app)
      .post("/clinician/patients/patient-1/coordination/notes")
      .set(authHeader)
      .send({
        text: "Escalate back to alerts if pain rises again.",
      });

    expect(firstNote.status).toBe(201);
    expect(secondNote.status).toBe(201);
    expect(secondNote.body.coordination.currentHandoff.summary).toBe(
      "Hold a short summary for the next review."
    );
    expect(secondNote.body.coordination.noteHistory).toHaveLength(2);
    expect(secondNote.body.coordination.noteHistory[0]).toMatchObject({
      text: "Escalate back to alerts if pain rises again.",
      createdBy: {
        clinicianId: String(clinicianUser._id),
        displayName: "Dr Elena Hall",
      },
    });
    expect(secondNote.body.coordination.noteHistory[1]).toMatchObject({
      text: "Plan review stayed local to the care team.",
    });
    expect(secondNote.body.coordination.noteHistory[0].id).not.toBe(
      secondNote.body.coordination.noteHistory[1].id
    );
  });

  it("clears the current handoff when saved as blank monitoring + unassigned and preserves note history", async () => {
    const clinicianUser = await createClinicianUser();
    const authHeader = {
      Authorization: `Bearer ${clinicianToken(clinicianUser)}`,
    };

    await request(app)
      .put("/clinician/patients/patient-1/coordination/current-handoff")
      .set(authHeader)
      .send({
        summary: "Keep alerts visible for the next reviewer.",
        nextStep: "alerts",
        followUpOwner: { kind: "unassigned" },
      });

    await request(app)
      .post("/clinician/patients/patient-1/coordination/notes")
      .set(authHeader)
      .send({
        text: "Shared note should survive handoff clearing.",
      });

    const cleared = await request(app)
      .put("/clinician/patients/patient-1/coordination/current-handoff")
      .set(authHeader)
      .send({
        summary: "   ",
        nextStep: "monitoring",
        followUpOwner: { kind: "unassigned" },
      });

    expect(cleared.status).toBe(200);
    expect(cleared.body.coordination.currentHandoff).toBeNull();
    expect(cleared.body.coordination.noteHistory).toHaveLength(1);
    expect(cleared.body.coordination.noteHistory[0].text).toBe(
      "Shared note should survive handoff clearing."
    );
  });

  it("allows clearing the linked task while keeping the current handoff", async () => {
    const clinicianUser = await createClinicianUser();
    const task = await Task.create({
      patientId: "patient-1",
      title: "Review communication follow-up",
      type: "communication",
      priority: "medium",
      status: "in_progress",
      createdBy: "clinician-1",
      source: { type: "manual" },
    });

    await request(app)
      .put("/clinician/patients/patient-1/coordination/current-handoff")
      .set("Authorization", `Bearer ${clinicianToken(clinicianUser)}`)
      .send({
        summary: "Keep the handoff but attach a task first.",
        nextStep: "communication",
        followUpOwner: { kind: "unassigned" },
        linkedTaskId: String(task._id),
      });

    const cleared = await request(app)
      .put("/clinician/patients/patient-1/coordination/current-handoff")
      .set("Authorization", `Bearer ${clinicianToken(clinicianUser)}`)
      .send({
        summary: "Keep the handoff but clear the link.",
        nextStep: "communication",
        followUpOwner: { kind: "unassigned" },
        linkedTaskId: null,
      });

    expect(cleared.status).toBe(200);
    expect(cleared.body.coordination.currentHandoff).toMatchObject({
      summary: "Keep the handoff but clear the link.",
    });
    expect(cleared.body.coordination.currentHandoff).not.toHaveProperty("linkedTaskId");
  });

  it("does not clear a blank handoff when a linked task is still attached", async () => {
    const clinicianUser = await createClinicianUser();
    const task = await Task.create({
      patientId: "patient-1",
      title: "Open task that remains linked",
      type: "follow_up",
      priority: "medium",
      status: "open",
      createdBy: "clinician-1",
      source: { type: "manual" },
    });

    const response = await request(app)
      .put("/clinician/patients/patient-1/coordination/current-handoff")
      .set("Authorization", `Bearer ${clinicianToken(clinicianUser)}`)
      .send({
        summary: "",
        nextStep: "monitoring",
        followUpOwner: { kind: "unassigned" },
        linkedTaskId: String(task._id),
      });

    expect(response.status).toBe(200);
    expect(response.body.coordination.currentHandoff).toMatchObject({
      summary: "",
      nextStep: "monitoring",
      followUpOwner: { kind: "unassigned" },
      linkedTaskId: String(task._id),
      linkedTask: {
        id: String(task._id),
        title: "Open task that remains linked",
      },
    });

    const stored = await ClinicianCoordination.findOne({
      patientId: "patient-1",
    }).lean();
    expect(stored?.currentHandoff?.linkedTaskId).toBe(String(task._id));
  });

  it("does not create shared coordination when clearing a patient with no record", async () => {
    const clinicianUser = await createClinicianUser();

    const response = await request(app)
      .put("/clinician/patients/patient-1/coordination/current-handoff")
      .set("Authorization", `Bearer ${clinicianToken(clinicianUser)}`)
      .send({
        summary: "",
        nextStep: "monitoring",
        followUpOwner: { kind: "unassigned" },
      });

    expect(response.status).toBe(200);
    expect(response.body.coordination).toBeNull();

    const stored = await ClinicianCoordination.findOne({
      patientId: "patient-1",
    }).lean();
    expect(stored).toBeNull();
  });

  it("rejects invalid nextStep values and malformed note writes", async () => {
    const clinicianUser = await createClinicianUser();
    const authHeader = {
      Authorization: `Bearer ${clinicianToken(clinicianUser)}`,
    };

    const invalidHandoff = await request(app)
      .put("/clinician/patients/patient-1/coordination/current-handoff")
      .set(authHeader)
      .send({
        summary: "Bad next step payload.",
        nextStep: "chat",
        followUpOwner: { kind: "unassigned" },
      });

    expect(invalidHandoff.status).toBe(400);
    expect(invalidHandoff.body.error).toBe("VALIDATION_ERROR");

    const invalidNote = await request(app)
      .post("/clinician/patients/patient-1/coordination/notes")
      .set(authHeader)
      .send({
        text: "   ",
      });

    expect(invalidNote.status).toBe(400);
    expect(invalidNote.body.error).toBe("VALIDATION_ERROR");
  });

  it("keeps personal draft-like fields out of the shared coordination record", async () => {
    const clinicianUser = await createClinicianUser();

    const response = await request(app)
      .put("/clinician/patients/patient-1/coordination/current-handoff")
      .set("Authorization", `Bearer ${clinicianToken(clinicianUser)}`)
      .send({
        summary: "Shared coordination only.",
        nextStep: "tasks",
        followUpOwner: { kind: "unassigned" },
        draftReplyText: "Do not persist this as shared truth.",
      });

    expect(response.status).toBe(200);
    expect(response.body.coordination.currentHandoff).not.toHaveProperty(
      "draftReplyText"
    );

    const stored = await ClinicianCoordination.findOne({
      patientId: "patient-1",
    }).lean();
    expect(stored).not.toHaveProperty("draftReplyText");
  });

  it("stores authorship snapshots instead of resolving them live later", async () => {
    const clinicianUser = await createClinicianUser();
    const authHeader = {
      Authorization: `Bearer ${clinicianToken(clinicianUser)}`,
    };

    await request(app)
      .post("/clinician/patients/patient-1/coordination/notes")
      .set(authHeader)
      .send({
        text: "Original author snapshot should remain stable.",
      });

    await User.updateOne(
      { _id: clinicianUser._id },
      { $set: { displayName: "Dr Morgan Shaw" } }
    );

    const response = await request(app)
      .get("/clinician/patients/patient-1/coordination")
      .set(authHeader);

    expect(response.status).toBe(200);
    expect(response.body.coordination.noteHistory[0].createdBy).toMatchObject({
      clinicianId: String(clinicianUser._id),
      displayName: "Dr Elena Hall",
    });
  });

  it("enforces model validation for required fields and nested shapes", async () => {
    const missingPatientId = new ClinicianCoordination({});
    expect(missingPatientId.validateSync()?.errors.patientId).toBeDefined();

    const invalidNextStep = new ClinicianCoordination({
      patientId: "patient-1",
      currentHandoff: {
        summary: "Bad next step",
        nextStep: "chat",
        followUpOwner: { kind: "unassigned" },
        updatedBy: {
          clinicianId: "c1",
          displayName: "Dr One",
        },
        updatedAt: new Date(),
      },
    });
    expect(invalidNextStep.validateSync()?.errors["currentHandoff.nextStep"]).toBeDefined();

    const invalidNoteHistory = new ClinicianCoordination({
      patientId: "patient-1",
      noteHistory: [
        {
          id: "note-1",
          text: "",
          createdBy: {
            clinicianId: "c1",
          },
          createdAt: new Date(),
        },
      ],
    });
    const validationError = invalidNoteHistory.validateSync();
    expect(validationError?.errors["noteHistory.0.text"]).toBeDefined();
    expect(validationError?.errors["noteHistory.0.createdBy.displayName"]).toBeDefined();
  });
});
