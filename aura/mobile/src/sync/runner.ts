import { isApiError, type ApiError } from "@/src/api/client";
import { normalizeUnknownError } from "@/src/utils/errors";
import type {
  MedicationSyncPayload,
  NutritionSyncPayload,
  SyncDomain,
  SyncFailureReason,
  SyncOperation,
} from "@/src/sync/model";
import {
  enqueueSyncOperation,
  ensureSyncStateLoaded,
  removeSyncOperation,
  setSyncDomainOutcome,
  updateSyncOperation,
} from "@/src/sync/store";
import { selectDomainOperations } from "@/src/sync/selectors";
import { sendHydrationSync } from "@/src/sync/adapters/hydration";
import { sendMedicationSync } from "@/src/sync/adapters/medications";
import { sendNutritionSync } from "@/src/sync/adapters/nutrition";

type QueueablePayloadByDomain = {
  hydration: Parameters<typeof sendHydrationSync>[1];
  nutrition: NutritionSyncPayload;
  medications: MedicationSyncPayload;
};

type NormalizedSyncError = {
  title: string;
  message: string;
  reason: SyncFailureReason;
  retryable: boolean;
  nextStatus: "failed" | "blocked_offline";
};

type SyncAdapterRegistry = {
  [Domain in SyncDomain]: (
    token: string,
    payload: QueueablePayloadByDomain[Domain]
  ) => Promise<void>;
};

const adapters: SyncAdapterRegistry = {
  hydration: sendHydrationSync,
  nutrition: sendNutritionSync,
  medications: sendMedicationSync,
};

const flushLocks = new Map<string, Promise<FlushPendingWritesResult>>();

function flushLockKey(patientId: string, domains?: SyncDomain[]): string {
  const suffix = domains && domains.length > 0 ? domains.slice().sort().join(",") : "all";
  return `${patientId}::${suffix}`;
}

function normalizeSyncError(error: unknown): NormalizedSyncError {
  let apiError: ApiError;
  if (isApiError(error)) {
    apiError = error;
  } else {
    const fallback = normalizeUnknownError(error);
    apiError = {
      title: fallback.title,
      message: fallback.message,
      kind: fallback.kind,
      retryable: fallback.retryable,
      detail: fallback.detail,
    };
  }

  if (apiError.kind === "offline") {
    return {
      title: apiError.title || "Offline",
      message: apiError.message || "Offline. Nothing was sent.",
      reason: "offline",
      retryable: true,
      nextStatus: "blocked_offline",
    };
  }

  if (apiError.kind === "network") {
    return {
      title: apiError.title || "Couldn’t sync",
      message: apiError.message || "Couldn’t reach the service.",
      reason: "network",
      retryable: true,
      nextStatus: "failed",
    };
  }

  if (apiError.kind === "server") {
    return {
      title: apiError.title || "Couldn’t sync",
      message: apiError.message || "Service unavailable.",
      reason: "server",
      retryable: true,
      nextStatus: "failed",
    };
  }

  if (apiError.kind === "validation") {
    const reason =
      typeof apiError.detail === "string" &&
      apiError.detail.toLowerCase().includes("conflict")
        ? "conflict"
        : "validation";
    return {
      title: apiError.title || "Couldn’t sync",
      message: apiError.message || "The saved update is no longer valid.",
      reason,
      retryable: false,
      nextStatus: "failed",
    };
  }

  return {
    title: apiError.title || "Couldn’t sync",
    message: apiError.message || "Something went wrong.",
    reason: "unknown",
    retryable: true,
    nextStatus: "failed",
  };
}

function isQueueableFailure(error: NormalizedSyncError): boolean {
  return error.reason !== "validation" && error.reason !== "conflict";
}

async function sendOperation(operation: SyncOperation, token: string): Promise<void> {
  if (operation.domain === "hydration") {
    await adapters.hydration(token, operation.payload);
    return;
  }
  if (operation.domain === "nutrition") {
    await adapters.nutrition(token, operation.payload);
    return;
  }
  await adapters.medications(token, operation.payload);
}

export type SubmitQueueableWriteResult<TResponse> =
  | {
      kind: "synced";
      response: TResponse;
    }
  | {
      kind: "queued";
      operation: SyncOperation;
      normalizedError?: NormalizedSyncError;
    };

export async function submitQueueableWrite<
  Domain extends SyncDomain,
  TResponse,
