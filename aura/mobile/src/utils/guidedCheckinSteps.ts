import {
  parseGuidedCheckinExerciseAdherence,
  parseGuidedCheckinMedicationStatus,
  parseGuidedCheckinMoodScore,
  parseGuidedCheckinNotesTranscript,
  parseGuidedCheckinPainScore,
  parseGuidedCheckinSleepHours,
  parseGuidedCheckinSleepQuality,
  type GuidedCheckinMedicationStatus,
  type GuidedCheckinParseResult,
} from "@/src/utils/guidedCheckinParser";

export type GuidedCheckinStepId =
  | "pain"
  | "mood"
  | "exercise"
  | "medication"
  | "notes"
  | "sleepHours"
  | "sleepQuality";

export type GuidedCheckinStepValue = number | string | GuidedCheckinMedicationStatus;

export type GuidedCheckinStep = {
  id: GuidedCheckinStepId;
  title: string;
  question: string;
  helperText: string;
  destinationLabel: string;
  readAloudText: string;
  parse: (transcript: string) => GuidedCheckinParseResult<GuidedCheckinStepValue>;
  formatValue: (value: GuidedCheckinStepValue) => string;
};

type GuidedCheckinStepsOptions = {
  includeSleep: boolean;
};

function medicationLabel(value: GuidedCheckinStepValue): string {
  switch (value) {
    case "taken":
      return "Taken";
    case "missed":
      return "Missed";
    case "not_applicable":
      return "Not applicable";
    default:
      return String(value);
  }
}

const BASE_STEPS: GuidedCheckinStep[] = [
  {
    id: "pain",
    title: "Pain level",
    question: "What is your pain level from 0 to 10 today?",
    helperText: "Say a number from 0 to 10, like 3 or seven out of ten.",
    destinationLabel: "Pain level",
    readAloudText:
      "Pain level. What is your pain level from 0 to 10 today? Say a number from 0 to 10.",
    parse: parseGuidedCheckinPainScore,
    formatValue: (value) => `${value}/10`,
  },
  {
    id: "mood",
    title: "Mood",
    question: "What is your mood from 1 to 5 today?",
    helperText: "Say a number from 1 to 5, or a label like very low, okay, or very strong.",
    destinationLabel: "Mood",
    readAloudText:
      "Mood. What is your mood from 1 to 5 today? One is very low and five is very strong.",
    parse: parseGuidedCheckinMoodScore,
    formatValue: (value) => `${value}/5`,
  },
  {
    id: "exercise",
    title: "Exercise completion",
    question: "What percent of today’s exercise plan did you complete?",
    helperText: "Say a percent from 0 to 100, like 80 percent, half, or all.",
    destinationLabel: "Exercise completion",
    readAloudText:
      "Exercise completion. What percent of today's exercise plan did you complete?",
    parse: parseGuidedCheckinExerciseAdherence,
    formatValue: (value) => `${value}%`,
  },
  {
    id: "medication",
    title: "Medication status",
    question: "Was your medication taken, missed, or not applicable today?",
    helperText: "Say taken, missed, or not applicable. Do not include dosage changes here.",
    destinationLabel: "Medication status",
    readAloudText:
      "Medication status. Was your medication taken, missed, or not applicable today?",
    parse: parseGuidedCheckinMedicationStatus,
    formatValue: medicationLabel,
  },
  {
    id: "notes",
    title: "Notes",
    question: "What note would you like to add for your care team to review?",
    helperText: "Your words stay as a draft until you confirm them and later submit the check-in.",
    destinationLabel: "Notes",
    readAloudText:
      "Notes. What note would you like to add for your care team to review?",
    parse: parseGuidedCheckinNotesTranscript,
    formatValue: (value) => String(value),
  },
];

const SLEEP_STEPS: GuidedCheckinStep[] = [
  {
    id: "sleepHours",
    title: "Sleep hours",
    question: "How many hours did you sleep last night?",
    helperText: "Say clear hours from 0 to 16, like 7 hours or seven and a half.",
    destinationLabel: "Hours slept",
    readAloudText: "Sleep hours. How many hours did you sleep last night?",
    parse: parseGuidedCheckinSleepHours,
    formatValue: (value) =>
      typeof value === "number" ? `${value.toFixed(1)} hours` : String(value),
  },
  {
    id: "sleepQuality",
    title: "Sleep quality",
    question: "What was your sleep quality from 1 to 5?",
    helperText: "Say a number from 1 to 5, or a label like very low, okay, or very strong.",
    destinationLabel: "Sleep quality",
    readAloudText:
      "Sleep quality. What was your sleep quality from 1 to 5?",
    parse: parseGuidedCheckinSleepQuality,
    formatValue: (value) => `${value}/5`,
  },
];

export function getGuidedCheckinSteps({
  includeSleep,
}: GuidedCheckinStepsOptions): GuidedCheckinStep[] {
  return includeSleep ? [...BASE_STEPS, ...SLEEP_STEPS] : [...BASE_STEPS];
}
