import AsyncStorage from '@react-native-async-storage/async-storage';

import type {
  CheckinAdherenceDraft,
  CheckinBodyMapDraft,
  CheckinDraftRecord,
  CheckinRecoveryDraft,
  CheckinSupportDraft,
  CheckinDailySignalsDraft,
  CheckinSymptomFlag,
} from '@/src/types/checkin';

const PREFIX = 'aura:checkinDraft:v1:';

function storageKey(patientId: string, date: string): string {
  return `${PREFIX}${patientId}:${date}`;
}

function normalizeNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function normalizeRecovery(value: unknown): CheckinRecoveryDraft {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    exercisePercent: normalizeNumber(record.exercisePercent, 0),
    difficultyLevel: normalizeNullableNumber(record.difficultyLevel),
    confidenceLevel: normalizeNullableNumber(record.confidenceLevel),
    mobilityLevel: normalizeNullableNumber(record.mobilityLevel),
  };
}

function normalizeAdherence(value: unknown): CheckinAdherenceDraft {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const medicationStatus = record.medicationStatus;
  return {
    medicationStatus:
      medicationStatus === 'taken' ||
      medicationStatus === 'missed' ||
      medicationStatus === 'not_applicable'
        ? medicationStatus
        : null,
    medicationReason: normalizeString(record.medicationReason) || null,
  };
}

function normalizeSupport(value: unknown): CheckinSupportDraft {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const helpLevel = record.helpLevel;
  const safetyState = record.safetyState;

  return {
    mood: normalizeNullableNumber(record.mood),
    stressLevel: normalizeNullableNumber(record.stressLevel),
    wantsExtraSupport: record.wantsExtraSupport === true,
    helpLevel:
      helpLevel === 'none' || helpLevel === 'follow_up' || helpLevel === 'urgent'
        ? helpLevel
        : null,
    safetyState:
      safetyState === 'safe' || safetyState === 'unsure' || safetyState === 'unsafe'
        ? safetyState
        : null,
  };
}

function normalizeDailySignals(value: unknown): CheckinDailySignalsDraft {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    sleepHours: normalizeNullableNumber(record.sleepHours),
    sleepQuality: normalizeNullableNumber(record.sleepQuality),
    sleepDisturbances: normalizeNullableNumber(record.sleepDisturbances),
    hydrationLevel: normalizeNullableNumber(record.hydrationLevel),
    energyLevel: normalizeNullableNumber(record.energyLevel),
  };
}

function normalizeSymptomFlags(value: unknown): CheckinSymptomFlag[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (entry): entry is CheckinSymptomFlag =>
      entry === 'stiffness' ||
      entry === 'swelling' ||
      entry === 'fatigue' ||
      entry === 'mobility_difficulty',
  );
}

function normalizeBodyMap(value: unknown): CheckinBodyMapDraft {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const selectedRegions = Array.isArray(record.selectedRegions)
    ? record.selectedRegions.filter((entry): entry is string => typeof entry === 'string')
    : [];
  const selectionsRecord =
    record.selections && typeof record.selections === 'object'
      ? (record.selections as Record<string, unknown>)
      : {};

  const selections = Object.fromEntries(
    Object.entries(selectionsRecord)
      .map(([region, selection]) => {
        if (!selection || typeof selection !== 'object') {
          return null;
        }
        const candidate = selection as Record<string, unknown>;
        const intensity = normalizeNumber(candidate.intensity, 0);
        const type = normalizeString(candidate.type);
        if (!region || !type) {
          return null;
        }
        return [
          region,
          {
            intensity,
            type,
          },
        ] as const;
      })
      .filter((entry): entry is readonly [string, { intensity: number; type: string }] => Boolean(entry)),
  );

  return {
    selectedRegions: selectedRegions as CheckinBodyMapDraft['selectedRegions'],
    primaryRegion: typeof record.primaryRegion === 'string' ? (record.primaryRegion as CheckinBodyMapDraft['primaryRegion']) : null,
    selections: selections as CheckinBodyMapDraft['selections'],
  };
}

function normalizeDraft(value: unknown): CheckinDraftRecord | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  const patientId = normalizeString(record.patientId).trim();
  const date = normalizeString(record.date).trim();
  if (!patientId || !date) {
    return null;
  }

  return {
    patientId,
    date,
    savedAt: normalizeNumber(record.savedAt, Date.now()),
    activeStep: Math.max(0, Math.min(3, normalizeNumber(record.activeStep, 0))),
    showRecoveryDetails: record.showRecoveryDetails === true,
    showDailyContext: record.showDailyContext === true,
    pain: normalizeNumber(record.pain, 0),
    symptomFlags: normalizeSymptomFlags(record.symptomFlags),
    recovery: normalizeRecovery(record.recovery),
    adherence: normalizeAdherence(record.adherence),
    support: normalizeSupport(record.support),
    dailySignals: normalizeDailySignals(record.dailySignals),
    bodyMap: normalizeBodyMap(record.bodyMap),
    notes: normalizeString(record.notes),
  };
}

export async function getCheckinDraft(
  patientId: string,
  date: string,
): Promise<CheckinDraftRecord | null> {
  if (!patientId.trim() || !date.trim()) {
    return null;
  }

  try {
    const raw = await AsyncStorage.getItem(storageKey(patientId, date));
    if (!raw) {
      return null;
    }

    return normalizeDraft(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function setCheckinDraft(record: CheckinDraftRecord): Promise<void> {
  if (!record.patientId.trim() || !record.date.trim()) {
    return;
  }

  try {
    await AsyncStorage.setItem(
      storageKey(record.patientId, record.date),
      JSON.stringify(record),
    );
  } catch {
    // Draft writes are best effort.
  }
}

export async function clearCheckinDraft(patientId: string, date: string): Promise<void> {
  if (!patientId.trim() || !date.trim()) {
    return;
  }

  try {
    await AsyncStorage.removeItem(storageKey(patientId, date));
  } catch {
    // Ignore cleanup failures.
  }
}
