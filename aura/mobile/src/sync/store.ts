import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect } from "react";
import { useSyncExternalStore } from "react";

import {
  clearPendingHydration,
  getPendingHydration,
} from "@/src/state/pendingHydration";
import {
  clearPendingMedicationLogs,
  getPendingMedicationLogs,
} from "@/src/state/pendingMedicationLogs";
import {
  clearPendingNutrition,
  getPendingNutrition,
} from "@/src/state/pendingNutrition";
import {
  createEmptySyncState,
  createOperationId,
  isSyncDomain,
  normalizeSyncingStatus,
  type HydrationSyncOperation,
  type HydrationSyncPayload,
  type MedicationSyncOperation,
  type MedicationSyncPayload,
  type NutritionSyncOperation,
  type NutritionSyncPayload,
  type PersistedSyncStatus,
  type SyncDomain,
  type SyncDomainOutcome,
  type SyncFailureReason,
  type SyncOperation,
  type SyncOperationStatus,
  type SyncPatientState,
} from "@/src/sync/model";

const STORAGE_PREFIX = "aura:sync:v1:";

const listeners = new Set<() => void>();
const stateCache = new Map<string, SyncPatientState>();
const loadPromises = new Map<string, Promise<SyncPatientState>>();
const writeQueues = new Map<string, Promise<unknown>>();

function notifyAll(): void {
  listeners.forEach((listener) => listener());
}

