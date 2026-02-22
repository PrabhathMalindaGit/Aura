import { useSyncExternalStore } from 'react';
import { asAppError, type AppErrorKind } from '../utils/errors';

type Listener = () => void;

export interface ConnectionSnapshot {
  online: boolean;
  lastSuccessAt: number | null;
  lastErrorAt: number | null;
  lastErrorKind?: AppErrorKind;
  lastHttpStatus?: number;
  lastEndpoint?: string;
  lastErrorMessage?: string;
  offlineSequence: number;
}

const listeners = new Set<Listener>();

let snapshot: ConnectionSnapshot = {
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  lastSuccessAt: null,
  lastErrorAt: null,
  lastErrorKind: undefined,
  lastHttpStatus: undefined,
  lastEndpoint: undefined,
  lastErrorMessage: undefined,
  offlineSequence: 0,
};

let hasWindowListeners = false;

function safeErrorMessage(kind: AppErrorKind): string {
  if (kind === 'Network') {
    return 'You appear offline.';
  }

  if (kind === 'Timeout') {
    return 'Request timed out.';
  }

  if (kind === 'HTTP') {
    return 'Service unavailable.';
  }

  if (kind === 'Parse') {
    return 'Invalid server response.';
  }

  return 'Unexpected error.';
}

function normalizeEndpointPath(endpointPath?: string): string | undefined {
  if (!endpointPath) {
    return undefined;
  }

  if (/^https?:\/\//.test(endpointPath)) {
    try {
      const url = new URL(endpointPath);
      return url.pathname || '/';
    } catch {
      return undefined;
    }
  }

  return endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`;
}

function setSnapshot(next: ConnectionSnapshot): void {
  if (
    snapshot.online === next.online &&
    snapshot.lastSuccessAt === next.lastSuccessAt &&
    snapshot.lastErrorAt === next.lastErrorAt &&
    snapshot.lastErrorKind === next.lastErrorKind &&
    snapshot.lastHttpStatus === next.lastHttpStatus &&
    snapshot.lastEndpoint === next.lastEndpoint &&
    snapshot.lastErrorMessage === next.lastErrorMessage &&
    snapshot.offlineSequence === next.offlineSequence
  ) {
    return;
  }

  snapshot = next;
  listeners.forEach((listener) => listener());
}

function registerBrowserListeners(): void {
  if (hasWindowListeners || typeof window === 'undefined') {
    return;
  }

  hasWindowListeners = true;

  window.addEventListener('online', () => {
    setOnline(true);
  });

  window.addEventListener('offline', () => {
    setOnline(false);
  });
}

function subscribe(listener: Listener): () => void {
  registerBrowserListeners();
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function getSnapshot(): ConnectionSnapshot {
  registerBrowserListeners();
  return snapshot;
}

export function useConnectionStatus(): ConnectionSnapshot {
  registerBrowserListeners();
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function setOnline(online: boolean): void {
  const next: ConnectionSnapshot = {
    ...snapshot,
    online,
    offlineSequence:
      snapshot.online !== online && !online
        ? snapshot.offlineSequence + 1
        : snapshot.offlineSequence,
  };
  setSnapshot(next);
}

export function markSuccess(endpointPath?: string, timestamp: number = Date.now()): void {
  setSnapshot({
    ...snapshot,
    online: true,
    lastSuccessAt: timestamp,
    lastEndpoint: normalizeEndpointPath(endpointPath),
  });
}

export function markError(
  endpointPath: string | undefined,
  error: unknown,
  timestamp: number = Date.now(),
): void {
  const appError = asAppError(error);
  const isConnectivityFailure = appError.kind === 'Network' || appError.kind === 'Timeout';

  setSnapshot({
    ...snapshot,
    online: isConnectivityFailure ? false : snapshot.online,
    lastErrorAt: timestamp,
    lastErrorKind: appError.kind,
    lastHttpStatus: appError.kind === 'HTTP' ? appError.status : undefined,
    lastEndpoint: normalizeEndpointPath(endpointPath),
    lastErrorMessage: safeErrorMessage(appError.kind),
    offlineSequence:
      isConnectivityFailure && snapshot.online
        ? snapshot.offlineSequence + 1
        : snapshot.offlineSequence,
  });
}

export function resetConnectionStoreForTests(): void {
  setSnapshot({
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
    lastSuccessAt: null,
    lastErrorAt: null,
    lastErrorKind: undefined,
    lastHttpStatus: undefined,
    lastEndpoint: undefined,
    lastErrorMessage: undefined,
    offlineSequence: 0,
  });
}
