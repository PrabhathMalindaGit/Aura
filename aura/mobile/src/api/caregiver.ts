import { apiFetchJson } from "@/src/api/client";
import type {
  CaregiverAccessMeta,
  CaregiverCareState,
  CaregiverInviteStatus,
} from "@/src/types/models";

export type CaregiverPatient = {
  id: string;
  displayName?: string;
};

export type CaregiverLoginResponse = {
  token: string;
  patient: CaregiverPatient;
  access?: CaregiverAccessMeta;
};

export type CaregiverCareStateSummary = {
  state: CaregiverCareState;
  label: string;
  message: string;
  isHistorical: boolean;
  dischargedAt?: string | null;
  programSummary?: string | null;
  contactInstructions?: string | null;
};

export type CaregiverSupportGuidance = {
  clinicContact: string;
  urgentHelp: string;
  monitoringNote: string;
};

export type CaregiverSummary = {
  ok: true;
  patientId: string;
  patient: CaregiverPatient;
  updatedAt: string;
  access?: CaregiverAccessMeta;
  careState: CaregiverCareStateSummary;
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
  assessments: {
    dueNowCount: number;
  };
  plan?: {
    statusLabel?: string;
    phaseTitle?: string | null;
    itemCount: number;
    title?: string;
  } | null;
  nextAppointment?: {
    startsAt: string;
    endsAt: string;
    modality: "video";
  } | null;
  supportGuidance: CaregiverSupportGuidance;
};

export type CaregiverWeeklyReport = {
  ok: true;
  patientId: string;
  period: {
    weekStart: string;
    weekEnd: string;
    tzOffsetMinutes: number | null;
  };
  careState: CaregiverCareStateSummary;
  summary: {
    headline: string;
    highlights: string[];
    nextSteps: string[];
  };
  checkins: {
    count: number;
    avgPain: number | null;
    avgMood: number | null;
  };
  exercises: {
    sessionCount: number;
    totalDurationMinutes: number;
    completedExercises: number;
    totalExercises: number;
  };
  medications: {
    adherencePct: number | null;
  };
  hydration: {
    avgDailyMl: number | null;
  };
  nutrition: {
    avgFruitVegServings: number | null;
  };
  assessments: {
    dueNowCount: number;
    completedThisWeekCount: number;
  };
  safety: {
    alertsCreatedThisWeek: number;
    highRiskAlertsThisWeek: number;
  };
  updatedAt: string;
};

export type CaregiverInviteItem = CaregiverAccessMeta;

export type CaregiverInviteCreateResponse = {
  ok: true;
  inviteId: string;
  code: string;
  codeHint: string;
  expiresAt: string;
  relationship?: string | null;
  caregiverName?: string | null;
  lastAccessedAt?: string | null;
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

function normalizeCaregiverCareState(value: unknown): CaregiverCareStateSummary | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as {
    state?: unknown;
    label?: unknown;
    message?: unknown;
    isHistorical?: unknown;
    dischargedAt?: unknown;
    programSummary?: unknown;
    contactInstructions?: unknown;
  };

  const state =
    record.state === "active" ||
    record.state === "on_hold" ||
    record.state === "discharged" ||
    record.state === "independent_mode" ||
    record.state === "inactive"
      ? record.state
      : null;
  const label = toTrimmedString(record.label);
  const message = toTrimmedString(record.message);
  if (!state || !label || !message || typeof record.isHistorical !== "boolean") {
    return null;
  }

  return {
    state,
    label,
    message,
    isHistorical: record.isHistorical,
    dischargedAt: toTrimmedString(record.dischargedAt) ?? null,
    programSummary: toTrimmedString(record.programSummary) ?? null,
    contactInstructions: toTrimmedString(record.contactInstructions) ?? null,
  };
}

function normalizeSupportGuidance(value: unknown): CaregiverSupportGuidance | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as {
    clinicContact?: unknown;
    urgentHelp?: unknown;
    monitoringNote?: unknown;
  };
  const clinicContact = toTrimmedString(record.clinicContact);
  const urgentHelp = toTrimmedString(record.urgentHelp);
  const monitoringNote = toTrimmedString(record.monitoringNote);
  if (!clinicContact || !urgentHelp || !monitoringNote) {
    return null;
  }

  return {
    clinicContact,
    urgentHelp,
    monitoringNote,
  };
}