function storageKey(patientId: string): string {
  return `${STORAGE_PREFIX}${patientId}`;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function toIsoNow(): string {
  return new Date().toISOString();
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeFailureReason(value: unknown): SyncFailureReason | undefined {
  return value === "offline" ||
    value === "network" ||
    value === "server" ||
    value === "validation" ||
    value === "conflict" ||
    value === "unknown"
    ? value
    : undefined;
}

function normalizeClientMutationId(
  value: unknown,
  fallbackOperationId?: string
): string | null {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (typeof fallbackOperationId === "string" && fallbackOperationId.trim()) {
    return fallbackOperationId.trim();
  }
  return null;
}

function normalizeHydrationPayload(
  value: unknown,
  fallbackOperationId?: string
): HydrationSyncPayload | null {
  if (!isObjectRecord(value)) {
    return null;
  }
  const clientMutationId = normalizeClientMutationId(
    value.clientMutationId,
    fallbackOperationId
  );
  if (
    typeof value.date !== "string" ||
    !value.date.trim() ||
    typeof value.amountMl !== "number" ||
    !Number.isFinite(value.amountMl) ||
    !clientMutationId
  ) {
    return null;
  }
  return {
    date: value.date,
    amountMl: Math.round(value.amountMl),
    clientMutationId,
  };
}

function normalizeNutritionPayload(
  value: unknown,
  fallbackOperationId?: string
): NutritionSyncPayload | null {
  if (!isObjectRecord(value)) {
    return null;
  }
  const clientMutationId = normalizeClientMutationId(
    value.clientMutationId,
    fallbackOperationId
  );
  if (
    typeof value.date !== "string" ||
    !value.date.trim() ||
    (value.protein !== "low" && value.protein !== "ok" && value.protein !== "high") ||
    typeof value.fruitVegServings !== "number" ||
    !Number.isFinite(value.fruitVegServings) ||
    typeof value.antiInflammatoryFocus !== "boolean" ||
    (value.mealRegularity !== "irregular" &&
      value.mealRegularity !== "mostly" &&
      value.mealRegularity !== "regular") ||
    !clientMutationId
  ) {
    return null;
  }

  const appetite =
    value.appetite === "low" ||
    value.appetite === "normal" ||
    value.appetite === "high"
      ? value.appetite
      : undefined;

  return {
    date: value.date,
    protein: value.protein,
    fruitVegServings: Math.round(value.fruitVegServings),
    antiInflammatoryFocus: value.antiInflammatoryFocus,
    mealRegularity: value.mealRegularity,
    appetite,
    notes: typeof value.notes === "string" ? value.notes.slice(0, 280) : undefined,
    clientMutationId,
  };
}

function normalizeMedicationPayload(
  value: unknown
): MedicationSyncPayload | null {
  if (!isObjectRecord(value)) {
    return null;
  }
  if (
    typeof value.medicationId !== "string" ||
    !value.medicationId.trim() ||
    typeof value.date !== "string" ||
    !value.date.trim() ||
    typeof value.time !== "string" ||
    !value.time.trim() ||
    (value.status !== "taken" && value.status !== "skipped")
  ) {
    return null;
  }
  return {
    medicationId: value.medicationId,
    date: value.date,
    time: value.time,
    status: value.status,
    note: typeof value.note === "string" ? value.note.slice(0, 280) : undefined,
  };
}

function normalizeOperation(value: unknown): SyncOperation | null {
  if (!isObjectRecord(value)) {
    return null;
  }
  if (
    typeof value.operationId !== "string" ||
    !value.operationId.trim() ||
    typeof value.patientId !== "string" ||
    !value.patientId.trim() ||
    !isSyncDomain(value.domain) ||
    (value.status !== "queued" &&
      value.status !== "syncing" &&
      value.status !== "failed" &&
      value.status !== "blocked_offline") ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string" ||
    typeof value.attemptCount !== "number" ||
    !Number.isFinite(value.attemptCount)
  ) {
    return null;
  }

  const base = {
    operationId: value.operationId,
    patientId: value.patientId,
    domain: value.domain,
    status: normalizeSyncingStatus(value.status),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    attemptCount: Math.max(0, Math.trunc(value.attemptCount)),
    lastFailureReason: normalizeFailureReason(value.lastFailureReason),
    lastFailureMessage:
      typeof value.lastFailureMessage === "string"
        ? value.lastFailureMessage
        : undefined,
  } as const;

  if (value.domain === "hydration") {
    const payload = normalizeHydrationPayload(value.payload, value.operationId);
    return payload ? { ...base, domain: "hydration", payload } : null;
  }

  if (value.domain === "nutrition") {
    const payload = normalizeNutritionPayload(value.payload, value.operationId);
    return payload ? { ...base, domain: "nutrition", payload } : null;
  }

  const payload = normalizeMedicationPayload(value.payload);
  return payload ? { ...base, domain: "medications", payload } : null;
}

function normalizeOutcome(value: unknown): SyncDomainOutcome | null {
  if (!isObjectRecord(value)) {
    return null;
  }
  if (
    (value.status !== "synced" && value.status !== "failed") ||
    typeof value.operationId !== "string" ||
    !value.operationId.trim() ||
    typeof value.at !== "string"
  ) {
    return null;
  }

  return {
    status: value.status,
    operationId: value.operationId,
    at: value.at,
    reason: normalizeFailureReason(value.reason),
    message: typeof value.message === "string" ? value.message : undefined,
  };
}

function normalizeState(value: unknown): SyncPatientState {
  if (!isObjectRecord(value)) {
    return createEmptySyncState();
  }

  const operations = Array.isArray(value.operations)
    ? value.operations
        .map((entry) => normalizeOperation(entry))
        .filter((entry): entry is SyncOperation => Boolean(entry))
    : [];

  const outcomes: Partial<Record<SyncDomain, SyncDomainOutcome>> = {};
  if (isObjectRecord(value.lastOutcomeByDomain)) {
    for (const [domain, outcome] of Object.entries(value.lastOutcomeByDomain)) {
      if (!isSyncDomain(domain)) {
        continue;
      }
      const normalized = normalizeOutcome(outcome);
      if (normalized) {
        outcomes[domain] = normalized;
      }
    }
  }

  return {
    version: 1,
    migratedLegacy: value.migratedLegacy === true,
    operations,
    lastOutcomeByDomain: outcomes,
  };
}

async function readStoredState(patientId: string): Promise<SyncPatientState> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(patientId));
    if (!raw) {
      return createEmptySyncState();
    }
    return normalizeState(JSON.parse(raw));
  } catch {
    return createEmptySyncState();
  }
}

