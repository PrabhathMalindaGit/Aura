import type { CheckInCreatePayload } from '@/src/api/patient';
import type {
  CheckinAdherenceDraft,
  CheckinBodyMapDraft,
  CheckinDailySignalsDraft,
  CheckinHelpLevel,
  CheckinReviewChip,
  CheckinSupportDraft,
  CheckinSymptomFlag,
  CheckinRecoveryDraft,
  CheckinSafetyState,
  CheckinMedicationStatus,
} from '@/src/types/checkin';
import { painTypeLabel, regionLabel } from '@/src/utils/bodyMapLabels';

export const SYMPTOM_FLAG_LABELS: Record<CheckinSymptomFlag, string> = {
  stiffness: 'Stiffness',
  swelling: 'Swelling',
  fatigue: 'Fatigue',
  mobility_difficulty: 'Mobility difficulty',
};

export const MEDICATION_STATUS_LABELS: Record<CheckinMedicationStatus, string> = {
  taken: 'Taken',
  missed: 'Missed',
  not_applicable: 'Not applicable',
};

export const MEDICATION_REASON_OPTIONS = [
  'Forgot',
  'Side effects',
  'Schedule issue',
  'Waiting for refill',
  'Not needed today',
] as const;

export const HELP_LEVEL_LABELS: Record<CheckinHelpLevel, string> = {
  none: 'I am okay',
  follow_up: 'Please follow up',
  urgent: 'I need urgent help',
};

export const SAFETY_STATE_LABELS: Record<CheckinSafetyState, string> = {
  safe: 'I feel safe',
  unsure: 'I am not sure',
  unsafe: 'I do not feel safe',
};

export function scaleLabel(value: number | null, labels: Record<number, string>): string {
  if (value === null) {
    return 'Not set';
  }
  return labels[value] ?? String(value);
}

export const FIVE_POINT_RECOVERY_LABELS: Record<number, string> = {
  1: 'Very low',
  2: 'Low',
  3: 'Okay',
  4: 'Strong',
  5: 'Very strong',
};

export const FIVE_POINT_DIFFICULTY_LABELS: Record<number, string> = {
  1: 'Very easy',
  2: 'Easy',
  3: 'Manageable',
  4: 'Hard',
  5: 'Very hard',
};

export const FIVE_POINT_SUPPORT_LABELS: Record<number, string> = {
  1: 'Very low',
  2: 'Low',
  3: 'Moderate',
  4: 'High',
  5: 'Very high',
};

export function symptomFlagLabel(value: CheckinSymptomFlag): string {
  return SYMPTOM_FLAG_LABELS[value] ?? value;
}

export function medicationStatusLabel(value: CheckinMedicationStatus | null): string {
  if (!value) {
    return 'Not recorded';
  }
  return MEDICATION_STATUS_LABELS[value] ?? value;
}

export function helpLevelLabel(value: CheckinHelpLevel | null): string {
  if (!value) {
    return 'Not set';
  }
  return HELP_LEVEL_LABELS[value] ?? value;
}

export function safetyStateLabel(value: CheckinSafetyState | null): string {
  if (!value) {
    return 'Not set';
  }
  return SAFETY_STATE_LABELS[value] ?? value;
}

export function toggleSymptomFlag(
  current: CheckinSymptomFlag[],
  value: CheckinSymptomFlag,
): CheckinSymptomFlag[] {
  return current.includes(value)
    ? current.filter((entry) => entry !== value)
    : [...current, value];
}

