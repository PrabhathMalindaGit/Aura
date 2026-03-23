import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";

vi.mock("../src/services/ai", async () => {
  const actual = await vi.importActual<typeof import("../src/services/ai")>(
    "../src/services/ai"
  );

  return {
    ...actual,
    classify: vi.fn(),
  };
});

vi.mock("../src/services/n8n", async () => {
  const actual = await vi.importActual<typeof import("../src/services/n8n")>(
    "../src/services/n8n"
  );

  return {
    ...actual,
    emitAlertCreated: vi.fn(async () => true),
  };
});

import Alert from "../src/models/Alert";
import CareEvent from "../src/models/CareEvent";
import CheckIn from "../src/models/CheckIn";
import Task from "../src/models/Task";
import { classify } from "../src/services/ai";
import { DuplicateCheckInError, processCheckIn } from "../src/services/checkinFlow";
import { emitAlertCreated } from "../src/services/n8n";
import { logger } from "../src/utils/logger";

describe("checkinFlow integrity", () => {
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
    vi.restoreAllMocks();
    vi.mocked(classify).mockReset();
    vi.mocked(emitAlertCreated).mockReset();
    vi.mocked(emitAlertCreated).mockResolvedValue(true);

    await Promise.all([
      Alert.deleteMany({}),
      CareEvent.deleteMany({}),
      CheckIn.deleteMany({}),
      Task.deleteMany({}),
    ]);
  });

  const baseInput = {
    patientId: "p1",
    date: "2026-03-10",
    mood: 3,
    pain: 4,
  } as const;

  it("rolls back the new check-in when high-risk alert creation fails", async () => {
    vi.mocked(classify).mockResolvedValue({
      risk: "high",
      reasons: ["PAIN_GE_THRESHOLD"],
    });

    vi.spyOn(Alert, "create").mockRejectedValueOnce(new Error("alert write failed"));

    await expect(processCheckIn(baseInput)).rejects.toThrow("alert write failed");
    expect(await CheckIn.countDocuments({ patientId: "p1" })).toBe(0);
    expect(await Alert.countDocuments({ patientId: "p1" })).toBe(0);
  });

  it("logs a high-severity integrity error when rollback fails and preserves the original error", async () => {
    vi.mocked(classify).mockResolvedValue({
      risk: "high",
      reasons: ["PAIN_GE_THRESHOLD"],
    });

    const primaryError = new Error("alert write failed");
    const loggerSpy = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    vi.spyOn(Alert, "create").mockRejectedValueOnce(primaryError);
    vi.spyOn(CheckIn, "deleteOne").mockRejectedValueOnce(new Error("rollback write failed"));

    await expect(processCheckIn(baseInput)).rejects.toBe(primaryError);
    expect(loggerSpy).toHaveBeenCalledWith(
      "HIGH_SEVERITY_INTEGRITY_ERROR: check-in rollback failed",
      expect.objectContaining({
        flow: "checkin",
        stage: "alert_create",
        patientId: "p1",
        originalError: "alert write failed",
      })
    );
  });

  it("treats reminder task update failure as non-fatal after critical commit", async () => {
    vi.mocked(classify).mockResolvedValue({
      risk: "low",
      reasons: [],
    });

    vi.spyOn(Task, "updateMany").mockRejectedValueOnce(new Error("task update failed"));

    const result = await processCheckIn(baseInput);

    expect(result.riskLevel).toBe("low");
    expect(await CheckIn.countDocuments({ patientId: "p1" })).toBe(1);
  });

  it("logs follow-through CareEvent failure but keeps the check-in committed", async () => {
    vi.mocked(classify).mockResolvedValue({
      risk: "low",
      reasons: [],
    });

    const loggerSpy = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    vi.spyOn(Task, "updateMany").mockResolvedValueOnce({ modifiedCount: 1 } as never);
    vi.spyOn(CareEvent, "create").mockRejectedValueOnce(new Error("follow-through event failed"));

    const result = await processCheckIn(baseInput);

    expect(result.riskLevel).toBe("low");
    expect(await CheckIn.countDocuments({ patientId: "p1" })).toBe(1);
    expect(loggerSpy).toHaveBeenCalledWith(
      "Check-in follow-through care event write failed",
      expect.objectContaining({
        flow: "checkin",
        patientId: "p1",
      })
    );
  });

  it("logs ALERT_CREATED CareEvent failure but keeps the alert committed", async () => {
    vi.mocked(classify).mockResolvedValue({
      risk: "high",
      reasons: ["PAIN_GE_THRESHOLD"],
    });

    const loggerSpy = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    vi.spyOn(CareEvent, "create").mockRejectedValueOnce(new Error("alert event failed"));

    const result = await processCheckIn(baseInput);

    expect(result.riskLevel).toBe("high");
    expect(await CheckIn.countDocuments({ patientId: "p1" })).toBe(1);
    expect(await Alert.countDocuments({ patientId: "p1" })).toBe(1);
    expect(loggerSpy).toHaveBeenCalledWith(
      "Check-in alert care event write failed",
      expect.objectContaining({
        flow: "checkin",
        patientId: "p1",
        alertId: result.alertId,
      })
    );
  });

  it("throws DuplicateCheckInError during preflight duplicate detection", async () => {
    vi.mocked(classify).mockResolvedValue({
      risk: "low",
      reasons: [],
    });

    await CheckIn.create({
      patientId: "p1",
      date: "2026-03-10",
      mood: 3,
      pain: 4,
      risk: {
        level: "low",
        reasons: [],
      },
    });

    await expect(processCheckIn(baseInput)).rejects.toBeInstanceOf(DuplicateCheckInError);
    expect(vi.mocked(classify)).not.toHaveBeenCalled();
  });
});
