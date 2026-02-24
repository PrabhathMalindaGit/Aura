export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function formatISOToHuman(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) {
    return iso;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function formatRelativeFromNow(ts: number): string {
  if (!Number.isFinite(ts) || ts <= 0) {
    return "Never";
  }

  const deltaMs = Date.now() - ts;
  const deltaSeconds = Math.floor(deltaMs / 1000);

  if (deltaSeconds < 30) {
    return "Just now";
  }

  if (deltaSeconds < 3600) {
    const minutes = Math.max(1, Math.floor(deltaSeconds / 60));
    return `${minutes}m ago`;
  }

  if (deltaSeconds < 86400) {
    const hours = Math.max(1, Math.floor(deltaSeconds / 3600));
    return `${hours}h ago`;
  }

  if (deltaSeconds < 172800) {
    return "Yesterday";
  }

  const days = Math.max(1, Math.floor(deltaSeconds / 86400));
  return `${days}d ago`;
}

function toDateOnlyUTC(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate()
  ).padStart(2, "0")}`;
}

function parseDateOnlyISO(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [yearString, monthString, dayString] = value.split("-");
  const year = Number.parseInt(yearString, 10);
  const month = Number.parseInt(monthString, 10);
  const day = Number.parseInt(dayString, 10);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return parsed;
}

export function startOfWeekMondayISO(
  tzOffsetMinutes: number,
  referenceDate: Date = new Date()
): string {
  const safeOffset = Number.isFinite(tzOffsetMinutes)
    ? Math.trunc(tzOffsetMinutes)
    : 0;
  const shifted = new Date(referenceDate.getTime() + safeOffset * 60_000);
  const day = shifted.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  const monday = new Date(
    Date.UTC(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth(),
      shifted.getUTCDate() - daysSinceMonday
    )
  );

  return toDateOnlyUTC(monday);
}

export function addDaysISO(dateISO: string, days: number): string {
  const parsed = parseDateOnlyISO(dateISO);
  if (!parsed) {
    return dateISO;
  }

  const next = new Date(parsed.getTime() + Math.trunc(days) * 24 * 60 * 60 * 1000);
  return toDateOnlyUTC(next);
}
