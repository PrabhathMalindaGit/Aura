import { apiFetchJson } from "@/src/api/client";
import type { WeeklyReport } from "@/src/api/patient";

export type CaregiverPatient = {
  id: string;
  displayName?: string;
};

export type CaregiverLoginResponse = {
  token: string;
  patient: CaregiverPatient;
};

export type CaregiverSummary = {
  ok: true;
  patientId: string;
  patient: CaregiverPatient;
  updatedAt: string;
  lastCheckin: {
    date: string;
    pain: number;
    mood: number;
    adherence?: {
      exercises?: number;
      medication?: boolean;
    };
    sleep?: {
      hours?: number;
      quality?: number;
    };
    hydrationTodayMl?: number;
    nutritionToday?: {
      protein?: "low" | "ok" | "high";
      fruitVegServings?: number;
    };
    medsToday?: {
      taken: number;
      scheduled: number;
    };
  } | null;
  safety: {
    openAlertsCount: number;
    highRiskAlerts14d: number;
  };
  proms: {
    dueNowCount: number;
    latestCompleted: {
      normalized: number;
      bandLabel: string;
      completedAt: string;
    } | null;
  };
  rehab: {
    currentPhaseTitle?: string | null;
  };
};

export type CaregiverInviteItem = {
  inviteId: string;
  codeHint: string;
  expiresAt: string;
  usedAt: string | null;
  revokedAt: string | null;
};

export type CaregiverInviteCreateResponse = {
  ok: true;
  inviteId: string;
  code: string;
  codeHint: string;
  expiresAt: string;
};

function toTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

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

function toPatient(value: unknown): CaregiverPatient | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as { id?: unknown; patientId?: unknown; displayName?: unknown };
  const id = toTrimmedString(record.id) ?? toTrimmedString(record.patientId);
  if (!id) {
    return null;
  }

  return {
    id,
    displayName: toTrimmedString(record.displayName) ?? undefined,
  };
}

function normalizeWeeklyReport(value: unknown): WeeklyReport | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as WeeklyReport;
  if (
    record.ok !== true ||
    typeof record.patientId !== "string" ||
    !record.period ||
    typeof record.period.weekStart !== "string" ||
    typeof record.period.weekEnd !== "string"
  ) {
    return null;
  }
  return record;
}