async function persistState(
  patientId: string,
  state: SyncPatientState
): Promise<void> {
  await AsyncStorage.setItem(storageKey(patientId), JSON.stringify(state));
}

async function sweepLegacyQueues(
  patientId: string,
  baseState: SyncPatientState
): Promise<SyncPatientState> {
  if (baseState.migratedLegacy) {
    return baseState;
  }

  const [hydration, nutrition, medication] = await Promise.all([
    getPendingHydration(patientId),
    getPendingNutrition(patientId),
    getPendingMedicationLogs(patientId),
  ]);

  const existingIds = new Set(baseState.operations.map((item) => item.operationId));
  const operations = [...baseState.operations];

  for (const entry of hydration) {
    if (existingIds.has(entry.localId)) {
      continue;
    }
    existingIds.add(entry.localId);
    operations.push({
      operationId: entry.localId,
      patientId,
      domain: "hydration",
      status: "queued",
      createdAt: entry.createdAt,
      updatedAt: entry.createdAt,
      attemptCount: 0,
      payload: {
        date: entry.date,
        amountMl: entry.amountMl,
        clientMutationId: entry.localId,
      },
    });
  }

  for (const entry of nutrition) {
    if (existingIds.has(entry.localId)) {
      continue;
    }
    existingIds.add(entry.localId);
    operations.push({
      operationId: entry.localId,
      patientId,
      domain: "nutrition",
      status: "queued",
      createdAt: entry.createdAt,
      updatedAt: entry.createdAt,
      attemptCount: 0,
      payload: {
        ...entry.payload,
        date: entry.date,
        clientMutationId:
          normalizeClientMutationId(entry.payload.clientMutationId, entry.localId) ??
          entry.localId,
      },
    });
  }

  for (const entry of medication) {
    if (existingIds.has(entry.localId)) {
      continue;
    }
    existingIds.add(entry.localId);
    operations.push({
      operationId: entry.localId,
      patientId,
      domain: "medications",
      status: "queued",
      createdAt: entry.createdAt,
      updatedAt: entry.createdAt,
      attemptCount: 0,
      payload: {
        medicationId: entry.medicationId,
        date: entry.date,
        time: entry.time,
        status: entry.status,
        note: entry.note,
      },
    });
  }

  const nextState: SyncPatientState = {
    ...baseState,
    migratedLegacy: true,
    operations,
  };

  await persistState(patientId, nextState);
  stateCache.set(patientId, nextState);
  notifyAll();

  await Promise.all([
    clearPendingHydration(patientId),
    clearPendingNutrition(patientId),
    clearPendingMedicationLogs(patientId),
  ]);

  return nextState;
}

async function withPatientWriteLock<T>(
  patientId: string,
  task: () => Promise<T>
): Promise<T> {
  const previous = writeQueues.get(patientId) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(task);
  writeQueues.set(patientId, next);
  try {
    return await next;
  } finally {
    if (writeQueues.get(patientId) === next) {
      writeQueues.delete(patientId);
    }
  }
}

async function writeNextState(
  patientId: string,
  updater: (current: SyncPatientState) => SyncPatientState
): Promise<SyncPatientState> {
  return withPatientWriteLock(patientId, async () => {
    const current = await ensureSyncStateLoaded(patientId);
    const next = updater(current);
    await persistState(patientId, next);
    stateCache.set(patientId, next);
    notifyAll();
    return next;
  });
}

export function getSyncSnapshot(patientId: string): SyncPatientState {
  const trimmedPatientId = patientId.trim();
  if (!trimmedPatientId) {
    return createEmptySyncState();
  }
  return stateCache.get(trimmedPatientId) ?? createEmptySyncState();
}

