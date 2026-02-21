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
import CheckIn from "../src/models/CheckIn";
import Patient from "../src/models/Patient";

describe("GET /clinician/patients/:patientId/trends", () => {
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
    vi.setSystemTime(new Date("2026-03-15T12:00:00.000Z"));

    await Promise.all([
      Alert.deleteMany({}),
      CheckIn.deleteMany({}),
      Patient.deleteMany({}),
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns only records inside the requested 14-day window in ascending order", async () => {
    vi.setSystemTime(new Date("2026-02-20T09:00:00.000Z"));
    await CheckIn.create({
      patientId: "p1",
      date: "2026-02-20",
      mood: 3,
      pain: 4,
      adherence: { exercises: 0.4, medication: true },
      notes: "Older check-in outside requested window.",
    });

    vi.setSystemTime(new Date("2026-03-05T13:00:00.000Z"));
    await CheckIn.create({
      patientId: "p1",
      date: "2026-03-05",
      mood: 2,
      pain: 8,
      adherence: { exercises: 0.2, medication: false },
      notes: "Pain elevated",
      risk: { level: "high", reasons: ["pain_spike"] },
    });

    vi.setSystemTime(new Date("2026-03-14T16:30:00.000Z"));
    await CheckIn.create({
      patientId: "p1",
      date: "2026-03-14",
      mood: 4,
      pain: 5,
      adherence: { exercises: 0.7, medication: true },
      risk: { level: "low", reasons: [] },
    });

    vi.setSystemTime(new Date("2026-03-15T12:00:00.000Z"));

    const response = await request(app).get(
      "/clinician/patients/p1/trends?days=14"
    );

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.patientId).toBe("p1");
    expect(response.body.days).toBe(14);
    expect(Array.isArray(response.body.trends)).toBe(true);
    expect(response.body.trends).toHaveLength(2);

    const first = response.body.trends[0] as Record<string, unknown>;
    const second = response.body.trends[1] as Record<string, unknown>;

    expect(first).toEqual(
      expect.objectContaining({
        date: "2026-03-05",
        pain: 8,
        mood: 2,
        adherence: expect.objectContaining({
          exercises: 0.2,
          medication: false,
        }),
      })
    );

    expect(second).toEqual(
      expect.objectContaining({
        date: "2026-03-14",
        pain: 5,
        mood: 4,
        adherence: expect.objectContaining({
          exercises: 0.7,
          medication: true,
        }),
      })
    );

    expect(typeof first.createdAt).toBe("string");
    expect(typeof second.createdAt).toBe("string");
    expect(Date.parse(first.createdAt as string)).toBeLessThan(
      Date.parse(second.createdAt as string)
    );

    const dates = response.body.trends.map((item: { date: string }) => item.date);
    expect(dates).not.toContain("2026-02-20");
  });

  it("returns 400 for invalid days values", async () => {
    const response = await request(app).get(
      "/clinician/patients/p1/trends?days=999"
    );

    expect(response.status).toBe(400);
    expect(response.body.ok).toBe(false);
    expect(response.body.error).toBe("VALIDATION_ERROR");
  });

  it("truncates notesPreview to a safe short value", async () => {
    vi.setSystemTime(new Date("2026-03-14T11:00:00.000Z"));
    await CheckIn.create({
      patientId: "p1",
      date: "2026-03-14",
      mood: 3,
      pain: 7,
      adherence: { exercises: 0.5, medication: true },
      notes: "A".repeat(220),
    });

    vi.setSystemTime(new Date("2026-03-15T12:00:00.000Z"));

    const response = await request(app).get(
      "/clinician/patients/p1/trends?days=14"
    );

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.trends).toHaveLength(1);

    const trend = response.body.trends[0] as { notesPreview?: string };
    expect(typeof trend.notesPreview).toBe("string");
    expect((trend.notesPreview ?? "").length).toBeLessThanOrEqual(123);
    expect(trend.notesPreview?.endsWith("…")).toBe(true);
  });
});
