const SEEN_ALERTS_STORAGE_KEY = 'aura.dashboard.seenAlertIds.v1';
const SEEN_ALERT_TIMESTAMPS_STORAGE_KEY = 'aura.dashboard.seenAlertAt.v1';

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readSeenAlertIds(): string[] {
  if (!isBrowser()) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(SEEN_ALERTS_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((value): value is string => typeof value === 'string');
    }

    if (parsed && typeof parsed === 'object') {
      return Object.keys(parsed);
    }

    return [];
  } catch {
    return [];
  }
}

function writeSeenAlertIds(alertIds: string[]): void {
  if (!isBrowser()) {
    return;
  }

  try {
    window.localStorage.setItem(SEEN_ALERTS_STORAGE_KEY, JSON.stringify(alertIds));
  } catch {
    // ignore write failures to keep UI functional even if storage is unavailable
  }
}

function readSeenAlertTimestamps(): Record<string, string> {
  if (!isBrowser()) {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(SEEN_ALERT_TIMESTAMPS_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[0] === 'string' && typeof entry[1] === 'string',
      ),
    );
  } catch {
    return {};
  }
}

function writeSeenAlertTimestamps(timestamps: Record<string, string>): void {
  if (!isBrowser()) {
    return;
  }

  try {
    window.localStorage.setItem(SEEN_ALERT_TIMESTAMPS_STORAGE_KEY, JSON.stringify(timestamps));
  } catch {
    // ignore write failures to keep UI functional even if storage is unavailable
  }
}

export function getSeenAlertIdSet(): Set<string> {
  return new Set(readSeenAlertIds());
}

export function markAlertAsSeen(alertId: string, seenAtIso: string = new Date().toISOString()): Set<string> {
  const next = getSeenAlertIdSet();
  next.add(alertId);
  writeSeenAlertIds(Array.from(next));

  const timestamps = readSeenAlertTimestamps();
  if (!timestamps[alertId]) {
    timestamps[alertId] = seenAtIso;
    writeSeenAlertTimestamps(timestamps);
  }

  return next;
}

export function isAlertSeen(alertId: string, seenSet: Set<string>): boolean {
  return seenSet.has(alertId);
}

export function clearSeenAlertIdsForTests(): void {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.removeItem(SEEN_ALERTS_STORAGE_KEY);
  window.localStorage.removeItem(SEEN_ALERT_TIMESTAMPS_STORAGE_KEY);
}

export function getSeenAlertStorageKey(): string {
  return SEEN_ALERTS_STORAGE_KEY;
}

export function getSeenAlertTimestamp(alertId: string): string | undefined {
  return readSeenAlertTimestamps()[alertId];
}
