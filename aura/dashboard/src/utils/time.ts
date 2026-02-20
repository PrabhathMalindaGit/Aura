export function formatExactTime(value: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return 'Unknown time';
  }

  return new Date(parsed).toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatRelativeTime(value: string, nowMs: number = Date.now()): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return 'Unknown';
  }

  const deltaSeconds = Math.max(0, Math.floor((nowMs - parsed) / 1000));

  if (deltaSeconds < 60) {
    return 'Just now';
  }

  const deltaMinutes = Math.floor(deltaSeconds / 60);
  if (deltaMinutes < 60) {
    return `${deltaMinutes}m ago`;
  }

  const deltaHours = Math.floor(deltaMinutes / 60);
  if (deltaHours < 24) {
    return `${deltaHours}h ago`;
  }

  const deltaDays = Math.floor(deltaHours / 24);
  return `${deltaDays}d ago`;
}

export function isAfterWithinDays(value: string, days: number): boolean {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return false;
  }

  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return parsed >= cutoff;
}
