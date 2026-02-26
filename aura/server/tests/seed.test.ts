import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";

import Alert from "../src/models/Alert";
import AppointmentRequest from "../src/models/AppointmentRequest";
import AppointmentSlot from "../src/models/AppointmentSlot";
import CareEvent from "../src/models/CareEvent";
import ChatMessage from "../src/models/ChatMessage";
import CheckIn from "../src/models/CheckIn";
import ExercisePlan from "../src/models/ExercisePlan";
import Medication from "../src/models/Medication";
import MedicationLog from "../src/models/MedicationLog";
import MedicationSchedule from "../src/models/MedicationSchedule";
import Patient from "../src/models/Patient";
import NutritionLog from "../src/models/NutritionLog";
import PromInstance from "../src/models/PromInstance";
import PromTemplate from "../src/models/PromTemplate";
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
      AppointmentSlot.deleteMany({}),
      AppointmentRequest.deleteMany({}),
      NutritionLog.deleteMany({}),
      Medication.deleteMany({}),
      MedicationSchedule.deleteMany({}),
      MedicationLog.deleteMany({}),
      ExercisePlan.deleteMany({}),
      PromTemplate.deleteMany({}),
      PromInstance.deleteMany({}),
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
      appointmentSlots: 4,
      appointmentRequests: 1,
      hydrationLogs: 65,
      nutritionLogs: 34,
      medications: 4,
      medicationSchedules: 4,
      medicationLogs: 67,
      chatMessages: 30,
      alerts: 6,
      careEvents: 20,
      exercisePlans: 3,
      promTemplates: 1,
      promInstances: 4,
    });

    const promTemplate = await PromTemplate.findOne({ demoTag: DEMO_TAG }).lean();
    expect(promTemplate?.key).toBe("AURA_RECOVERY_5");

    const promDueCount = await PromInstance.countDocuments({
      demoTag: DEMO_TAG,
      status: "due",
    });
    const promCompletedCount = await PromInstance.countDocuments({
      demoTag: DEMO_TAG,
      status: "completed",
    });
    expect(promDueCount).toBe(2);
    expect(promCompletedCount).toBe(2);

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

    const checkinsWithSleepCount = await CheckIn.countDocuments({
      demoTag: DEMO_TAG,
      "sleep.hours": { $exists: true },
    });
    expect(checkinsWithSleepCount).toBeGreaterThan(0);

    const checkinsWithBodyMapCount = await CheckIn.countDocuments({
      demoTag: DEMO_TAG,
      "bodyMap.regions.0": { $exists: true },
    });
    expect(checkinsWithBodyMapCount).toBeGreaterThan(0);

    const rehabPatients = await Patient.find({ demoTag: DEMO_TAG })
      .sort({ patientId: 1 })
      .lean();
    expect(rehabPatients).toHaveLength(3);

    const p1Rehab = rehabPatients.find((patient) => patient.patientId === "p1")?.rehab;
    const p2Rehab = rehabPatients.find((patient) => patient.patientId === "p2")?.rehab;
    const p3Rehab = rehabPatients.find((patient) => patient.patientId === "p3")?.rehab;

    expect(p1Rehab?.currentKey).toBe("phase-early");
    expect(p2Rehab?.currentKey).toBe("phase-strength");
    expect(p3Rehab?.currentKey).toBe("phase-return");
    expect(Array.isArray(p1Rehab?.phases)).toBe(true);
    expect((p1Rehab?.phases ?? []).length).toBeGreaterThanOrEqual(4);
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
    expect(resetSummary.appointmentSlotsDeleted).toBe(4);
    expect(resetSummary.appointmentRequestsDeleted).toBe(1);
    expect(resetSummary.hydrationLogsDeleted).toBe(65);
    expect(resetSummary.nutritionLogsDeleted).toBe(34);
    expect(resetSummary.medicationsDeleted).toBe(4);
    expect(resetSummary.medicationSchedulesDeleted).toBe(4);
    expect(resetSummary.medicationLogsDeleted).toBe(67);
    expect(resetSummary.exercisePlansDeleted).toBe(3);
    expect(resetSummary.promTemplatesDeleted).toBe(1);
    expect(resetSummary.promInstancesDeleted).toBe(4);

    const nonDemoPatient = await Patient.findOne({
      patientId: "non-demo-patient",
    }).lean();
    expect(nonDemoPatient).toBeTruthy();
  });
});
