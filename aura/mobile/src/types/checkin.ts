import type { BodyMapPainType, BodyMapRegion } from '@/src/utils/bodyMapLabels';

export const CHECKIN_SYMPTOM_FLAGS = [
  'stiffness',
  'swelling',
  'fatigue',
  'mobility_difficulty',
] as const;

export type CheckinSymptomFlag = (typeof CHECKIN_SYMPTOM_FLAGS)[number];

export const CHECKIN_MEDICATION_STATUSES = [
  'taken',
  'missed',
  'not_applicable',
] as const;

export type CheckinMedicationStatus = (typeof CHECKIN_MEDICATION_STATUSES)[number];

export const CHECKIN_HELP_LEVELS = ['none', 'follow_up', 'urgent'] as const;
export type CheckinHelpLevel = (typeof CHECKIN_HELP_LEVELS)[number];

export const CHECKIN_SAFETY_STATES = ['safe', 'unsure', 'unsafe'] as const;
export type CheckinSafetyState = (typeof CHECKIN_SAFETY_STATES)[number];

export type BodyMapSelection = {
  intensity: number;
  type: BodyMapPainType;
};

export type CheckinBodyMapDraft = {
  selectedRegions: BodyMapRegion[];
  primaryRegion: BodyMapRegion | null;
  selections: Partial<Record<BodyMapRegion, BodyMapSelection>>;
};

export type CheckinRecoveryDraft = {
  exercisePercent: number;
  difficultyLevel: number | null;
  confidenceLevel: number | null;
  mobilityLevel: number | null;
};

export type CheckinSupportDraft = {
  mood: number | null;
  stressLevel: number | null;
  wantsExtraSupport: boolean;
  helpLevel: CheckinHelpLevel | null;
  safetyState: CheckinSafetyState | null;
};

export type CheckinDailySignalsDraft = {
  sleepHours: number | null;
  sleepQuality: number | null;
  sleepDisturbances: number | null;
  hydrationLevel: number | null;
  energyLevel: number | null;
};

export type CheckinAdherenceDraft = {
  medicationStatus: CheckinMedicationStatus | null;
  medicationReason: string | null;
};

export type CheckinReviewChip = {
  id: string;
  label: string;
  tone: 'neutral' | 'accent' | 'warning' | 'success' | 'danger';
};

export type CheckinDraftRecord = {
  patientId: string;
  date: string;
  savedAt: number;
  activeStep: number;
  showRecoveryDetails: boolean;
  showDailyContext: boolean;
  pain: number;
  symptomFlags: CheckinSymptomFlag[];
  recovery: CheckinRecoveryDraft;
  adherence: CheckinAdherenceDraft;
  support: CheckinSupportDraft;
  dailySignals: CheckinDailySignalsDraft;
  bodyMap: CheckinBodyMapDraft;
  notes: string;
};