export async function ensureSyncStateLoaded(
  patientId: string
): Promise<SyncPatientState> {
  const trimmedPatientId = patientId.trim();
  if (!trimmedPatientId) {
    return createEmptySyncState();
  }

  const cached = stateCache.get(trimmedPatientId);
  if (cached) {
    return cached;
  }

  const existingPromise = loadPromises.get(trimmedPatientId);
  if (existingPromise) {
    return existingPromise;
  }

  const loadingPromise = (async () => {
    const stored = await readStoredState(trimmedPatientId);
    stateCache.set(trimmedPatientId, stored);
    const migrated = await sweepLegacyQueues(trimmedPatientId, stored);
    stateCache.set(trimmedPatientId, migrated);
    notifyAll();
    return migrated;
  })();

  loadPromises.set(trimmedPatientId, loadingPromise);

  try {
    return await loadingPromise;
  } finally {
    if (loadPromises.get(trimmedPatientId) === loadingPromise) {
      loadPromises.delete(trimmedPatientId);
    }
  }
}

export function useSyncPatientState(patientId: string): SyncPatientState {
  const trimmedPatientId = patientId.trim();

  useEffect(() => {
    if (!trimmedPatientId) {
      return;
    }
    void ensureSyncStateLoaded(trimmedPatientId);
  }, [trimmedPatientId]);

  return useSyncExternalStore(
    subscribe,
    () => getSyncSnapshot(trimmedPatientId),
    () => getSyncSnapshot(trimmedPatientId)
  );
}

export type EnqueueSyncOperationInput =
  | {
      operationId?: string;
      domain: "hydration";
      status: "queued" | "failed" | "blocked_offline";
      createdAt?: string;
      attemptCount?: number;
      lastFailureReason?: SyncFailureReason;
      lastFailureMessage?: string;
      payload: HydrationSyncPayload;
    }
  | {
      operationId?: string;
      domain: "nutrition";
      status: "queued" | "failed" | "blocked_offline";
      createdAt?: string;
      attemptCount?: number;
      lastFailureReason?: SyncFailureReason;
      lastFailureMessage?: string;
      payload: NutritionSyncPayload;
    }
  | {
      operationId?: string;
      domain: "medications";
      status: "queued" | "failed" | "blocked_offline";
      createdAt?: string;
      attemptCount?: number;
      lastFailureReason?: SyncFailureReason;
      lastFailureMessage?: string;
      payload: MedicationSyncPayload;
    };

export async function enqueueSyncOperation(
  patientId: string,
  input: EnqueueSyncOperationInput
): Promise<SyncOperation> {
  const trimmedPatientId = patientId.trim();
  if (!trimmedPatientId) {
    throw new Error("patientId is required");
  }

  const operationId = input.operationId?.trim() || createOperationId();
  const createdAt = input.createdAt ?? toIsoNow();

  const operation: SyncOperation =
    input.domain === "hydration"
      ? ({
          operationId,
          patientId: trimmedPatientId,
          domain: "hydration",
          status: input.status,
          createdAt,
          updatedAt: createdAt,
          attemptCount: Math.max(0, Math.trunc(input.attemptCount ?? 0)),
          lastFailureReason: input.lastFailureReason,
          lastFailureMessage: input.lastFailureMessage,
          payload: input.payload,
        } satisfies HydrationSyncOperation)
      : input.domain === "nutrition"
        ? ({
            operationId,
            patientId: trimmedPatientId,
            domain: "nutrition",
            status: input.status,
            createdAt,
            updatedAt: createdAt,
            attemptCount: Math.max(0, Math.trunc(input.attemptCount ?? 0)),
            lastFailureReason: input.lastFailureReason,
            lastFailureMessage: input.lastFailureMessage,
            payload: input.payload,
          } satisfies NutritionSyncOperation)
        : ({
            operationId,
            patientId: trimmedPatientId,
            domain: "medications",
            status: input.status,
            createdAt,
            updatedAt: createdAt,
            attemptCount: Math.max(0, Math.trunc(input.attemptCount ?? 0)),
            lastFailureReason: input.lastFailureReason,
            lastFailureMessage: input.lastFailureMessage,
            payload: input.payload,
          } satisfies MedicationSyncOperation);

  await writeNextState(trimmedPatientId, (current) => {
    const nextOperations = current.operations.filter(
      (item) => item.operationId !== operation.operationId
    );
    nextOperations.push(operation);
    return {
      ...current,
      operations: nextOperations,
    };
  });

  return operation;
}