function normalizeSummary(value: unknown): CaregiverSummary | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as {
    ok?: unknown;
    patientId?: unknown;
    patient?: unknown;
    updatedAt?: unknown;
    lastCheckin?: unknown;
    safety?: unknown;
    proms?: unknown;
    rehab?: unknown;
  };

  const patientId = toTrimmedString(record.patientId);
  const patient = toPatient(record.patient);
  if (record.ok !== true || !patientId || !patient) {
    return null;
  }

  const lastCheckinRecord =
    record.lastCheckin && typeof record.lastCheckin === "object"
      ? (record.lastCheckin as {
          date?: unknown;
          pain?: unknown;
          mood?: unknown;
          adherence?: unknown;
          sleep?: unknown;
          hydrationTodayMl?: unknown;
          nutritionToday?: unknown;
          medsToday?: unknown;
        })
      : null;

  const lastCheckin =
    lastCheckinRecord && toTrimmedString(lastCheckinRecord.date)
      ? {
          date: toTrimmedString(lastCheckinRecord.date) ?? "",
          pain: toFiniteNumber(lastCheckinRecord.pain) ?? 0,
          mood: toFiniteNumber(lastCheckinRecord.mood) ?? 0,
          adherence:
            lastCheckinRecord.adherence &&
            typeof lastCheckinRecord.adherence === "object"
              ? {
                  exercises:
                    toFiniteNumber(
                      (lastCheckinRecord.adherence as { exercises?: unknown }).exercises
                    ) ?? undefined,
                  medication:
                    typeof (lastCheckinRecord.adherence as { medication?: unknown })
                      .medication === "boolean"
                      ? (lastCheckinRecord.adherence as { medication: boolean })
                          .medication
                      : undefined,
                }
              : undefined,
          sleep:
            lastCheckinRecord.sleep && typeof lastCheckinRecord.sleep === "object"
              ? {
                  hours:
                    toFiniteNumber(
                      (lastCheckinRecord.sleep as { hours?: unknown }).hours
                    ) ?? undefined,
                  quality:
                    toFiniteNumber(
                      (lastCheckinRecord.sleep as { quality?: unknown }).quality
                    ) ?? undefined,
                }
              : undefined,
          hydrationTodayMl:
            toFiniteNumber(lastCheckinRecord.hydrationTodayMl) ?? undefined,
          nutritionToday:
            lastCheckinRecord.nutritionToday &&
            typeof lastCheckinRecord.nutritionToday === "object"
              ? {
                  protein:
                    (lastCheckinRecord.nutritionToday as { protein?: unknown })
                      .protein === "low" ||
                    (lastCheckinRecord.nutritionToday as { protein?: unknown })
                      .protein === "ok" ||
                    (lastCheckinRecord.nutritionToday as { protein?: unknown })
                      .protein === "high"
                      ? ((lastCheckinRecord.nutritionToday as {
                          protein: "low" | "ok" | "high";
                        }).protein as "low" | "ok" | "high")
                      : undefined,
                  fruitVegServings:
                    toFiniteNumber(
                      (lastCheckinRecord.nutritionToday as {
                        fruitVegServings?: unknown;
                      }).fruitVegServings
                    ) ?? undefined,
                }
              : undefined,
          medsToday:
            lastCheckinRecord.medsToday &&
            typeof lastCheckinRecord.medsToday === "object"
              ? {
                  taken:
                    toFiniteNumber(
                      (lastCheckinRecord.medsToday as { taken?: unknown }).taken
                    ) ?? 0,
                  scheduled:
                    toFiniteNumber(
                      (lastCheckinRecord.medsToday as { scheduled?: unknown })
                        .scheduled
                    ) ?? 0,
                }
              : undefined,
        }
      : null;

  const safetyRecord =
    record.safety && typeof record.safety === "object"
      ? (record.safety as { openAlertsCount?: unknown; highRiskAlerts14d?: unknown })
      : {};
  const promsRecord =
    record.proms && typeof record.proms === "object"
      ? (record.proms as { dueNowCount?: unknown; latestCompleted?: unknown })
      : {};
  const rehabRecord =
    record.rehab && typeof record.rehab === "object"
      ? (record.rehab as { currentPhaseTitle?: unknown })
      : {};

  const latestCompleted =
    promsRecord.latestCompleted && typeof promsRecord.latestCompleted === "object"
      ? (promsRecord.latestCompleted as {
          normalized?: unknown;
          bandLabel?: unknown;
          completedAt?: unknown;
        })
      : null;

  return {
    ok: true,
    patientId,
    patient,
    updatedAt:
      toTrimmedString(record.updatedAt) ?? new Date(0).toISOString(),
    lastCheckin,
    safety: {
      openAlertsCount: toFiniteNumber(safetyRecord.openAlertsCount) ?? 0,
      highRiskAlerts14d: toFiniteNumber(safetyRecord.highRiskAlerts14d) ?? 0,
    },
    proms: {
      dueNowCount: toFiniteNumber(promsRecord.dueNowCount) ?? 0,
      latestCompleted:
        latestCompleted &&
        toFiniteNumber(latestCompleted.normalized) !== null &&
        toTrimmedString(latestCompleted.bandLabel) &&
        toTrimmedString(latestCompleted.completedAt)
          ? {
              normalized: toFiniteNumber(latestCompleted.normalized) ?? 0,
              bandLabel: toTrimmedString(latestCompleted.bandLabel) ?? "",
              completedAt: toTrimmedString(latestCompleted.completedAt) ?? "",
            }
          : null,
    },
    rehab: {
      currentPhaseTitle: toTrimmedString(rehabRecord.currentPhaseTitle),
    },
  };
}

