import type { StatusPillVariant } from "@/src/components/StatusPill";
import type { SyncDomainSummary } from "@/src/sync/selectors";

export type QueueableSyncSurface = {
  label: string;
  variant: StatusPillVariant;
  message: string | null;
};

export function getQueueableSyncSurface(
  summary: SyncDomainSummary
): QueueableSyncSurface {
  if (summary.syncingCount > 0) {
    const count = summary.syncingCount;
    return {
      label: "Syncing",
      variant: "info",
      message: `Syncing ${count} saved update${count === 1 ? "" : "s"}.`,
    };
  }

  if (summary.failedCount > 0) {
    const count = summary.failedCount;
    return {
      label: "Couldn't sync",
      variant: "warning",
      message: `${count} saved update${count === 1 ? "" : "s"} couldn’t sync.`,
    };
  }

  if (summary.pendingCount > 0) {
    const count = summary.pendingCount;
    return {
      label: "Saved on this device",
      variant: "warning",
      message: `${count} saved update${count === 1 ? "" : "s"} waiting to sync.`,
    };
  }

  if (summary.lastOutcome?.status === "synced") {
    return {
      label: "Synced",
      variant: "success",
      message: "Latest saved update synced.",
    };
  }

  if (summary.lastOutcome?.status === "failed") {
    return {
      label: "Couldn't sync",
      variant: "warning",
      message:
        summary.lastOutcome.message ?? "A saved update couldn’t sync yet.",
    };
  }

  return {
    label: "Ready",
    variant: "neutral",
    message: null,
  };
}

export function getPendingItemCopy(
  status: "queued" | "syncing" | "failed" | "blocked_offline"
): { label: string; variant: StatusPillVariant; helper: string } {
  if (status === "syncing") {
    return {
      label: "Syncing",
      variant: "info",
      helper: "Syncing now.",
    };
  }

  if (status === "failed") {
    return {
      label: "Couldn't sync",
      variant: "warning",
      helper: "Saved on this device and needs retry.",
    };
  }

  return {
    label: "Saved on this device",
    variant: "warning",
    helper: "Saved on this device and waiting to sync.",
  };
}
