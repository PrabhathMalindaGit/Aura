export const CHECK_IN_SYMPTOM_FLAGS = [
  'stiffness',
  'swelling',
  'fatigue',
  'mobility_difficulty',
] as const;

export type CheckInSymptomFlag = (typeof CHECK_IN_SYMPTOM_FLAGS)[number];

export const CHECK_IN_MEDICATION_STATUSES = [
  'taken',
  'missed',
  'not_applicable',
] as const;

export type CheckInMedicationStatus = (typeof CHECK_IN_MEDICATION_STATUSES)[number];

const symptomFlagSet = new Set<string>(CHECK_IN_SYMPTOM_FLAGS);
const medicationStatusSet = new Set<string>(CHECK_IN_MEDICATION_STATUSES);

export function isCheckInSymptomFlag(value: unknown): value is CheckInSymptomFlag {
  return typeof value === 'string' && symptomFlagSet.has(value);
}

export function isCheckInMedicationStatus(value: unknown): value is CheckInMedicationStatus {
  return typeof value === 'string' && medicationStatusSet.has(value);
}
