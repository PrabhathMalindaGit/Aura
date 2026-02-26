import { apiFetchJson } from "@/src/api/client";

export type WearableSource = "mock" | "healthkit_stub" | "googlefit_stub";

export type WearableDailyDay = {
  date: string;
  steps?: number;
  activeMinutes?: number;
  restingHr?: number;
};

export type WearablesSummary = {
  source: WearableSource;
  from: string;
  to: string;
  trackedDays: number;
  avgSteps: number | null;
  avgActiveMinutes: number | null;
  avgRestingHr: number | null;
  totalSteps: number;
  totalActiveMinutes: number;
};

export type WearablesBulkPayload = {
  source?: WearableSource;
  days: WearableDailyDay[];
};

export type WearablesBulkResult = {
  ok: boolean;
  source: WearableSource;
  upserted: number;
  updated: number;
};

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function normalizeSource(value: unknown): WearableSource {
  if (value === "healthkit_stub" || value === "googlefit_stub") {
    return value;
  }
  return "mock";
}

function normalizeDateOnly(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function clampInt(value: number | null, min: number, max: number): number | undefined {
  if (value === null) {
    return undefined;
  }
  const intValue = Math.trunc(value);
  if (!Number.isFinite(intValue)) {
    return undefined;
  }
  if (intValue < min || intValue > max) {
    return undefined;
  }
  return intValue;
}

function normalizeDay(value: unknown): WearableDailyDay | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as {
    date?: unknown;
    steps?: unknown;
    activeMinutes?: unknown;
    restingHr?: unknown;
  };
  const date = normalizeDateOnly(record.date);
  if (!date) {
    return null;
  }

  const steps = clampInt(toFiniteNumber(record.steps), 0, 100000);
  const activeMinutes = clampInt(toFiniteNumber(record.activeMinutes), 0, 300);
  const restingHr = clampInt(toFiniteNumber(record.restingHr), 30, 220);

  if (
    typeof steps !== "number" &&
    typeof activeMinutes !== "number" &&
    typeof restingHr !== "number"
  ) {
    return null;
  }

  return {
    date,
    ...(typeof steps === "number" ? { steps } : {}),
    ...(typeof activeMinutes === "number" ? { activeMinutes } : {}),
    ...(typeof restingHr === "number" ? { restingHr } : {}),
  };
}

function normalizeSummary(value: unknown): WearablesSummary | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as {
    source?: unknown;
    from?: unknown;
    to?: unknown;
    trackedDays?: unknown;
    avgSteps?: unknown;
    avgActiveMinutes?: unknown;
    avgRestingHr?: unknown;
    totalSteps?: unknown;
    totalActiveMinutes?: unknown;
  };

  const from = normalizeDateOnly(record.from);
  const to = normalizeDateOnly(record.to);
  if (!from || !to) {
    return null;
  }

  const trackedDays = Math.max(0, Math.trunc(toFiniteNumber(record.trackedDays) ?? 0));
  const totalSteps = Math.max(0, Math.trunc(toFiniteNumber(record.totalSteps) ?? 0));
  const totalActiveMinutes = Math.max(
    0,
    Math.trunc(toFiniteNumber(record.totalActiveMinutes) ?? 0)
  );

  return {
    source: normalizeSource(record.source),
    from,
    to,
    trackedDays,
    avgSteps: toFiniteNumber(record.avgSteps),
    avgActiveMinutes: toFiniteNumber(record.avgActiveMinutes),
    avgRestingHr: toFiniteNumber(record.avgRestingHr),
    totalSteps,
    totalActiveMinutes,
  };
}

export async function bulkUpsertWearables(
  token: string,
  payload: WearablesBulkPayload
): Promise<WearablesBulkResult> {
  const safeDays = payload.days
    .map((day) => normalizeDay(day))
    .filter((day): day is WearableDailyDay => Boolean(day));

  const response = await apiFetchJson<{
    ok?: unknown;
    source?: unknown;
    upserted?: unknown;
    updated?: unknown;
  }>("/patient/wearables/daily/bulk", {
    method: "POST",
    token,
    body: {
      source: normalizeSource(payload.source),
      days: safeDays,
    },
  });

  return {
    ok: response.ok !== false,
    source: normalizeSource(response.source),
    upserted: Math.max(0, Math.trunc(toFiniteNumber(response.upserted) ?? 0)),
    updated: Math.max(0, Math.trunc(toFiniteNumber(response.updated) ?? 0)),
  };
}

export async function getWearablesDaily(
  token: string,
  params: {
    from: string;
    to: string;
    source?: WearableSource;
  }
): Promise<{
  source: WearableSource;
  from: string;
  to: string;
  days: WearableDailyDay[];
}> {
  const query = new URLSearchParams();
  query.set("from", params.from);
  query.set("to", params.to);
  query.set("source", normalizeSource(params.source));

  const payload = await apiFetchJson<{
    source?: unknown;
    from?: unknown;
    to?: unknown;
    days?: unknown;
    items?: unknown;
  }>(`/patient/wearables/daily?${query.toString()}`, {
    method: "GET",
    token,
  });

  const daysArray = Array.isArray(payload.days)
    ? payload.days
    : Array.isArray(payload.items)
      ? payload.items
      : [];

  const days = daysArray
    .map((row) => normalizeDay(row))
    .filter((row): row is WearableDailyDay => Boolean(row))
    .sort((left, right) => Date.parse(left.date) - Date.parse(right.date));

  return {
    source: normalizeSource(payload.source),
    from: normalizeDateOnly(payload.from) ?? params.from,
    to: normalizeDateOnly(payload.to) ?? params.to,
    days,
  };
}

export async function getWearablesSummary(
  token: string,
  params: {
    from: string;
    to: string;
    source?: WearableSource;
  }
): Promise<WearablesSummary> {
  const query = new URLSearchParams();
  query.set("from", params.from);
  query.set("to", params.to);
  query.set("source", normalizeSource(params.source));

  const payload = await apiFetchJson<{
    summary?: unknown;
    data?: unknown;
    source?: unknown;
    from?: unknown;
    to?: unknown;
    trackedDays?: unknown;
    avgSteps?: unknown;
    avgActiveMinutes?: unknown;
    avgRestingHr?: unknown;
    totalSteps?: unknown;
    totalActiveMinutes?: unknown;
  }>(`/patient/wearables/summary?${query.toString()}`, {
    method: "GET",
    token,
  });

  const normalized =
    normalizeSummary(payload.summary) ??
    normalizeSummary(payload.data) ??
    normalizeSummary(payload);

  if (!normalized) {
    throw {
      title: "Unexpected response",
      message: "Could not parse wearables summary.",
      kind: "unknown",
      retryable: false,
    };
  }

  return normalized;
}
