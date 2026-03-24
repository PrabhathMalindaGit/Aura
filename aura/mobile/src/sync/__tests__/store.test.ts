import { describe, expect, it, beforeEach } from "vitest";

import { addPendingHydration, getPendingHydration } from "@/src/state/pendingHydration";
import {
  addPendingMedicationLog,
  getPendingMedicationLogs,
} from "@/src/state/pendingMedicationLogs";
import { addPendingNutrition, getPendingNutrition } from "@/src/state/pendingNutrition";
import { selectSyncSummary } from "@/src/sync/selectors";
import {
  enqueueSyncOperation,
  ensureSyncStateLoaded,
  peekStoredSyncStateForTests,
  removeSyncOperation,
  resetSyncStoreForTests,
  setSyncDomainOutcome,
} from "@/src/sync/store";

describe("sync store", () => {
  beforeEach(async () => {
    await resetSyncStoreForTests();
  });

  it("migrates legacy tracker queues once and clears old stores", async () => {
    await addPendingHydration("patient-a", {
      date: "2026-03-24",
      amountMl: 300,
    });
    await addPendingNutrition("patient-a", {
      date: "2026-03-24",
      protein: "ok",
      fruitVegServings: 4,
      antiInflammatoryFocus: true,
      mealRegularity: "regular",
    });
    await addPendingMedicationLog("patient-a", {
      medicationId: "med-1",
      date: "2026-03-24",
      time: "08:00",
      status: "taken",
    });

    const state = await ensureSyncStateLoaded("patient-a");
    const summary = selectSyncSummary(state);

    expect(state.migratedLegacy).toBe(true);
    expect(summary.byDomain.hydration.pendingCount).toBe(1);
    expect(summary.byDomain.nutrition.pendingCount).toBe(1);
    expect(summary.byDomain.medications.pendingCount).toBe(1);
    expect(await getPendingHydration("patient-a")).toEqual([]);
    expect(await getPendingNutrition("patient-a")).toEqual([]);
    expect(await getPendingMedicationLogs("patient-a")).toEqual([]);
  });

  it("keeps queued writes isolated per patient", async () => {
    await enqueueSyncOperation("patient-a", {
      domain: "hydration",
      status: "blocked_offline",
      payload: {
        date: "2026-03-24",
        amountMl: 250,
      },
    });
    await enqueueSyncOperation("patient-b", {
      domain: "medications",
      status: "queued",
      payload: {
        medicationId: "med-2",
        date: "2026-03-24",
        time: "09:00",
        status: "skipped",
      },
    });

    const patientA = await ensureSyncStateLoaded("patient-a");
    const patientB = await ensureSyncStateLoaded("patient-b");

    expect(patientA.operations).toHaveLength(1);
    expect(patientA.operations[0]?.patientId).toBe("patient-a");
    expect(patientB.operations).toHaveLength(1);
    expect(patientB.operations[0]?.patientId).toBe("patient-b");
  });

  it("persists synced outcomes after settled operations are removed", async () => {
    const operation = await enqueueSyncOperation("patient-a", {
      domain: "hydration",
      status: "queued",
      payload: {
        date: "2026-03-24",
        amountMl: 450,
      },
    });

    await setSyncDomainOutcome("patient-a", "hydration", {
      status: "synced",
      operationId: operation.operationId,
      at: "2026-03-24T10:30:00.000Z",
    });
    await removeSyncOperation("patient-a", operation.operationId);

    const stored = await peekStoredSyncStateForTests("patient-a");

    expect(stored.operations).toEqual([]);
    expect(stored.lastOutcomeByDomain.hydration).toEqual({
      status: "synced",
      operationId: operation.operationId,
      at: "2026-03-24T10:30:00.000Z",
    });
  });
});