>(options: {
  patientId: string;
  token: string;
  isOffline: boolean;
  domain: Domain;
  payload: QueueablePayloadByDomain[Domain];
  send: (
    token: string,
    payload: QueueablePayloadByDomain[Domain]
  ) => Promise<TResponse>;
}): Promise<SubmitQueueableWriteResult<TResponse>> {
  const trimmedPatientId = options.patientId.trim();
  if (!trimmedPatientId) {
    throw new Error("patientId is required");
  }

  await ensureSyncStateLoaded(trimmedPatientId);

  if (options.isOffline) {
    const operation = await enqueueSyncOperation(trimmedPatientId, {
      domain: options.domain,
      status: "blocked_offline",
      payload: options.payload,
    } as never);
    return {
      kind: "queued",
      operation,
    };
  }

  try {
    const response = await options.send(options.token, options.payload);
    await setSyncDomainOutcome(trimmedPatientId, options.domain, {
      status: "synced",
      operationId: "direct-send",
      at: new Date().toISOString(),
    });
    return {
      kind: "synced",
      response,
    };
  } catch (error) {
    const normalized = normalizeSyncError(error);
    if (!isQueueableFailure(normalized)) {
      throw error;
    }

    const operation = await enqueueSyncOperation(trimmedPatientId, {
      domain: options.domain,
      status: normalized.nextStatus,
      lastFailureReason: normalized.reason,
      lastFailureMessage: normalized.message,
      attemptCount: 1,
      payload: options.payload,
    } as never);

    await setSyncDomainOutcome(trimmedPatientId, options.domain, {
      status: "failed",
      operationId: operation.operationId,
      at: new Date().toISOString(),
      reason: normalized.reason,
      message: normalized.message,
    });

    return {
      kind: "queued",
      operation,
      normalizedError: normalized,
    };
  }
}

export type FlushPendingWritesResult = {
  attempted: number;
  synced: number;
  failed: number;
  blockedOffline: number;
  remaining: number;
  lastError?: NormalizedSyncError;
};

async function flushPendingWritesInternal(options: {
  patientId: string;
  token: string | null;
  isOnline: boolean;
  domains?: SyncDomain[];
}): Promise<FlushPendingWritesResult> {
  const trimmedPatientId = options.patientId.trim();
  if (!trimmedPatientId || !options.token || !options.isOnline) {
    return {
      attempted: 0,
      synced: 0,
      failed: 0,
      blockedOffline: options.isOnline ? 0 : 1,
      remaining: 0,
    };
  }

  const state = await ensureSyncStateLoaded(trimmedPatientId);
  const selectedDomains = options.domains && options.domains.length > 0
    ? options.domains
    : (["hydration", "nutrition", "medications"] as SyncDomain[]);

  const operations = selectedDomains
    .flatMap((domain) => selectDomainOperations(state, domain))
    .filter((operation) => operation.status !== "syncing")
    .sort(
      (left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt)
    );

  if (operations.length === 0) {
    return {
      attempted: 0,
      synced: 0,
      failed: 0,
      blockedOffline: 0,
      remaining: 0,
    };
  }

  let attempted = 0;
  let synced = 0;
  let failed = 0;
  let blockedOffline = 0;
  let lastError: NormalizedSyncError | undefined;

  for (const operation of operations) {
    attempted += 1;
    await updateSyncOperation(trimmedPatientId, operation.operationId, {
      status: "syncing",
      incrementAttemptCount: true,
    });

    try {
      await sendOperation(operation, options.token);
      synced += 1;
      await removeSyncOperation(trimmedPatientId, operation.operationId);
      await setSyncDomainOutcome(trimmedPatientId, operation.domain, {
        status: "synced",
        operationId: operation.operationId,
        at: new Date().toISOString(),
      });
    } catch (error) {
      lastError = normalizeSyncError(error);
      if (lastError.nextStatus === "blocked_offline") {
        blockedOffline += 1;
      } else {
        failed += 1;
      }
      if (lastError.reason === "conflict") {
        await removeSyncOperation(trimmedPatientId, operation.operationId);
        await setSyncDomainOutcome(trimmedPatientId, operation.domain, {
          status: "failed",
          operationId: operation.operationId,
          at: new Date().toISOString(),
          reason: lastError.reason,
          message: lastError.message,
        });
        break;
      }
      await updateSyncOperation(trimmedPatientId, operation.operationId, {
        status: lastError.nextStatus,
        lastFailureReason: lastError.reason,
        lastFailureMessage: lastError.message,
      });
      await setSyncDomainOutcome(trimmedPatientId, operation.domain, {
        status: "failed",
        operationId: operation.operationId,
        at: new Date().toISOString(),
        reason: lastError.reason,
        message: lastError.message,
      });
      break;
    }
  }

  const latestState = await ensureSyncStateLoaded(trimmedPatientId);
  const remaining = selectedDomains.reduce(
    (sum, domain) => sum + selectDomainOperations(latestState, domain).length,
    0
  );

  return {
    attempted,
    synced,
    failed,
    blockedOffline,
    remaining,
    lastError,
  };
}

export async function flushPendingWrites(options: {
  patientId: string;
  token: string | null;
  isOnline: boolean;
  domains?: SyncDomain[];
}): Promise<FlushPendingWritesResult> {
  const trimmedPatientId = options.patientId.trim();
  if (!trimmedPatientId) {
    return {
      attempted: 0,
      synced: 0,
      failed: 0,
      blockedOffline: 0,
      remaining: 0,
    };
  }

  const key = flushLockKey(trimmedPatientId, options.domains);
  const existing = flushLocks.get(key);
  if (existing) {
    return existing;
  }

  const task = flushPendingWritesInternal(options);
  flushLocks.set(key, task);
  try {
    return await task;
  } finally {
    if (flushLocks.get(key) === task) {
      flushLocks.delete(key);
    }
  }
}