export function buildCheckinPayload(input: {
  date: string;
  pain: number;
  symptomFlags: CheckinSymptomFlag[];
  recovery: CheckinRecoveryDraft;
  adherence: CheckinAdherenceDraft;
  support: CheckinSupportDraft;
  dailySignals: CheckinDailySignalsDraft;
  bodyMap: CheckinBodyMapDraft;
  notes: string;
}): CheckInCreatePayload {
  const hasSleepData =
    input.dailySignals.sleepHours !== null ||
    input.dailySignals.sleepQuality !== null ||
    input.dailySignals.sleepDisturbances !== null;
  const hasBodyMapData = input.bodyMap.selectedRegions.length > 0;
  const cleanedNotes = input.notes.trim();
  const medicationStatus = input.adherence.medicationStatus ?? undefined;
  const medicationReason =
    input.adherence.medicationReason && input.adherence.medicationReason.trim().length > 0
      ? input.adherence.medicationReason.trim()
      : undefined;
  const supportIsNeutral =
    input.support.helpLevel === null ||
    input.support.helpLevel === "none";
  const safetyIsNeutral =
    input.support.safetyState === null ||
    input.support.safetyState === "safe";

  return {
    date: input.date,
    mood: input.support.mood ?? 1,
    pain: input.pain,
    symptoms:
      input.symptomFlags.length > 0
        ? {
            flags: input.symptomFlags,
          }
        : undefined,
    adherence: {
      exercises: Number((input.recovery.exercisePercent / 100).toFixed(1)),
      medication: medicationStatus === "taken",
      medicationStatus,
      medicationReason,
    },
    recovery:
      input.recovery.difficultyLevel !== null ||
      input.recovery.confidenceLevel !== null ||
      input.recovery.mobilityLevel !== null
        ? {
            difficultyLevel: input.recovery.difficultyLevel ?? undefined,
            confidenceLevel: input.recovery.confidenceLevel ?? undefined,
            mobilityLevel: input.recovery.mobilityLevel ?? undefined,
          }
        : undefined,
    support:
      input.support.stressLevel !== null ||
      !supportIsNeutral ||
      !safetyIsNeutral ||
      input.support.wantsExtraSupport
        ? {
            stressLevel: input.support.stressLevel ?? undefined,
            wantsFollowUp:
              input.support.helpLevel === "follow_up" || input.support.helpLevel === "urgent",
            wantsExtraSupport: input.support.wantsExtraSupport || undefined,
            needsUrgentHelp: input.support.helpLevel === "urgent" || undefined,
            feelsSafe:
              input.support.safetyState === "safe"
                ? true
                : input.support.safetyState === "unsafe"
                  ? false
                  : undefined,
          }
        : undefined,
    sleep: hasSleepData
      ? {
          hours: input.dailySignals.sleepHours ?? undefined,
          quality: input.dailySignals.sleepQuality ?? undefined,
          disturbances: input.dailySignals.sleepDisturbances ?? undefined,
        }
      : undefined,
    dailySignals:
      input.dailySignals.hydrationLevel !== null || input.dailySignals.energyLevel !== null
        ? {
            hydrationLevel: input.dailySignals.hydrationLevel ?? undefined,
            energyLevel: input.dailySignals.energyLevel ?? undefined,
          }
        : undefined,
    bodyMap: hasBodyMapData
      ? {
          primaryRegion:
            input.bodyMap.primaryRegion && input.bodyMap.selectedRegions.includes(input.bodyMap.primaryRegion)
              ? input.bodyMap.primaryRegion
              : undefined,
          regions: input.bodyMap.selectedRegions.map((region) => ({
            region,
            intensity: input.bodyMap.selections[region]?.intensity ?? (input.pain > 0 ? input.pain : 5),
            type: input.bodyMap.selections[region]?.type ?? 'ache',
          })),
        }
      : undefined,
    notes: cleanedNotes || undefined,
  };
}

export function buildReviewChips(input: {
  pain: number;
  symptomFlags: CheckinSymptomFlag[];
  bodyMap: CheckinBodyMapDraft;
  recovery: CheckinRecoveryDraft;
  adherence: CheckinAdherenceDraft;
  support: CheckinSupportDraft;
}): CheckinReviewChip[] {
  const chips: CheckinReviewChip[] = [
    { id: 'pain', label: `Pain ${input.pain}/10`, tone: input.pain >= 7 ? 'warning' : 'accent' },
    {
      id: 'exercise',
      label: `Exercises ${input.recovery.exercisePercent}%`,
      tone: input.recovery.exercisePercent >= 70 ? 'success' : 'warning',
    },
  ];

  if (input.adherence.medicationStatus) {
    chips.push({
      id: 'medication',
      label: `Medication ${medicationStatusLabel(input.adherence.medicationStatus)}`,
      tone: input.adherence.medicationStatus === 'taken' ? 'success' : 'neutral',
    });
  }

  if (input.bodyMap.primaryRegion) {
    chips.push({
      id: 'primary-region',
      label: `Most bothersome: ${regionLabel(input.bodyMap.primaryRegion)}`,
      tone: 'accent',
    });
  }

  if (input.symptomFlags.length > 0) {
    chips.push({
      id: 'symptoms',
      label: input.symptomFlags.map((item) => symptomFlagLabel(item)).join(', '),
      tone: 'neutral',
    });
  }

  if (input.support.helpLevel && input.support.helpLevel !== 'none') {
    chips.push({
      id: 'help-level',
      label: helpLevelLabel(input.support.helpLevel),
      tone:
        input.support.helpLevel === 'urgent'
          ? 'danger'
          : input.support.helpLevel === 'follow_up'
            ? 'warning'
            : 'success',
    });
  }

  return chips;
}

export function summarizePrimaryBodyMap(input: CheckinBodyMapDraft): string {
  if (input.selectedRegions.length === 0) {
    return 'No pain areas selected';
  }

  const labels = input.selectedRegions.slice(0, 2).map((region) => {
    const selection = input.selections[region];
    if (!selection) {
      return regionLabel(region);
    }
    return `${regionLabel(region)} ${selection.intensity}/10 ${painTypeLabel(selection.type).toLowerCase()}`;
  });

  if (input.selectedRegions.length > 2) {
    labels.push(`+${input.selectedRegions.length - 2} more`);
  }

  return labels.join(' · ');
}
