const STORAGE_BASE_KEY = 'aura_seen_alerts_v1';
const DEFAULT_CLINICIAN_KEY = 'anon';
const MAX_SEEN_ENTRIES = 1000;
const MAX_ENTRY_AGE_DAYS = 90;
const MAX_ENTRY_AGE_MS = MAX_ENTRY_AGE_DAYS * 24 * 60 * 60 * 1000;

export type SeenAlertMap = Record<string, string>;

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function toClinicianBucket(clinicianKey: string | undefined): string {
  const normalized = clinicianKey?.trim();
  return normalized ? normalized : DEFAULT_CLINICIAN_KEY;
}

export function getSeenStorageKey(clinicianKey?: string): string {
  return `${STORAGE_BASE_KEY}:${toClinicianBucket(clinicianKey)}`;
}

function parseSeenMap(raw: string | null): SeenAlertMap {
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] =>
          typeof entry[0] === 'string' &&
          typeof entry[1] === 'string' &&
          Number.isFinite(Date.parse(entry[1])),
      ),
    );
  } catch {
    return {};
  }
}

function readSeenMap(clinicianKey?: string): SeenAlertMap {
  if (!isBrowser()) {
    return {};
  }

  const storageKey = getSeenStorageKey(clinicianKey);
  return parseSeenMap(window.localStorage.getItem(storageKey));
}

function writeSeenMap(map: SeenAlertMap, clinicianKey?: string): void {
  if (!isBrowser()) {
    return;
  }

  try {
    window.localStorage.setItem(getSeenStorageKey(clinicianKey), JSON.stringify(map));
  } catch {
    // Ignore storage errors so local tracking does not block clinician workflow.
  }
}

function pruneMap(map: SeenAlertMap, nowMs: number = Date.now()): SeenAlertMap {
  const cutoff = nowMs - MAX_ENTRY_AGE_MS;
  const recentEntries = Object.entries(map)
    .filter((entry) => Number.isFinite(Date.parse(entry[1])) && Date.parse(entry[1]) >= cutoff)
    .sort((left, right) => Date.parse(right[1]) - Date.parse(left[1]))
    .slice(0, MAX_SEEN_ENTRIES);

  return Object.fromEntries(recentEntries);
}

export function pruneSeenMap(clinicianKey?: string): SeenAlertMap {
  const current = readSeenMap(clinicianKey);
  const pruned = pruneMap(current);
  writeSeenMap(pruned, clinicianKey);
  return pruned;
}

export function getSeenMap(clinicianKey?: string): SeenAlertMap {
  return pruneSeenMap(clinicianKey);
}

export function getSeenAt(alertId: string, clinicianKey?: string): string | undefined {
  if (!alertId) {
    return undefined;
  }

  return getSeenMap(clinicianKey)[alertId];
}

export function isSeen(alertId: string, clinicianKey?: string): boolean {
  if (!alertId) {
    return false;
  }

  return Boolean(getSeenAt(alertId, clinicianKey));
}

export function markSeen(
  alertId: string,
  clinicianKey?: string,
  atISO: string = new Date().toISOString(),
): SeenAlertMap {
  if (!alertId) {
    return getSeenMap(clinicianKey);
  }

  const next = readSeenMap(clinicianKey);
  if (!next[alertId]) {
    next[alertId] = atISO;
  }

  const pruned = pruneMap(next);
  writeSeenMap(pruned, clinicianKey);
  return pruned;
}

export function clearSeenStoreForTests(clinicianKey?: string): void {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.removeItem(getSeenStorageKey(clinicianKey));
}