export async function caregiverLogin(code: string): Promise<CaregiverLoginResponse> {
  const payload = await apiFetchJson<{
    ok?: unknown;
    token?: unknown;
    patient?: unknown;
  }>("/caregiver/auth/login", {
    method: "POST",
    body: { code },
  });

  const token = toTrimmedString(payload.token);
  const patient = toPatient(payload.patient);
  if (!token || !patient) {
    throw {
      title: "Unexpected response",
      message: "Caregiver sign-in response was incomplete.",
      kind: "unknown",
      retryable: false,
    };
  }

  return {
    token,
    patient,
  };
}

export async function getCaregiverSummary(token: string): Promise<CaregiverSummary> {
  const payload = await apiFetchJson<unknown>("/caregiver/summary", {
    method: "GET",
    token,
  });
  const normalized = normalizeSummary(payload);
  if (!normalized) {
    throw {
      title: "Unexpected response",
      message: "Could not parse caregiver summary.",
      kind: "unknown",
      retryable: false,
    };
  }
  return normalized;
}

export async function getCaregiverWeeklyReport(
  token: string,
  params?: { weekStart?: string; tzOffsetMinutes?: number }
): Promise<WeeklyReport> {
  const query = new URLSearchParams();
  if (params?.weekStart) {
    query.set("weekStart", params.weekStart);
  }
  if (typeof params?.tzOffsetMinutes === "number") {
    query.set("tzOffsetMinutes", String(params.tzOffsetMinutes));
  }
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const payload = await apiFetchJson<unknown>(`/caregiver/reports/weekly${suffix}`, {
    method: "GET",
    token,
  });
  const normalized = normalizeWeeklyReport(payload);
  if (!normalized) {
    throw {
      title: "Unexpected response",
      message: "Could not parse caregiver weekly report.",
      kind: "unknown",
      retryable: false,
    };
  }
  return normalized;
}

function normalizeInviteItem(value: unknown): CaregiverInviteItem | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as {
    inviteId?: unknown;
    codeHint?: unknown;
    expiresAt?: unknown;
    usedAt?: unknown;
    revokedAt?: unknown;
  };

  const inviteId = toTrimmedString(record.inviteId);
  const codeHint = toTrimmedString(record.codeHint);
  const expiresAt = toTrimmedString(record.expiresAt);
  if (!inviteId || !codeHint || !expiresAt) {
    return null;
  }

  return {
    inviteId,
    codeHint,
    expiresAt,
    usedAt: toTrimmedString(record.usedAt),
    revokedAt: toTrimmedString(record.revokedAt),
  };
}

export async function createCaregiverInvite(
  token: string,
  expiresHours = 24
): Promise<CaregiverInviteCreateResponse> {
  const payload = await apiFetchJson<{
    ok?: unknown;
    inviteId?: unknown;
    code?: unknown;
    codeHint?: unknown;
    expiresAt?: unknown;
  }>("/patient/caregiver/invites", {
    method: "POST",
    token,
    body: { expiresHours },
  });

  const inviteId = toTrimmedString(payload.inviteId);
  const code = toTrimmedString(payload.code);
  const codeHint = toTrimmedString(payload.codeHint);
  const expiresAt = toTrimmedString(payload.expiresAt);
  if (!inviteId || !code || !codeHint || !expiresAt) {
    throw {
      title: "Unexpected response",
      message: "Invite creation response was incomplete.",
      kind: "unknown",
      retryable: false,
    };
  }

  return {
    ok: true,
    inviteId,
    code,
    codeHint,
    expiresAt,
  };
}

export async function listCaregiverInvites(
  token: string
): Promise<CaregiverInviteItem[]> {
  const payload = await apiFetchJson<{
    ok?: unknown;
    items?: unknown;
  }>("/patient/caregiver/invites", {
    method: "GET",
    token,
  });

  const rows = Array.isArray(payload.items)
    ? payload.items
        .map((item) => normalizeInviteItem(item))
        .filter((item): item is CaregiverInviteItem => Boolean(item))
    : [];
  return rows;
}

export async function revokeCaregiverInvite(
  token: string,
  inviteId: string
): Promise<void> {
  await apiFetchJson<{ ok?: unknown }>(`/patient/caregiver/invites/${inviteId}/revoke`, {
    method: "POST",
    token,
  });
}
