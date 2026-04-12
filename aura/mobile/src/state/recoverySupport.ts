import AsyncStorage from "@react-native-async-storage/async-storage";

import type {
  CheckinAdaptationDecision,
  Patient,
  RecoveryNudge,
} from "@/src/types/models";

export type CachedRecoverySupport = {
  cachedAt: number;
  date: string;
  adaptation: CheckinAdaptationDecision | null;
  nudge: RecoveryNudge | null;
};

export type PatientCareMode =
  | "active"
  | "independent"
  | "discharged"
  | "inactive";

const PREFIX = "aura:recoverySupport:v1:";

function storageKey(patientId: string, date: string): string {
  return `${PREFIX}${patientId}:${date}`;
}

function normalizeAdaptation(
  value: unknown,
): CheckinAdaptationDecision | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as CheckinAdaptationDecision;
  if (
    typeof record.patientId !== "string" ||
    typeof record.date !== "string" ||
    (record.mode !== "standard" &&
      record.mode !== "shortened" &&
      record.mode !== "expanded")
  ) {
    return null;
  }

  return record;
}

function normalizeNudge(value: unknown): RecoveryNudge | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as RecoveryNudge;
  if (
    typeof record.patientId !== "string" ||
    typeof record.kind !== "string" ||
    typeof record.title !== "string" ||
    typeof record.message !== "string"
  ) {
    return null;
  }

  return record;
}

function normalizeCache(value: unknown): CachedRecoverySupport | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as {
    cachedAt?: unknown;
    date?: unknown;
    adaptation?: unknown;
    nudge?: unknown;
  };

  if (
    typeof record.cachedAt !== "number" ||
    !Number.isFinite(record.cachedAt) ||
    typeof record.date !== "string" ||
    !record.date.trim()
  ) {
    return null;
  }

  return {
    cachedAt: record.cachedAt,
    date: record.date,
    adaptation: normalizeAdaptation(record.adaptation),
    nudge: normalizeNudge(record.nudge),
  };
}

export async function getCachedRecoverySupport(
  patientId: string,
  date: string,
): Promise<CachedRecoverySupport | null> {
  if (!patientId.trim() || !date.trim()) {
    return null;
  }

  try {
    const raw = await AsyncStorage.getItem(storageKey(patientId, date));
    if (!raw) {
      return null;
    }

    return normalizeCache(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function setCachedRecoverySupport(
  patientId: string,
  date: string,
  payload: {
    adaptation: CheckinAdaptationDecision | null;
    nudge: RecoveryNudge | null;
  },
): Promise<void> {
  if (!patientId.trim() || !date.trim()) {
    return;
  }

  try {
    await AsyncStorage.setItem(
      storageKey(patientId, date),
      JSON.stringify({
        cachedAt: Date.now(),
        date,
        adaptation: payload.adaptation,
        nudge: payload.nudge,
      } satisfies CachedRecoverySupport),
    );
  } catch {
    // Best-effort cache.
  }
}

export function getPatientCareMode(patient: Patient | null): PatientCareMode {
  if (patient?.status === "inactive") {
    return "inactive";
  }

  if (patient?.status === "discharged") {
    return patient.discharge?.independentModeEnabled === true
      ? "independent"
      : "discharged";
  }

  return "active";
}

export function canPatientUseCheckin(patient: Patient | null): boolean {
  const mode = getPatientCareMode(patient);
  return mode === "active" || mode === "independent";
}

export function canPatientUseMessages(patient: Patient | null): boolean {
  return getPatientCareMode(patient) === "active";
}

export function canPatientUsePlan(patient: Patient | null): boolean {
  return getPatientCareMode(patient) === "active";
}

export function getCareModeNotice(patient: Patient | null): {
  title: string;
  message: string;
} | null {
  const mode = getPatientCareMode(patient);

  if (mode === "independent") {
    return {
      title: "Independent recovery mode",
      message:
        "Your care program has ended. You can keep tracking recovery here, but routine clinician monitoring is no longer active.",
    };
  }

  if (mode === "discharged") {
    return {
      title: "Care program completed",
      message:
        "Your care program has ended. Historical progress stays available here, but routine messaging and check-ins are no longer active.",
    };
  }

  if (mode === "inactive") {
    return {
      title: "Archive view",
      message:
        "This account is inactive. Past recovery information stays available, but active tracking and messaging are turned off.",
    };
  }

  return null;
}
