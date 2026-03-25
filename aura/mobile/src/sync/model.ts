import type {
  HydrationLogPayload,
  MedicationLogPayload,
  NutritionLogPayload,
} from "@/src/api/patient";

export const SYNC_DOMAINS = ["hydration", "nutrition", "medications"] as const;

export type SyncDomain = (typeof SYNC_DOMAINS)[number];

export type PersistedSyncStatus =
  | "queued"
  | "syncing"
  | "synced"
  | "failed"
  | "blocked_offline";

export type SyncOperationStatus = Exclude<PersistedSyncStatus, "synced">;

export type SyncFailureReason =
  | "offline"
  | "network"
  | "server"
  | "validation"
  | "conflict"
  | "unknown";

export type HydrationSyncPayload = HydrationLogPayload & {
  date: string;
  clientMutationId: string;
};

export type NutritionSyncPayload = NutritionLogPayload & {
  date: string;
  clientMutationId: string;
};

export type MedicationSyncPayload = MedicationLogPayload & {
  date: string;
};

type SyncOperationBase<
  TDomain extends SyncDomain,
  TPayload,
> = {
  operationId: string;
  patientId: string;
  domain: TDomain;
  status: SyncOperationStatus;
  createdAt: string;
  updatedAt: string;
  attemptCount: number;
  lastFailureReason?: SyncFailureReason;
  lastFailureMessage?: string;
  payload: TPayload;
};

export type HydrationSyncOperation = SyncOperationBase<
  "hydration",
  HydrationSyncPayload
>;

export type NutritionSyncOperation = SyncOperationBase<
  "nutrition",
  NutritionSyncPayload
>;

export type MedicationSyncOperation = SyncOperationBase<
  "medications",
  MedicationSyncPayload
>;

export type SyncOperation =
  | HydrationSyncOperation
  | NutritionSyncOperation
  | MedicationSyncOperation;

export type SyncDomainOutcome = {
  status: "synced" | "failed";
  operationId: string;
  at: string;
  reason?: SyncFailureReason;
  message?: string;
};

export type SyncPatientState = {
  version: 1;
  migratedLegacy: boolean;
  operations: SyncOperation[];
  lastOutcomeByDomain: Partial<Record<SyncDomain, SyncDomainOutcome>>;
};

export function createEmptySyncState(): SyncPatientState {
  return {
    version: 1,
    migratedLegacy: false,
    operations: [],
    lastOutcomeByDomain: {},
  };
}

export function isSyncDomain(value: unknown): value is SyncDomain {
  return (
    typeof value === "string" &&
    (SYNC_DOMAINS as readonly string[]).includes(value)
  );
}

export function createOperationId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeSyncingStatus(
  status: SyncOperationStatus
): SyncOperationStatus {
  return status === "syncing" ? "queued" : status;
}
