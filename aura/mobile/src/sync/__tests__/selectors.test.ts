import { describe, expect, it } from "vitest";

import { compactSyncState } from "@/src/sync/store";
import { selectPendingHydrationEntries, selectSyncSummary } from "@/src/sync/selectors";
import type { SyncPatientState } from "@/src/sync/model";

const state: SyncPatientState = {
  version: 1,
  migratedLegacy: true,
  operations: [
    {
      operationId: "hyd-1",
      patientId: "patient-a",
      domain: "hydration",
      status: "blocked_offline",
      createdAt: "2026-03-24T08:00:00.000Z",
      updatedAt: "2026-03-24T08:00:00.000Z",
      attemptCount: 0,
      payload: {
        date: "2026-03-24",
        amountMl: 250,
        clientMutationId: "hyd-1",
      },
    },
    {
      operationId: "nut-1",
      patientId: "patient-a",
      domain: "nutrition",
      status: "queued",
      createdAt: "2026-03-24T09:00:00.000Z",
      updatedAt: "2026-03-24T09:00:00.000Z",
      attemptCount: 1,
      payload: {
        date: "2026-03-24",
        protein: "ok",
        fruitVegServings: 3,
        antiInflammatoryFocus: false,
        mealRegularity: "mostly",
        clientMutationId: "nut-1",
      },
    },
    {
      operationId: "med-1",
      patientId: "patient-a",
      domain: "medications",
      status: "failed",
      createdAt: "2026-03-24T10:00:00.000Z",
      updatedAt: "2026-03-24T10:05:00.000Z",
      attemptCount: 2,
      lastFailureReason: "server",
      lastFailureMessage: "Service unavailable.",
      payload: {
        medicationId: "med-2",
        date: "2026-03-24",
        time: "10:00",
        status: "taken",
      },
    },
  ],
  lastOutcomeByDomain: {
    hydration: {
      status: "synced",
      operationId: "older",
      at: "2026-03-24T07:30:00.000Z",
    },
  },
};

describe("sync selectors", () => {
  it("derives pending and failed counts from the shared store", () => {
    const summary = selectSyncSummary(state);

    expect(summary.totalPendingCount).toBe(2);
    expect(summary.totalFailedCount).toBe(1);
    expect(summary.totalOutstandingCount).toBe(3);
    expect(summary.byDomain.hydration.pendingCount).toBe(1);
    expect(summary.byDomain.nutrition.pendingCount).toBe(1);
    expect(summary.byDomain.medications.failedCount).toBe(1);
  });

  it("maps hydration queue entries from the shared store", () => {
    const entries = selectPendingHydrationEntries(state);

    expect(entries).toEqual([
      {
        operationId: "hyd-1",
        localId: "hyd-1",
        date: "2026-03-24",
        amountMl: 250,
        createdAt: "2026-03-24T08:00:00.000Z",
        status: "blocked_offline",
        lastFailureMessage: undefined,
      },
    ]);
  });

  it("does not count expired or terminal-compacted ops, and outcomes alone do not recreate queued state", () => {
    const compacted = compactSyncState(
      {
        version: 1,
        migratedLegacy: true,
        operations: [
          {
            operationId: "expired-hyd-1",
            patientId: "patient-a",
            domain: "hydration",
            status: "blocked_offline",
            createdAt: "2026-03-01T08:00:00.000Z",
            updatedAt: "2026-03-01T08:00:00.000Z",
            attemptCount: 2,
            payload: {
              date: "2026-03-01",
              amountMl: 250,
              clientMutationId: "expired-hyd-1",
            },
          },
          {
            operationId: "terminal-nut-1",
            patientId: "patient-a",
            domain: "nutrition",
            status: "failed",
            createdAt: "2026-03-24T08:00:00.000Z",
            updatedAt: "2026-03-24T08:05:00.000Z",
            attemptCount: 1,
            lastFailureReason: "validation",
            lastFailureMessage: "The saved update is no longer valid.",
            payload: {
              date: "2026-03-24",
              protein: "ok",
              fruitVegServings: 3,
              antiInflammatoryFocus: true,
              mealRegularity: "mostly",
              clientMutationId: "terminal-nut-1",
            },
          },
        ],
        lastOutcomeByDomain: {
          hydration: {
            status: "failed",
            operationId: "expired-hyd-1",
            at: "2026-03-01T08:30:00.000Z",
            reason: "offline",
            message: "Saved on this device.",
          },
          nutrition: {
            status: "failed",
            operationId: "terminal-nut-1",
            at: "2026-03-24T08:30:00.000Z",
            reason: "validation",
            message: "The saved update is no longer valid.",
          },
        },
      },
      Date.parse("2026-03-25T08:00:00.000Z")
    ).state;

    const summary = selectSyncSummary(compacted);

    expect(summary.totalPendingCount).toBe(0);
    expect(summary.totalFailedCount).toBe(0);
    expect(summary.totalOutstandingCount).toBe(0);
    expect(summary.byDomain.hydration.lastOutcome).toMatchObject({
      operationId: "expired-hyd-1",
    });
    expect(summary.byDomain.nutrition.lastOutcome).toMatchObject({
      operationId: "terminal-nut-1",
    });
  });
});
