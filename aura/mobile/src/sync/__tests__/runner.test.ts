import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/sync/adapters/hydration", () => ({
  sendHydrationSync: vi.fn(async () => undefined),
}));

vi.mock("@/src/sync/adapters/nutrition", () => ({
  sendNutritionSync: vi.fn(async () => undefined),
}));

vi.mock("@/src/sync/adapters/medications", () => ({
  sendMedicationSync: vi.fn(async () => undefined),
}));

import { sendHydrationSync } from "@/src/sync/adapters/hydration";
import { sendMedicationSync } from "@/src/sync/adapters/medications";
import { sendNutritionSync } from "@/src/sync/adapters/nutrition";
import { selectSyncSummary } from "@/src/sync/selectors";
import { flushPendingWrites, submitQueueableWrite } from "@/src/sync/runner";
import {
  enqueueSyncOperation,
  ensureSyncStateLoaded,
  resetSyncStoreForTests,
} from "@/src/sync/store";

describe("sync runner", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await resetSyncStoreForTests();
  });

  it("queues blocked offline writes and flushes them on retry", async () => {
    const queued = await submitQueueableWrite({
      patientId: "patient-a",
      token: "token-a",
      isOffline: true,
      domain: "hydration",
      payload: {
        date: "2026-03-24",
        amountMl: 250,
        clientMutationId: "hydration-offline-1",
      },
      send: async () => ({ ok: true }),
    });

    expect(queued.kind).toBe("queued");

    const result = await flushPendingWrites({
      patientId: "patient-a",
      token: "token-a",
      isOnline: true,
      domains: ["hydration"],
    });

    const state = await ensureSyncStateLoaded("patient-a");
    const summary = selectSyncSummary(state);

    expect(result.synced).toBe(1);
    expect(sendHydrationSync).toHaveBeenCalledTimes(1);
    expect(sendHydrationSync).toHaveBeenCalledWith(
      "token-a",
      expect.objectContaining({ clientMutationId: "hydration-offline-1" })
    );
    expect(summary.totalOutstandingCount).toBe(0);
    expect(state.lastOutcomeByDomain.hydration?.status).toBe("synced");
  });

  it("keeps the same clientMutationId when an initial hydration send is replayed later", async () => {
    const initialSend = vi.fn(async () => {
      throw {
        title: "Network error",
        message: "Could not reach the service. Please try again.",
        kind: "network",
        retryable: true,
      };
    });

    const result = await submitQueueableWrite({
      patientId: "patient-a",
      token: "token-a",
      isOffline: false,
      domain: "hydration",
      payload: {
        date: "2026-03-24",
        amountMl: 300,
        clientMutationId: "hydration-replay-1",
      },
      send: initialSend,
    });

    expect(result.kind).toBe("queued");
    expect(initialSend).toHaveBeenCalledWith(
      "token-a",
      expect.objectContaining({ clientMutationId: "hydration-replay-1" })
    );

    await flushPendingWrites({
      patientId: "patient-a",
      token: "token-a",
      isOnline: true,
      domains: ["hydration"],
    });

    expect(sendHydrationSync).toHaveBeenCalledWith(
      "token-a",
      expect.objectContaining({ clientMutationId: "hydration-replay-1" })
    );
  });

  it("marks replay failures without touching another patient's queue", async () => {
    vi.mocked(sendHydrationSync).mockRejectedValueOnce({
      title: "Offline",
      message: "You’re offline. Nothing was sent.",
      kind: "offline",
      retryable: true,
    });

    await enqueueSyncOperation("patient-a", {
      domain: "hydration",
      status: "queued",
      payload: {
        date: "2026-03-24",
        amountMl: 200,
        clientMutationId: "hydration-fail-1",
      },
    });
    await enqueueSyncOperation("patient-b", {
      domain: "nutrition",
      status: "queued",
      payload: {
        date: "2026-03-24",
        protein: "high",
        fruitVegServings: 5,
        antiInflammatoryFocus: true,
        mealRegularity: "regular",
        clientMutationId: "nutrition-fail-1",
      },
    });

    const result = await flushPendingWrites({
      patientId: "patient-a",
      token: "token-a",
      isOnline: true,
      domains: ["hydration"],
    });

    const patientA = await ensureSyncStateLoaded("patient-a");
    const patientB = await ensureSyncStateLoaded("patient-b");

    expect(result.blockedOffline).toBe(1);
    expect(patientA.operations[0]?.status).toBe("blocked_offline");
    expect(patientB.operations).toHaveLength(1);
    expect(patientB.operations[0]?.domain).toBe("nutrition");
    expect(sendNutritionSync).not.toHaveBeenCalled();
    expect(sendMedicationSync).not.toHaveBeenCalled();
  });

  it("removes replayed conflicts so they do not retry forever", async () => {
    vi.mocked(sendNutritionSync).mockRejectedValueOnce({
      status: 409,
      title: "Sync conflict",
      message: "This saved update conflicts with an earlier sync attempt.",
      kind: "validation",
      retryable: false,
      detail: "conflict",
    });

    await enqueueSyncOperation("patient-a", {
      domain: "nutrition",
      status: "queued",
      payload: {
        date: "2026-03-24",
        protein: "ok",
        fruitVegServings: 3,
        antiInflammatoryFocus: true,
        mealRegularity: "mostly",
        notes: "Soup",
        clientMutationId: "nutrition-conflict-1",
      },
    });

    const result = await flushPendingWrites({
      patientId: "patient-a",
      token: "token-a",
      isOnline: true,
      domains: ["nutrition"],
    });

    const state = await ensureSyncStateLoaded("patient-a");

    expect(result.failed).toBe(1);
    expect(result.remaining).toBe(0);
    expect(state.operations).toEqual([]);
    expect(state.lastOutcomeByDomain.nutrition).toMatchObject({
      status: "failed",
      reason: "conflict",
    });
  });

  it("does not flush before auth/token is available", async () => {
    await enqueueSyncOperation("patient-a", {
      domain: "medications",
      status: "queued",
      payload: {
        medicationId: "med-1",
        date: "2026-03-24",
        time: "08:00",
        status: "taken",
      },
    });

    const result = await flushPendingWrites({
      patientId: "patient-a",
      token: null,
      isOnline: true,
      domains: ["medications"],
    });

    const state = await ensureSyncStateLoaded("patient-a");

    expect(result.attempted).toBe(0);
    expect(state.operations).toHaveLength(1);
    expect(sendMedicationSync).not.toHaveBeenCalled();
  });
});
