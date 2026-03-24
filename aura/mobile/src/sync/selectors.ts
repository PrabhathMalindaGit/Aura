import { useMemo } from "react";

import type {
  SyncDomain,
  SyncDomainOutcome,
  SyncOperation,
  SyncPatientState,
} from "@/src/sync/model";
import { useSyncPatientState } from "@/src/sync/store";

export type SyncDomainSummary = {
  domain: SyncDomain;
  pendingCount: number;
  failedCount: number;
  syncingCount: number;
  blockedOfflineCount: number;
  outstandingCount: number;
  lastOutcome: SyncDomainOutcome | null;
};

export type SyncSummary = {
  totalPendingCount: number;
  totalFailedCount: number;
  totalOutstandingCount: number;
  totalSyncingCount: number;
  hasFailures: boolean;
  hasPending: boolean;
  byDomain: Record<SyncDomain, SyncDomainSummary>;
};

export type PendingHydrationSyncEntry = {
  operationId: string;
  localId: string;
  date: string;
  amountMl: number;
  createdAt: string;
  status: SyncOperation["status"];
  lastFailureMessage?: string;
};

export type PendingNutritionSyncEntry = {
  operationId: string;
  localId: string;
  date: string;
  createdAt: string;
  status: SyncOperation["status"];
  lastFailureMessage?: string;
  payload: {
    protein: "low" | "ok" | "high";
    fruitVegServings: number;
    antiInflammatoryFocus: boolean;
    mealRegularity: "irregular" | "mostly" | "regular";
    appetite?: "low" | "normal" | "high";
    notes?: string;
  };
};

export type PendingMedicationSyncEntry = {
  operationId: string;
  localId: string;
  createdAt: string;
  status: SyncOperation["status"];
  lastFailureMessage?: string;
  payload: {
    medicationId: string;
    date: string;
    time: string;
    status: "taken" | "skipped";
    note?: string;
  };
};

function createDomainSummary(domain: SyncDomain): SyncDomainSummary {
  return {
    domain,
    pendingCount: 0,
    failedCount: 0,
    syncingCount: 0,
    blockedOfflineCount: 0,
    outstandingCount: 0,
    lastOutcome: null,
  };
}

export function selectDomainOperations(
  state: SyncPatientState,
  domain: SyncDomain
): SyncOperation[] {
  return state.operations
    .filter((operation) => operation.domain === domain)
    .slice()
    .sort(
      (left, right) =>
        Date.parse(left.createdAt) - Date.parse(right.createdAt)
    );
}

export function selectSyncSummary(state: SyncPatientState): SyncSummary {
  const byDomain: Record<SyncDomain, SyncDomainSummary> = {
    hydration: createDomainSummary("hydration"),
    nutrition: createDomainSummary("nutrition"),
    medications: createDomainSummary("medications"),
  };

  for (const operation of state.operations) {
    const summary = byDomain[operation.domain];
    summary.outstandingCount += 1;
    if (operation.status === "failed") {
      summary.failedCount += 1;
      continue;
    }
    summary.pendingCount += 1;
    if (operation.status === "syncing") {
      summary.syncingCount += 1;
    }
    if (operation.status === "blocked_offline") {
      summary.blockedOfflineCount += 1;
    }
  }

  (Object.keys(byDomain) as SyncDomain[]).forEach((domain) => {
    byDomain[domain].lastOutcome = state.lastOutcomeByDomain[domain] ?? null;
  });

  const domainValues = Object.values(byDomain);
  const totalPendingCount = domainValues.reduce(
    (sum, item) => sum + item.pendingCount,
    0
  );
  const totalFailedCount = domainValues.reduce(
    (sum, item) => sum + item.failedCount,
    0
  );
  const totalOutstandingCount = domainValues.reduce(
    (sum, item) => sum + item.outstandingCount,
    0
  );
  const totalSyncingCount = domainValues.reduce(
    (sum, item) => sum + item.syncingCount,
    0
  );

  return {
    totalPendingCount,
    totalFailedCount,
    totalOutstandingCount,
    totalSyncingCount,
    hasFailures: totalFailedCount > 0,
    hasPending: totalPendingCount > 0,
    byDomain,
  };
}

export function useSyncSummary(patientId: string): SyncSummary {
  const state = useSyncPatientState(patientId);
  return useMemo(() => selectSyncSummary(state), [state]);
}

export function useSyncDomainSummary(
  patientId: string,
  domain: SyncDomain
): SyncDomainSummary {
  const summary = useSyncSummary(patientId);
  return summary.byDomain[domain];
}

export function selectPendingHydrationEntries(
  state: SyncPatientState
): PendingHydrationSyncEntry[] {
  return (
    selectDomainOperations(state, "hydration") as Array<
      Extract<SyncOperation, { domain: "hydration" }>
    >
  ).map((operation) => ({
    operationId: operation.operationId,
    localId: operation.operationId,
    date: operation.payload.date,
    amountMl: operation.payload.amountMl,
    createdAt: operation.createdAt,
    status: operation.status,
    lastFailureMessage: operation.lastFailureMessage,
  }));
}

export function selectPendingNutritionEntries(
  state: SyncPatientState
): PendingNutritionSyncEntry[] {
  return (
    selectDomainOperations(state, "nutrition") as Array<
      Extract<SyncOperation, { domain: "nutrition" }>
    >
  ).map((operation) => ({
    operationId: operation.operationId,
    localId: operation.operationId,
    date: operation.payload.date,
    createdAt: operation.createdAt,
    status: operation.status,
    lastFailureMessage: operation.lastFailureMessage,
    payload: {
      protein: operation.payload.protein,
      fruitVegServings: operation.payload.fruitVegServings,
      antiInflammatoryFocus: operation.payload.antiInflammatoryFocus,
      mealRegularity: operation.payload.mealRegularity,
      appetite: operation.payload.appetite,
      notes: operation.payload.notes,
    },
  }));
}

export function selectPendingMedicationEntries(
  state: SyncPatientState
): PendingMedicationSyncEntry[] {
  return (
    selectDomainOperations(state, "medications") as Array<
      Extract<SyncOperation, { domain: "medications" }>
    >
  ).map((operation) => ({
    operationId: operation.operationId,
    localId: operation.operationId,
    createdAt: operation.createdAt,
    status: operation.status,
    lastFailureMessage: operation.lastFailureMessage,
    payload: {
      medicationId: operation.payload.medicationId,
      date: operation.payload.date,
      time: operation.payload.time,
      status: operation.payload.status,
      note: operation.payload.note,
    },
  }));
}
