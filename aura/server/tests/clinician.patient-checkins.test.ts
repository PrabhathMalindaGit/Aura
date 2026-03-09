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
import Alert from "../src/models/Alert";
import CareEvent from "../src/models/CareEvent";
import CheckIn from "../src/models/CheckIn";
import ChatMessage from "../src/models/ChatMessage";
import Patient from "../src/models/Patient";

describe("GET /clinician/patients/:patientId/checkins", () => {
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
    vi.setSystemTime(new Date("2026-05-01T10:00:00.000Z"));

    await Promise.all([
      Alert.deleteMany({}),
      CareEvent.deleteMany({}),
      ChatMessage.deleteMany({}),
      CheckIn.deleteMany({}),
      Patient.deleteMany({}),
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function seedCheckins() {
    vi.setSystemTime(new Date("2026-03-01T09:00:00.000Z"));
    await CheckIn.create({
      patientId: "p1",
      date: "2026-03-01",
      mood: 2,
      pain: 8,
      symptoms: { flags: ["stiffness", "mobility_difficulty"] },
      adherence: {
        exercises: 0.2,
        medication: false,
        medicationStatus: "missed",
        medicationReason: "Forgot",
      },
      recovery: {
        difficultyLevel: 5,
        confidenceLevel: 2,
        mobilityLevel: 2,
      },
      support: {
        stressLevel: 4,
        feelsSafe: false,
        wantsFollowUp: true,
      },
      sleep: { hours: 5.5, quality: 2, disturbances: 3 },
      dailySignals: { hydrationLevel: 2, energyLevel: 2 },
      bodyMap: {
        primaryRegion: "lower_back",
        regions: [
          { region: "lower_back", intensity: 8, type: "stiffness" },
          { region: "knee_left", intensity: 6, type: "ache" },
        ],
      },
      notes: "Day one note",
      risk: { level: "high", reasons: ["pain_spike"] },
    });

    vi.setSystemTime(new Date("2026-03-03T09:00:00.000Z"));
    await CheckIn.create({
      patientId: "p1",
      date: "2026-03-03",
      mood: 3,
      pain: 6,
      adherence: { exercises: 0.5, medication: true },
      notes: "Day two note",
      risk: { level: "low", reasons: [] },
    });

    vi.setSystemTime(new Date("2026-03-05T09:00:00.000Z"));
    await CheckIn.create({
      patientId: "p1",
      date: "2026-03-05",
      mood: 4,
      pain: 4,
      adherence: { exercises: 0.8, medication: true },
      notes: "Day three note",
      risk: { level: "low", reasons: [] },
    });
  }

  it("returns ordered checkins in range with notes omitted by default", async () => {
    await seedCheckins();

    const response = await request(app).get(
      "/clinician/patients/p1/checkins?from=2026-03-01&to=2026-03-05"
    );

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.patientId).toBe("p1");
    expect(response.body.from).toBe("2026-03-01");
    expect(response.body.to).toBe("2026-03-05");
    expect(response.body.count).toBe(3);

    const checkins = response.body.checkins as Array<Record<string, unknown>>;
    expect(checkins.map((item) => item.date)).toEqual([
      "2026-03-01",
      "2026-03-03",
      "2026-03-05",
    ]);
    expect(checkins[0]).not.toHaveProperty("notes");
    expect(checkins[0]).toMatchObject({
      symptoms: {
        flags: ["stiffness", "mobility_difficulty"],
      },
      adherence: {
        exercises: 0.2,
        medication: false,
        medicationStatus: "missed",
        medicationReason: "Forgot",
      },
      recovery: {
        difficultyLevel: 5,
        confidenceLevel: 2,
        mobilityLevel: 2,
      },
      support: {
        stressLevel: 4,
        feelsSafe: false,
        wantsFollowUp: true,
      },
      sleep: {
        hours: 5.5,
        quality: 2,
        disturbances: 3,
      },
      dailySignals: {
        hydrationLevel: 2,
        energyLevel: 2,
      },
      bodyMap: {
        primaryRegion: "lower_back",
        regions: [
          { region: "lower_back", intensity: 8, type: "stiffness" },
          { region: "knee_left", intensity: 6, type: "ache" },
        ],
      },
    });
  });

  it("includes notes when includeNotes=true", async () => {
    await seedCheckins();

    const response = await request(app).get(
      "/clinician/patients/p1/checkins?from=2026-03-01&to=2026-03-05&includeNotes=true"
    );

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.count).toBe(3);

    const first = response.body.checkins[0] as Record<string, unknown>;
    expect(first.notes).toBe("Day one note");
  });

  it("returns 400 for invalid date format", async () => {
    const response = await request(app).get(
      "/clinician/patients/p1/checkins?from=2026/03/01&to=2026-03-05"
    );

    expect(response.status).toBe(400);
    expect(response.body.ok).toBe(false);
    expect(response.body.error).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when from is after to", async () => {
    const response = await request(app).get(
      "/clinician/patients/p1/checkins?from=2026-03-10&to=2026-03-05"
    );

    expect(response.status).toBe(400);
    expect(response.body.ok).toBe(false);
    expect(response.body.error).toBe("VALIDATION_ERROR");
    expect(
      (response.body.details as Array<{ path: string }>).some(
        (detail) => detail.path === "from"
      )
    ).toBe(true);
  });

  it("returns 400 when range exceeds 366 days", async () => {
    const response = await request(app).get(
      "/clinician/patients/p1/checkins?from=2025-01-01&to=2026-12-31"
    );

    expect(response.status).toBe(400);
    expect(response.body.ok).toBe(false);
    expect(response.body.error).toBe("VALIDATION_ERROR");
  });
});