function normalizeWeeklyReport(value: unknown): CaregiverWeeklyReport | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as {
    ok?: unknown;
    patientId?: unknown;
    period?: unknown;
    careState?: unknown;
    summary?: unknown;
    checkins?: unknown;
    exercises?: unknown;
    medications?: unknown;
    hydration?: unknown;
    nutrition?: unknown;
    assessments?: unknown;
    safety?: unknown;
    updatedAt?: unknown;
  };
  if (
    record.ok !== true ||
    typeof record.patientId !== "string" ||
    !record.period ||
    typeof (record.period as { weekStart?: unknown }).weekStart !== "string" ||
    typeof (record.period as { weekEnd?: unknown }).weekEnd !== "string"
  ) {
    return null;
  }

  const careState = normalizeCaregiverCareState(record.careState);
  const summaryRecord =
    record.summary && typeof record.summary === "object"
      ? (record.summary as {
          headline?: unknown;
          highlights?: unknown;
          nextSteps?: unknown;
        })
      : null;
  const checkinsRecord =
    record.checkins && typeof record.checkins === "object"
      ? (record.checkins as { count?: unknown; avgPain?: unknown; avgMood?: unknown })
      : null;
  const exercisesRecord =
    record.exercises && typeof record.exercises === "object"
      ? (record.exercises as {
          sessionCount?: unknown;
          totalDurationMinutes?: unknown;
          completedExercises?: unknown;
          totalExercises?: unknown;
        })
      : null;
  const medicationsRecord =
    record.medications && typeof record.medications === "object"
      ? (record.medications as { adherencePct?: unknown })
      : null;
  const hydrationRecord =
    record.hydration && typeof record.hydration === "object"
      ? (record.hydration as { avgDailyMl?: unknown })
      : null;
  const nutritionRecord =
    record.nutrition && typeof record.nutrition === "object"
      ? (record.nutrition as { avgFruitVegServings?: unknown })
      : null;
  const assessmentsRecord =
    record.assessments && typeof record.assessments === "object"
      ? (record.assessments as { dueNowCount?: unknown; completedThisWeekCount?: unknown })
      : null;
  const safetyRecord =
    record.safety && typeof record.safety === "object"
      ? (record.safety as {
          alertsCreatedThisWeek?: unknown;
          highRiskAlertsThisWeek?: unknown;
        })
      : null;

  if (!careState || !summaryRecord || !checkinsRecord || !exercisesRecord) {
    return null;
  }

  return {
    ok: true,
    patientId: record.patientId,
    period: {
      weekStart: String((record.period as { weekStart: string }).weekStart),
      weekEnd: String((record.period as { weekEnd: string }).weekEnd),
      tzOffsetMinutes:
        toFiniteNumber((record.period as { tzOffsetMinutes?: unknown }).tzOffsetMinutes),
    },
    careState,
    summary: {
      headline: toTrimmedString(summaryRecord.headline) ?? "",
      highlights: Array.isArray(summaryRecord.highlights)
        ? summaryRecord.highlights
            .map((item) => toTrimmedString(item))
            .filter((item): item is string => Boolean(item))
        : [],
      nextSteps: Array.isArray(summaryRecord.nextSteps)
        ? summaryRecord.nextSteps
            .map((item) => toTrimmedString(item))
            .filter((item): item is string => Boolean(item))
        : [],
    },
    checkins: {
      count: toFiniteNumber(checkinsRecord.count) ?? 0,
      avgPain: toFiniteNumber(checkinsRecord.avgPain),
      avgMood: toFiniteNumber(checkinsRecord.avgMood),
    },
    exercises: {
      sessionCount: toFiniteNumber(exercisesRecord.sessionCount) ?? 0,
      totalDurationMinutes: toFiniteNumber(exercisesRecord.totalDurationMinutes) ?? 0,
      completedExercises: toFiniteNumber(exercisesRecord.completedExercises) ?? 0,
      totalExercises: toFiniteNumber(exercisesRecord.totalExercises) ?? 0,
    },
    medications: {
      adherencePct: toFiniteNumber(medicationsRecord?.adherencePct),
    },
    hydration: {
      avgDailyMl: toFiniteNumber(hydrationRecord?.avgDailyMl),
    },
    nutrition: {
      avgFruitVegServings: toFiniteNumber(nutritionRecord?.avgFruitVegServings),
    },
    assessments: {
      dueNowCount: toFiniteNumber(assessmentsRecord?.dueNowCount) ?? 0,
      completedThisWeekCount:
        toFiniteNumber(assessmentsRecord?.completedThisWeekCount) ?? 0,
    },
    safety: {
      alertsCreatedThisWeek: toFiniteNumber(safetyRecord?.alertsCreatedThisWeek) ?? 0,
      highRiskAlertsThisWeek: toFiniteNumber(safetyRecord?.highRiskAlertsThisWeek) ?? 0,
    },
    updatedAt: toTrimmedString(record.updatedAt) ?? new Date(0).toISOString(),
  };
}

