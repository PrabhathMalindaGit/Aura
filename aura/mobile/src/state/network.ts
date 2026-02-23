import NetInfo, {
  type NetInfoState,
  type NetInfoStateType,
} from "@react-native-community/netinfo";
import { useSyncExternalStore } from "react";

type NetworkReason = "none" | "no-connection" | "not-reachable" | "unknown";

export type NetworkSnapshot = {
  isOffline: boolean;
  isOnline: boolean;
  isInternetReachable: boolean | null;
  connectionType: string | null;
  lastChangedAt: number;
  lastOnlineAt: number | null;
  lastOfflineAt: number | null;
  reason: NetworkReason;
};

const DEBOUNCE_MS = 350;
const subscribers = new Set<() => void>();

const now = Date.now();
let snapshot: NetworkSnapshot = {
  isOffline: false,
  isOnline: true,
  isInternetReachable: null,
  connectionType: null,
  lastChangedAt: now,
  lastOnlineAt: now,
  lastOfflineAt: null,
  reason: "unknown",
};

let unsubscribeFromNetInfo: (() => void) | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingState: NetInfoState | null = null;

function notifyAll(): void {
  subscribers.forEach((listener) => listener());
}

function toConnectionType(type: NetInfoStateType): string | null {
  if (type === "unknown") {
    return "unknown";
  }
  return type ?? null;
}

function deriveConnectivity(state: NetInfoState): {
  isOffline: boolean;
  isOnline: boolean;
  reason: NetworkReason;
  isInternetReachable: boolean | null;
  connectionType: string | null;
} {
  const connectionType = toConnectionType(state.type);
  const isInternetReachable =
    typeof state.isInternetReachable === "boolean"
      ? state.isInternetReachable
      : null;

  if (connectionType === "none") {
    return {
      isOffline: true,
      isOnline: false,
      reason: "no-connection",
      isInternetReachable,
      connectionType,
    };
  }

  if (isInternetReachable === false) {
    return {
      isOffline: true,
      isOnline: false,
      reason: "not-reachable",
      isInternetReachable,
      connectionType,
    };
  }

  if (isInternetReachable === true) {
    return {
      isOffline: false,
      isOnline: true,
      reason: "none",
      isInternetReachable,
      connectionType,
    };
  }

  // Unknown reachability should not hard-block the UI.
  return {
    isOffline: false,
    isOnline: true,
    reason: "unknown",
    isInternetReachable,
    connectionType,
  };
}

function applyNetInfoState(state: NetInfoState): void {
  const next = deriveConnectivity(state);
  const changed =
    next.isOffline !== snapshot.isOffline ||
    next.isOnline !== snapshot.isOnline ||
    next.reason !== snapshot.reason ||
    next.isInternetReachable !== snapshot.isInternetReachable ||
    next.connectionType !== snapshot.connectionType;

  if (!changed) {
    return;
  }

  const changedAt = Date.now();

  snapshot = {
    ...snapshot,
    ...next,
    lastChangedAt: changedAt,
    lastOnlineAt:
      next.isOnline && !snapshot.isOnline ? changedAt : snapshot.lastOnlineAt,
    lastOfflineAt:
      next.isOffline && !snapshot.isOffline
        ? changedAt
        : snapshot.lastOfflineAt,
  };

  notifyAll();
}

function scheduleApply(state: NetInfoState): void {
  pendingState = state;
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = setTimeout(() => {
    if (pendingState) {
      applyNetInfoState(pendingState);
      pendingState = null;
    }
  }, DEBOUNCE_MS);
}

function ensureSubscription(): void {
  if (unsubscribeFromNetInfo) {
    return;
  }

  try {
    unsubscribeFromNetInfo = NetInfo.addEventListener((state) => {
      scheduleApply(state);
    });
  } catch {
    // Keep previous snapshot if NetInfo is unavailable.
  }
}

function subscribe(listener: () => void): () => void {
  subscribers.add(listener);
  ensureSubscription();

  return () => {
    subscribers.delete(listener);
  };
}

function getSnapshot(): NetworkSnapshot {
  return snapshot;
}

export async function refreshNetworkState(): Promise<void> {
  try {
    const current = await NetInfo.fetch();
    applyNetInfoState(current);
  } catch {
    // Ignore refresh failures and keep existing state.
  }
}

export function useNetwork(): NetworkSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useIsOffline(): boolean {
  return useNetwork().isOffline;
}

export function formatNetworkReason(reason: NetworkReason): string {
  switch (reason) {
    case "none":
      return "Connected";
    case "no-connection":
      return "No network connection";
    case "not-reachable":
      return "Internet is not reachable";
    case "unknown":
    default:
      return "Connection status unknown";
  }
}
