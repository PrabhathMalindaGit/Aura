export function parseIsoToMs(value?: string): number | null {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export function isOlderThanDays(value: string | undefined, days: number, nowMs: number = Date.now()): boolean {
  const parsed = parseIsoToMs(value);
  if (parsed === null) {
    return true;
  }

  const cutoff = nowMs - days * 24 * 60 * 60 * 1000;
  return parsed < cutoff;
}

export function isWithinDays(value: string | undefined, days: number, nowMs: number = Date.now()): boolean {
  const parsed = parseIsoToMs(value);
  if (parsed === null) {
    return false;
  }

  const cutoff = nowMs - days * 24 * 60 * 60 * 1000;
  return parsed >= cutoff;
}

export function formatDateTime(value?: string): string {
  const parsed = parseIsoToMs(value);
  if (parsed === null) {
    return 'No check-in';
  }

  return new Date(parsed).toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatRelativeDate(value?: string, nowMs: number = Date.now()): string {
  const parsed = parseIsoToMs(value);
  if (parsed === null) {
    return 'No check-in';
  }

  const deltaSeconds = Math.max(0, Math.floor((nowMs - parsed) / 1000));

  if (deltaSeconds < 60) {
    return 'Just now';
  }

  const minutes = Math.floor(deltaSeconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
