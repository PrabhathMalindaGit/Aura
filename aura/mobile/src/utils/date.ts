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