function normalizeCaregiverAccess(value: unknown): CaregiverAccessMeta | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const record = value as {
    inviteId?: unknown;
    codeHint?: unknown;
    expiresAt?: unknown;
    usedAt?: unknown;
    revokedAt?: unknown;
    createdAt?: unknown;
    status?: unknown;
    relationship?: unknown;
    caregiverName?: unknown;
    lastAccessedAt?: unknown;
  };

  const inviteId = toTrimmedString(record.inviteId);
  const codeHint = toTrimmedString(record.codeHint);
  const expiresAt = toTrimmedString(record.expiresAt);
  if (!inviteId || !codeHint || !expiresAt) {
    return undefined;
  }

  const status: CaregiverInviteStatus | undefined =
    record.status === "pending" ||
    record.status === "active" ||
    record.status === "expired" ||
    record.status === "revoked"
      ? record.status
      : undefined;

  return {
    inviteId,
    codeHint,
    expiresAt,
    usedAt: toTrimmedString(record.usedAt) ?? null,
    revokedAt: toTrimmedString(record.revokedAt) ?? null,
    createdAt: toTrimmedString(record.createdAt) ?? null,
    status,
    relationship: toTrimmedString(record.relationship) ?? null,
    caregiverName: toTrimmedString(record.caregiverName) ?? null,
    lastAccessedAt: toTrimmedString(record.lastAccessedAt) ?? null,
  };
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
    access?: unknown;
    careState?: unknown;
    lastCheckin?: unknown;
    safety?: unknown;
    assessments?: unknown;
    plan?: unknown;
    nextAppointment?: unknown;
    supportGuidance?: unknown;
  };

  const patientId = toTrimmedString(record.patientId);
  const patient = toPatient(record.patient);
  const careState = normalizeCaregiverCareState(record.careState);
  const supportGuidance = normalizeSupportGuidance(record.supportGuidance);
  if (record.ok !== true || !patientId || !patient || !careState || !supportGuidance) {
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
  const assessmentsRecord =
    record.assessments && typeof record.assessments === "object"
      ? (record.assessments as { dueNowCount?: unknown })
      : {};
  const planRecord =
    record.plan && typeof record.plan === "object"
      ? (record.plan as {
          statusLabel?: unknown;
          phaseTitle?: unknown;
          itemCount?: unknown;
          title?: unknown;
        })
      : null;
  const nextAppointmentRecord =
    record.nextAppointment && typeof record.nextAppointment === "object"
      ? (record.nextAppointment as {
          startsAt?: unknown;
          endsAt?: unknown;
          modality?: unknown;
        })
      : null;

  return {
    ok: true,
    patientId,
    patient,
    updatedAt:
      toTrimmedString(record.updatedAt) ?? new Date(0).toISOString(),
    access: normalizeCaregiverAccess(record.access),
    careState,
    lastCheckin,
    safety: {
      openAlertsCount: toFiniteNumber(safetyRecord.openAlertsCount) ?? 0,
      highRiskAlerts14d: toFiniteNumber(safetyRecord.highRiskAlerts14d) ?? 0,
    },
    assessments: {
      dueNowCount: toFiniteNumber(assessmentsRecord.dueNowCount) ?? 0,
    },
    plan: planRecord
      ? {
          statusLabel: toTrimmedString(planRecord.statusLabel) ?? undefined,
          phaseTitle: toTrimmedString(planRecord.phaseTitle) ?? null,
          itemCount: toFiniteNumber(planRecord.itemCount) ?? 0,
          title: toTrimmedString(planRecord.title) ?? undefined,
        }
      : null,
    nextAppointment:
      nextAppointmentRecord &&
      toTrimmedString(nextAppointmentRecord.startsAt) &&
      toTrimmedString(nextAppointmentRecord.endsAt)
        ? {
            startsAt: toTrimmedString(nextAppointmentRecord.startsAt) ?? "",
            endsAt: toTrimmedString(nextAppointmentRecord.endsAt) ?? "",
            modality: "video",
          }
        : null,
    supportGuidance,
  };
}

export async function caregiverLogin(
  code: string,
  caregiverName?: string,
): Promise<CaregiverLoginResponse> {
  const payload = await apiFetchJson<{
    ok?: unknown;
    token?: unknown;
    patient?: unknown;
    access?: unknown;
  }>("/caregiver/auth/login", {
    method: "POST",
    body: { code, caregiverName },
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
    access: normalizeCaregiverAccess(payload.access),
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
): Promise<CaregiverWeeklyReport> {
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
  return normalizeCaregiverAccess(value) ?? null;
}

export async function createCaregiverInvite(
  token: string,
  expiresHours = 24,
  relationship?: string,
): Promise<CaregiverInviteCreateResponse> {
  const payload = await apiFetchJson<{
    ok?: unknown;
    inviteId?: unknown;
    code?: unknown;
    codeHint?: unknown;
    expiresAt?: unknown;
    relationship?: unknown;
    caregiverName?: unknown;
    lastAccessedAt?: unknown;
  }>("/patient/caregiver/invites", {
    method: "POST",
    token,
    body: { expiresHours, relationship },
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
    relationship: toTrimmedString(payload.relationship) ?? null,
    caregiverName: toTrimmedString(payload.caregiverName) ?? null,
    lastAccessedAt: toTrimmedString(payload.lastAccessedAt) ?? null,
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