type UpdateOperationOptions = {
  status: SyncOperationStatus;
  lastFailureReason?: SyncFailureReason;
  lastFailureMessage?: string;
  incrementAttemptCount?: boolean;
};

export async function updateSyncOperation(
  patientId: string,
  operationId: string,
  options: UpdateOperationOptions
): Promise<SyncOperation | null> {
  const trimmedPatientId = patientId.trim();
  const trimmedOperationId = operationId.trim();
  if (!trimmedPatientId || !trimmedOperationId) {
    return null;
  }

  let updatedOperation: SyncOperation | null = null;

  await writeNextState(trimmedPatientId, (current) => {
    const operations = current.operations.map((item) => {
      if (item.operationId !== trimmedOperationId) {
        return item;
      }
      updatedOperation = {
        ...item,
        status: options.status,
        updatedAt: toIsoNow(),
        attemptCount: options.incrementAttemptCount
          ? item.attemptCount + 1
          : item.attemptCount,
        lastFailureReason: options.lastFailureReason,
        lastFailureMessage: options.lastFailureMessage,
      };
      return updatedOperation;
    });

    return {
      ...current,
      operations,
    };
  });

  return updatedOperation;
}

export async function removeSyncOperation(
  patientId: string,
  operationId: string
): Promise<void> {
  const trimmedPatientId = patientId.trim();
  const trimmedOperationId = operationId.trim();
  if (!trimmedPatientId || !trimmedOperationId) {
    return;
  }

  await writeNextState(trimmedPatientId, (current) => ({
    ...current,
    operations: current.operations.filter(
      (item) => item.operationId !== trimmedOperationId
    ),
  }));
}

export async function setSyncDomainOutcome(
  patientId: string,
  domain: SyncDomain,
  outcome: SyncDomainOutcome
): Promise<void> {
  const trimmedPatientId = patientId.trim();
  if (!trimmedPatientId) {
    return;
  }

  await writeNextState(trimmedPatientId, (current) => ({
    ...current,
    lastOutcomeByDomain: {
      ...current.lastOutcomeByDomain,
      [domain]: outcome,
    },
  }));
}

export async function clearSyncDomainOutcome(
  patientId: string,
  domain: SyncDomain
): Promise<void> {
  const trimmedPatientId = patientId.trim();
  if (!trimmedPatientId) {
    return;
  }

  await writeNextState(trimmedPatientId, (current) => {
    const nextOutcomes = { ...current.lastOutcomeByDomain };
    delete nextOutcomes[domain];
    return {
      ...current,
      lastOutcomeByDomain: nextOutcomes,
    };
  });
}

export async function resetSyncStoreForTests(): Promise<void> {
  stateCache.clear();
  loadPromises.clear();
  writeQueues.clear();
}

export async function peekStoredSyncStateForTests(
  patientId: string
): Promise<SyncPatientState> {
  return readStoredState(patientId);
}

export async function setStoredSyncStateForTests(
  patientId: string,
  state: SyncPatientState
): Promise<void> {
  await persistState(patientId, state);
  stateCache.set(patientId, state);
  notifyAll();
}

export type SyncOperationFailureUpdate = {
  reason: SyncFailureReason;
  message?: string;
  nextStatus: Extract<SyncOperationStatus, "failed" | "blocked_offline">;
};

export function toStoredOutcomeStatus(
  status: PersistedSyncStatus
): SyncOperationStatus | "synced" {
  return status === "synced" ? "synced" : status;
}
