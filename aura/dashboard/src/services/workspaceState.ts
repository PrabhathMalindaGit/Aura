import { getClinicianId } from './clinicianIdentity';
import { WORKSPACE_STATE_STORAGE_PREFIX } from '../utils/storageKeys';

export type WorkspaceStatePage =
  | 'worklist'
  | 'alerts'
  | 'patients'
  | 'insights'
  | 'appointments';

const MAX_WORKSPACE_SEARCH_LENGTH = 120;

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function getWorkspaceStateScope(clinicianId?: string): string {
  const normalized = (clinicianId ?? getClinicianId()).trim();
  return normalized || 'anon';
}

export function getWorkspaceStateStorageKey(
  page: WorkspaceStatePage,
  clinicianId?: string,
): string {
  return `${WORKSPACE_STATE_STORAGE_PREFIX}:${page}:${getWorkspaceStateScope(clinicianId)}`;
}

export function normalizeWorkspaceSearch(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  return trimmed.slice(0, MAX_WORKSPACE_SEARCH_LENGTH);
}

export function readWorkspaceState<T>(
  page: WorkspaceStatePage,
  fallback: T,
  normalize: (value: unknown) => T,
  clinicianId?: string,
): T {
  if (!isBrowser()) {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(getWorkspaceStateStorageKey(page, clinicianId));
    if (!raw) {
      return fallback;
    }

    return normalize(JSON.parse(raw));
  } catch {
    return fallback;
  }
}

export function hasWorkspaceState(
  page: WorkspaceStatePage,
  clinicianId?: string,
): boolean {
  if (!isBrowser()) {
    return false;
  }

  try {
    return window.localStorage.getItem(getWorkspaceStateStorageKey(page, clinicianId)) !== null;
  } catch {
    return false;
  }
}

export function writeWorkspaceState<T>(
  page: WorkspaceStatePage,
  value: T,
  clinicianId?: string,
): T {
  if (!isBrowser()) {
    return value;
  }

  try {
    window.localStorage.setItem(
      getWorkspaceStateStorageKey(page, clinicianId),
      JSON.stringify(value),
    );
  } catch {
    // Ignore localStorage failures to keep the workspace usable.
  }

  return value;
}

export function clearWorkspaceState(
  page: WorkspaceStatePage,
  clinicianId?: string,
): void {
  if (!isBrowser()) {
    return;
  }

  try {
    window.localStorage.removeItem(getWorkspaceStateStorageKey(page, clinicianId));
  } catch {
    // Ignore localStorage failures to keep the workspace usable.
  }
}
