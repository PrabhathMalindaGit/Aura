import { formatRelativeDate } from './date';

function parseIso(value?: string): number | null {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export function formatDashboardDateTime(value?: string): string {
  const parsed = parseIso(value);
  if (parsed === null) {
    return '—';
  }

  return new Date(parsed).toLocaleString([], {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDashboardRelativeTime(value?: string, nowMs: number = Date.now()): string {
  const parsed = parseIso(value);
  if (parsed === null) {
    return '—';
  }

  if (parsed > nowMs) {
    return formatDashboardDateTime(value);
  }

  const ageMs = nowMs - parsed;
  if (ageMs <= 3 * 24 * 60 * 60 * 1000) {
    return formatRelativeDate(value, nowMs);
  }

  return formatDashboardDateTime(value);
}

export function formatDashboardTimeRange(startsAt?: string, endsAt?: string): string {
  const startMs = parseIso(startsAt);
  const endMs = parseIso(endsAt);
  if (startMs === null || endMs === null) {
    return 'Schedule unavailable';
  }

  const start = new Date(startMs);
  const end = new Date(endMs);

  return `${start.toLocaleDateString([], {
    month: 'short',
    day: '2-digit',
  })} · ${start.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })} – ${end.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

export function humanizeDashboardLabel(value?: string): string {
  if (!value) {
    return 'Unknown';
  }

  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join(' ');
}
