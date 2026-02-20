import { useSyncExternalStore } from 'react';

export interface ConnectionSnapshot {
  online: boolean;
  lastSuccessAt: number | null;
  lastErrorAt: number | null;
}

type Listener = () => void;

const listeners = new Set<Listener>();

const state: ConnectionSnapshot = {
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  lastSuccessAt: null,
  lastErrorAt: null,
};

let hasWindowListeners = false;

function emitIfChanged(prev: ConnectionSnapshot): void {
  if (
    prev.online !== state.online ||
    prev.lastSuccessAt !== state.lastSuccessAt ||
    prev.lastErrorAt !== state.lastErrorAt
  ) {
    listeners.forEach((listener) => listener());
  }
}

function registerBrowserListeners(): void {
  if (hasWindowListeners || typeof window === 'undefined') {
    return;
  }

  hasWindowListeners = true;

  window.addEventListener('online', () => {
    const previous = { ...state };
    state.online = true;
    emitIfChanged(previous);
  });

  window.addEventListener('offline', () => {
    const previous = { ...state };
    state.online = false;
    emitIfChanged(previous);
  });
}

export function getConnectionSnapshot(): ConnectionSnapshot {
  registerBrowserListeners();
  return state;
}

export function markRequestSuccess(timestamp: number = Date.now()): void {
  const previous = { ...state };
  state.lastSuccessAt = timestamp;
  emitIfChanged(previous);
}

export function markRequestError(timestamp: number = Date.now()): void {
  const previous = { ...state };
  state.lastErrorAt = timestamp;
  emitIfChanged(previous);
}

function subscribe(listener: Listener): () => void {
  registerBrowserListeners();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useConnectionStatus(): ConnectionSnapshot {
  registerBrowserListeners();
  return useSyncExternalStore(subscribe, getConnectionSnapshot, getConnectionSnapshot);
}
