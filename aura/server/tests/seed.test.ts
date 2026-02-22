import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";

import Alert from "../src/models/Alert";
import CareEvent from "../src/models/CareEvent";
import ChatMessage from "../src/models/ChatMessage";
import CheckIn from "../src/models/CheckIn";
import Patient from "../src/models/Patient";
import User from "../src/models/User";
import { DEMO_TAG, resetDemoData, seedDemoData } from "../scripts/seed/lib";

describe("seed demo data", () => {
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
      Alert.deleteMany({}),
      CareEvent.deleteMany({}),
      ChatMessage.deleteMany({}),
      CheckIn.deleteMany({}),
      Patient.deleteMany({}),
      User.deleteMany({}),
    ]);
  });

  it("creates deterministic counts and valid source relationships", async () => {
    const fixedNow = new Date("2026-02-22T12:00:00.000Z");
    const firstSummary = await seedDemoData({
      now: fixedNow,
      resetFirst: true,
    });

    expect(firstSummary).toEqual({
      patients: 3,
      checkIns: 66,
      chatMessages: 30,
      alerts: 6,
      careEvents: 20,
    });

    const alertStatuses = await Alert.aggregate([
      { $match: { demoTag: DEMO_TAG } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);
    const statusMap = new Map(alertStatuses.map((item) => [item._id, item.count as number]));
    expect(statusMap.get("open")).toBe(3);
    expect(statusMap.get("acknowledged")).toBe(2);
    expect(statusMap.get("resolved")).toBe(1);

    const checkinAlert = await Alert.findOne({
      demoTag: DEMO_TAG,
      "source.type": "checkin",
    }).lean();
    expect(checkinAlert).toBeTruthy();
    const linkedCheckin = await CheckIn.exists({
      _id: checkinAlert?.source?.sourceId,
      demoTag: DEMO_TAG,
    });
    expect(linkedCheckin).toBeTruthy();

    const chatAlert = await Alert.findOne({
      demoTag: DEMO_TAG,
      "source.type": "chat",
    }).lean();
    expect(chatAlert).toBeTruthy();
    const linkedChat = await ChatMessage.exists({
      _id: chatAlert?.source?.sourceId,
      demoTag: DEMO_TAG,
    });
    expect(linkedChat).toBeTruthy();

    const alerts = await Alert.find({ demoTag: DEMO_TAG }).lean();
    for (const alert of alerts) {
      const eventsCount = await CareEvent.countDocuments({
        demoTag: DEMO_TAG,
        alertId: String(alert._id),
      });
      expect(eventsCount).toBeGreaterThan(0);
    }

    const secondSummary = await seedDemoData({
      now: fixedNow,
      resetFirst: true,
    });
    expect(secondSummary).toEqual(firstSummary);
  });

  it("reset removes only demo-tagged documents", async () => {
    await Patient.create({
      patientId: "non-demo-patient",
      displayName: "Non Demo",
      status: "active",
      clinicianId: "clinician-x",
    });

    await seedDemoData({
      now: new Date("2026-02-22T12:00:00.000Z"),
      resetFirst: true,
    });
    const resetSummary = await resetDemoData();
    expect(resetSummary.patientsDeleted).toBe(3);

    const nonDemoPatient = await Patient.findOne({
      patientId: "non-demo-patient",
    }).lean();
    expect(nonDemoPatient).toBeTruthy();
  });
});
