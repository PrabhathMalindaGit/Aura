import Alert from "../models/Alert";
import AppointmentRequest from "../models/AppointmentRequest";
import AppointmentSlot from "../models/AppointmentSlot";
import CareEvent from "../models/CareEvent";
import ChatMessage from "../models/ChatMessage";
import CheckIn from "../models/CheckIn";
import ClinicianCoordination from "../models/ClinicianCoordination";
import CommunicationEvent from "../models/CommunicationEvent";
import CommunicationReview from "../models/CommunicationReview";
import ExercisePlan from "../models/ExercisePlan";
import ExerciseSession from "../models/ExerciseSession";
import HydrationLog from "../models/HydrationLog";
import InsightSuggestion from "../models/InsightSuggestion";
import Medication from "../models/Medication";
import MedicationLog from "../models/MedicationLog";
import MedicationSchedule from "../models/MedicationSchedule";
import NutritionLog from "../models/NutritionLog";
import Patient from "../models/Patient";
import PatientRecoverySupportConfig from "../models/PatientRecoverySupportConfig";
import PatientThresholdConfig from "../models/PatientThresholdConfig";
import PromInstance from "../models/PromInstance";
import Task from "../models/Task";
import WearableDaily from "../models/WearableDaily";
import { env } from "../env";

export const PRESENTATION_DEMO_TAG = "presentation-seed";
export const PRESENTATION_SEED_ID = "phase-10c-presentation-seed-v1";

const CLINICIAN_ID = "presentation-clinician";
const CLINICIAN_NAME = "Presentation Clinician";
const PRESENTATION_PATIENTS = [
  {
    patientId: "presentation-emily-chen",
    displayName: "Emily Chen",
    context: "Neurological rehab, post-stroke strength and balance",
    phase: "phase-balance",
    painBase: 3,
  },
  {
    patientId: "presentation-robert-jackson",
    displayName: "Robert Jackson",
    context: "Orthopedic knee mobility",
    phase: "phase-mobility",
    painBase: 5,
  },
  {
    patientId: "presentation-maria-gonzalez",
    displayName: "Maria Gonzalez",
    context: "Lower back pain evaluation",
    phase: "phase-evaluation",
    painBase: 6,
  },
  {
    patientId: "presentation-jacob-patel",
    displayName: "Jacob Patel",
    context: "Post-op knee rehab",
    phase: "phase-strength",
    painBase: 4,
  },
  {
    patientId: "presentation-sarah-kim",
    displayName: "Sarah Kim",
    context: "Shoulder telehealth recovery",
    phase: "phase-range",
    painBase: 3,
  },
  {
    patientId: "presentation-michael-brown",
    displayName: "Michael Brown",
    context: "Hip mobility recovery",
    phase: "phase-gait",
    painBase: 4,
  },
  {
    patientId: "presentation-emily-lee",
    displayName: "Emily Lee",
    context: "Neck pain and dry needling follow-up",
    phase: "phase-symptom-control",
    painBase: 5,
  },
  {
    patientId: "presentation-david-lee",
    displayName: "David Lee",
    context: "Return-to-activity follow-up",
    phase: "phase-return",
    painBase: 2,
  },
] as const;

const seedDates = Array.from({ length: 14 }, (_, index) => {
  const date = new Date(Date.UTC(2026, 3, 6 + index));
  return date.toISOString().slice(0, 10);
});

const promQuestions = [
  {
    id: "pain",
    text: "How much did pain limit your activity this week?",
    type: "likert",
    min: 0,
    max: 10,
    labels: { minLabel: "Not at all", maxLabel: "Severely" },
    required: true,
  },
  {
    id: "confidence",
    text: "How confident do you feel completing your plan?",
    type: "likert",
    min: 0,
    max: 10,
    labels: { minLabel: "Not confident", maxLabel: "Very confident" },
    required: true,
    reverse: true,
  },
];

type PresentationCounts = Record<string, number>;
type CountableModel = {
  countDocuments(filter: Record<string, unknown>): Promise<number>;
};

export class PresentationSeedDisabledError extends Error {
  constructor() {
    super("Presentation seed is disabled");
  }
}

export class PresentationSeedCollisionError extends Error {
  collisions: string[];

  constructor(collisions: string[]) {
    super("Presentation seed collision detected");
    this.collisions = collisions;
  }
}

function assertPresentationSeedEnabled(): void {
  if (!env.AURA_PRESENTATION_SEED_ENABLED) {
    throw new PresentationSeedDisabledError();
  }
}

function presentationPatientIds(): string[] {
  return PRESENTATION_PATIENTS.map((patient) => patient.patientId);
}

function dateAt(date: string, hour: number): Date {
  return new Date(`${date}T${String(hour).padStart(2, "0")}:00:00.000Z`);
}

function isTaggedQuery() {
  return { demoTag: PRESENTATION_DEMO_TAG };
}

function untaggedQuery() {
  return {
    $or: [
      { demoTag: { $exists: false } },
      { demoTag: null },
      { demoTag: { $ne: PRESENTATION_DEMO_TAG } },
    ],
  };
}

async function countPresentationRecords(): Promise<PresentationCounts> {
  const tag = isTaggedQuery();
  const [
    patients,
    checkIns,
    hydrationLogs,
    nutritionLogs,
    wearableDailies,
    medications,
    medicationSchedules,
    medicationLogs,
    exercisePlans,
    exerciseSessions,
    promInstances,
    chatMessages,
    alerts,
    careEvents,
    communicationReviews,
    communicationEvents,
    clinicianCoordinations,
    tasks,
    insightSuggestions,
    appointmentSlots,
    appointmentRequests,
    thresholdConfigs,
    recoverySupportConfigs,
  ] = await Promise.all([
    Patient.countDocuments(tag),
    CheckIn.countDocuments(tag),
    HydrationLog.countDocuments(tag),
    NutritionLog.countDocuments(tag),
    WearableDaily.countDocuments(tag),
    Medication.countDocuments(tag),
    MedicationSchedule.countDocuments(tag),
    MedicationLog.countDocuments(tag),
    ExercisePlan.countDocuments(tag),
    ExerciseSession.countDocuments(tag),
    PromInstance.countDocuments(tag),
    ChatMessage.countDocuments(tag),
    Alert.countDocuments(tag),
    CareEvent.countDocuments(tag),
    CommunicationReview.countDocuments(tag),
    CommunicationEvent.countDocuments(tag),
    ClinicianCoordination.countDocuments(tag),
    Task.countDocuments(tag),
    InsightSuggestion.countDocuments(tag),
    AppointmentSlot.countDocuments(tag),
    AppointmentRequest.countDocuments(tag),
    PatientThresholdConfig.countDocuments(tag),
    PatientRecoverySupportConfig.countDocuments(tag),
  ]);

  return {
    patients,
    checkIns,
    hydrationLogs,
    nutritionLogs,
    wearableDailies,
    medications,
    medicationSchedules,
    medicationLogs,
    exercisePlans,
    exerciseSessions,
    promInstances,
    chatMessages,
    alerts,
    careEvents,
    communicationReviews,
    communicationEvents,
    clinicianCoordinations,
    tasks,
    insightSuggestions,
    appointmentSlots,
    appointmentRequests,
    thresholdConfigs,
    recoverySupportConfigs,
  };
}

export async function getPresentationSeedStatus() {
  if (!env.AURA_PRESENTATION_SEED_ENABLED) {
    return {
      enabled: false,
      loaded: false,
      seedId: PRESENTATION_SEED_ID,
      counts: {},
      lastLoadedAt: null,
      message: "Presentation seed is disabled",
    };
  }

  const counts = await countPresentationRecords();
  const loaded = counts.patients === PRESENTATION_PATIENTS.length;
  const latestPatient = await Patient.findOne(isTaggedQuery())
    .sort({ updatedAt: -1, createdAt: -1 })
    .select("updatedAt createdAt")
    .lean();
  const lastLoadedAt =
    latestPatient?.updatedAt instanceof Date
      ? latestPatient.updatedAt.toISOString()
      : latestPatient?.createdAt instanceof Date
        ? latestPatient.createdAt.toISOString()
        : null;

  return {
    enabled: true,
    loaded,
    seedId: PRESENTATION_SEED_ID,
    counts,
    lastLoadedAt,
  };
}

async function preflightPresentationSeedCollisions(): Promise<void> {
  const patientIds = presentationPatientIds();
  const untagged = untaggedQuery();
  const patientIdModels: Array<[string, CountableModel]> = [
    ["patients", Patient as CountableModel],
    ["checkIns", CheckIn as CountableModel],
    ["hydrationLogs", HydrationLog as CountableModel],
    ["nutritionLogs", NutritionLog as CountableModel],
    ["wearableDailies", WearableDaily as CountableModel],
    ["medications", Medication as CountableModel],
    ["medicationSchedules", MedicationSchedule as CountableModel],
    ["medicationLogs", MedicationLog as CountableModel],
    ["exercisePlans", ExercisePlan as CountableModel],
    ["exerciseSessions", ExerciseSession as CountableModel],
    ["promInstances", PromInstance as CountableModel],
    ["chatMessages", ChatMessage as CountableModel],
    ["alerts", Alert as CountableModel],
    ["careEvents", CareEvent as CountableModel],
    ["communicationReviews", CommunicationReview as CountableModel],
    ["communicationEvents", CommunicationEvent as CountableModel],
    ["clinicianCoordinations", ClinicianCoordination as CountableModel],
    ["tasks", Task as CountableModel],
    ["insightSuggestions", InsightSuggestion as CountableModel],
    ["appointmentRequests", AppointmentRequest as CountableModel],
    ["thresholdConfigs", PatientThresholdConfig as CountableModel],
    ["recoverySupportConfigs", PatientRecoverySupportConfig as CountableModel],
  ];

  const collisions: string[] = [];
  for (const [name, model] of patientIdModels) {
    const count = await model.countDocuments({
      patientId: { $in: patientIds },
      ...untagged,
    });
    if (count > 0) {
      collisions.push(`${name}:${count}`);
    }
  }

  const slotWindows = buildAppointmentSlots().map((slot) => ({
    clinicianId: slot.clinicianId,
    startsAt: slot.startsAt,
  }));
  const slotCollisionCount = await AppointmentSlot.countDocuments({
    $or: slotWindows,
    ...untagged,
  });
  if (slotCollisionCount > 0) {
    collisions.push(`appointmentSlots:${slotCollisionCount}`);
  }

  if (collisions.length > 0) {
    throw new PresentationSeedCollisionError(collisions);
  }
}

async function resetPresentationSeedRecords(): Promise<PresentationCounts> {
  const tag = isTaggedQuery();
  const [
    appointmentRequests,
    appointmentSlots,
    insightSuggestions,
    tasks,
    clinicianCoordinations,
    communicationEvents,
    communicationReviews,
    careEvents,
    alerts,
    chatMessages,
    promInstances,
    exerciseSessions,
    exercisePlans,
    medicationLogs,
    medicationSchedules,
    medications,
    wearableDailies,
    nutritionLogs,
    hydrationLogs,
    checkIns,
    thresholdConfigs,
    recoverySupportConfigs,
    patients,
  ] = await Promise.all([
    AppointmentRequest.deleteMany(tag),
    AppointmentSlot.deleteMany(tag),
    InsightSuggestion.deleteMany(tag),
    Task.deleteMany(tag),
    ClinicianCoordination.deleteMany(tag),
    CommunicationEvent.deleteMany(tag),
    CommunicationReview.deleteMany(tag),
    CareEvent.deleteMany(tag),
    Alert.deleteMany(tag),
    ChatMessage.deleteMany(tag),
    PromInstance.deleteMany(tag),
    ExerciseSession.deleteMany(tag),
    ExercisePlan.deleteMany(tag),
    MedicationLog.deleteMany(tag),
    MedicationSchedule.deleteMany(tag),
    Medication.deleteMany(tag),
    WearableDaily.deleteMany(tag),
    NutritionLog.deleteMany(tag),
    HydrationLog.deleteMany(tag),
    CheckIn.deleteMany(tag),
    PatientThresholdConfig.deleteMany(tag),
    PatientRecoverySupportConfig.deleteMany(tag),
    Patient.deleteMany(tag),
  ]);

  return {
    appointmentRequests: appointmentRequests.deletedCount ?? 0,
    appointmentSlots: appointmentSlots.deletedCount ?? 0,
    insightSuggestions: insightSuggestions.deletedCount ?? 0,
    tasks: tasks.deletedCount ?? 0,
    clinicianCoordinations: clinicianCoordinations.deletedCount ?? 0,
    communicationEvents: communicationEvents.deletedCount ?? 0,
    communicationReviews: communicationReviews.deletedCount ?? 0,
    careEvents: careEvents.deletedCount ?? 0,
    alerts: alerts.deletedCount ?? 0,
    chatMessages: chatMessages.deletedCount ?? 0,
    promInstances: promInstances.deletedCount ?? 0,
    exerciseSessions: exerciseSessions.deletedCount ?? 0,
    exercisePlans: exercisePlans.deletedCount ?? 0,
    medicationLogs: medicationLogs.deletedCount ?? 0,
    medicationSchedules: medicationSchedules.deletedCount ?? 0,
    medications: medications.deletedCount ?? 0,
    wearableDailies: wearableDailies.deletedCount ?? 0,
    nutritionLogs: nutritionLogs.deletedCount ?? 0,
    hydrationLogs: hydrationLogs.deletedCount ?? 0,
    checkIns: checkIns.deletedCount ?? 0,
    thresholdConfigs: thresholdConfigs.deletedCount ?? 0,
    recoverySupportConfigs: recoverySupportConfigs.deletedCount ?? 0,
    patients: patients.deletedCount ?? 0,
  };
}

function buildAppointmentSlots() {
  return [
    ["2026-04-13", 14],
    ["2026-04-14", 15],
    ["2026-04-15", 13],
    ["2026-04-15", 16],
    ["2026-04-16", 14],
    ["2026-04-17", 10],
    ["2026-04-17", 15],
    ["2026-04-18", 9],
    ["2026-04-18", 11],
    ["2026-04-19", 10],
  ].map(([date, hour], index) => ({
    clinicianId: CLINICIAN_ID,
    startsAt: dateAt(String(date), Number(hour)),
    endsAt: dateAt(String(date), Number(hour) + 1),
    modality: "video",
    status: index % 3 === 0 ? "closed" : "available",
    meetingLink: `https://meet.example.com/presentation-${index + 1}`,
    demoTag: PRESENTATION_DEMO_TAG,
  }));
}

function buildPatientRecords() {
  return PRESENTATION_PATIENTS.map((patient, index) => ({
    patientId: patient.patientId,
    displayName: patient.displayName,
    accessCode: `presentation-${index + 1}`,
    status: index === 6 ? "on_hold" : "active",
    clinicianId: CLINICIAN_ID,
    demoTag: PRESENTATION_DEMO_TAG,
    rehab: {
      currentKey: patient.phase,
      phases: [
        {
          key: "phase-intake",
          title: "Evaluation",
          description: "Baseline assessment and education.",
          order: 0,
          status: "done",
          startedAt: dateAt("2026-03-30", 9),
          completedAt: dateAt("2026-04-02", 9),
        },
        {
          key: patient.phase,
          title: patient.context,
          description: "Current conservative rehab focus.",
          order: 1,
          status: "current",
          startedAt: dateAt("2026-04-06", 9),
        },
        {
          key: "phase-maintenance",
          title: "Maintenance planning",
          description: "Progressive return-to-activity planning.",
          order: 2,
          status: "locked",
        },
      ],
      updatedAt: dateAt("2026-04-13", 9),
      updatedBy: {
        clinicianId: CLINICIAN_ID,
        name: CLINICIAN_NAME,
      },
    },
  }));
}

function buildDailyRecords() {
  const checkIns = [];
  const hydrationLogs = [];
  const nutritionLogs = [];
  const wearableDailies = [];

  for (const [patientIndex, patient] of PRESENTATION_PATIENTS.entries()) {
    for (const [dateIndex, date] of seedDates.entries()) {
      const pain = Math.min(10, Math.max(0, patient.painBase + ((dateIndex + patientIndex) % 3) - 1));
      checkIns.push({
        patientId: patient.patientId,
        date,
        mood: Math.max(2, 5 - (pain >= 6 ? 2 : 1)),
        pain,
        adherence: {
          exercises: dateIndex % 5 === 0 ? 0.5 : 0.9,
          medication: dateIndex % 6 !== 0,
          medicationStatus: dateIndex % 6 === 0 ? "missed" : "taken",
        },
        recovery: {
          difficultyLevel: pain >= 6 ? 4 : 2,
          confidenceLevel: pain >= 6 ? 2 : 4,
          mobilityLevel: Math.min(5, 2 + (dateIndex % 4)),
        },
        sleep: {
          hours: pain >= 6 ? 5.8 : 7.1,
          quality: pain >= 6 ? 2 : 4,
          disturbances: pain >= 6 ? 2 : 0,
        },
        support: {
          stressLevel: pain >= 6 ? 4 : 2,
          feelsSafe: true,
          wantsFollowUp: pain >= 7,
          wantsExtraSupport: pain >= 7,
          needsUrgentHelp: false,
        },
        dailySignals: {
          hydrationLevel: dateIndex % 4 === 0 ? 2 : 4,
          energyLevel: pain >= 6 ? 2 : 4,
        },
        notes:
          pain >= 7
            ? "More symptoms after activity; no urgent red flags reported."
            : "Completed planned activity with expected soreness.",
        risk:
          pain >= 7
            ? { level: "high", reasons: ["PAIN_GE_THRESHOLD"] }
            : { level: "low", reasons: [] },
        demoTag: PRESENTATION_DEMO_TAG,
      });

      hydrationLogs.push({
        patientId: patient.patientId,
        date,
        amountMl: 1600 + ((dateIndex + patientIndex) % 5) * 250,
        clientMutationId: `${patient.patientId}-hydration-${date}`,
        source: "manual",
        demoTag: PRESENTATION_DEMO_TAG,
      });

      nutritionLogs.push({
        patientId: patient.patientId,
        date,
        protein: dateIndex % 3 === 0 ? "low" : "ok",
        fruitVegServings: 2 + ((dateIndex + patientIndex) % 4),
        antiInflammatoryFocus: dateIndex % 2 === 0,
        mealRegularity: dateIndex % 4 === 0 ? "mostly" : "regular",
        appetite: pain >= 7 ? "low" : "normal",
        clientMutationId: `${patient.patientId}-nutrition-${date}`,
        source: "manual",
        demoTag: PRESENTATION_DEMO_TAG,
      });

      wearableDailies.push({
        patientId: patient.patientId,
        source: "mock",
        date,
        steps: 2200 + dateIndex * 180 + patientIndex * 90,
        activeMinutes: 18 + (dateIndex % 6) * 4,
        restingHr: 62 + ((dateIndex + patientIndex) % 8),
        demoTag: PRESENTATION_DEMO_TAG,
      });
    }
  }

  return { checkIns, hydrationLogs, nutritionLogs, wearableDailies };
}

function buildExercisePlans() {
  return PRESENTATION_PATIENTS.map((patient) => ({
    patientId: patient.patientId,
    title: `${patient.context} plan`,
    timezone: "America/New_York",
    daysOfWeek: [1, 3, 5],
    version: 1,
    updatedBy: {
      clinicianId: CLINICIAN_ID,
      name: CLINICIAN_NAME,
    },
    items: [
      {
        key: `${patient.patientId}-mobility`,
        name: "Guided mobility set",
        instructions: "Move within a comfortable range and stop for sharp pain.",
        sets: 2,
        reps: 8,
        restSeconds: 45,
        intensity: "easy",
        order: 0,
      },
      {
        key: `${patient.patientId}-strength`,
        name: "Supported strength drill",
        instructions: "Use support as needed and keep effort conversational.",
        sets: 3,
        reps: 6,
        restSeconds: 60,
        intensity: "moderate",
        order: 1,
      },
    ],
    demoTag: PRESENTATION_DEMO_TAG,
  }));
}

function buildProms() {
  return PRESENTATION_PATIENTS.flatMap((patient, index) => [
    {
      patientId: patient.patientId,
      templateKey: "AURA_PRESENTATION_RECOVERY_2",
      templateVersion: 1,
      titleSnapshot: "Recovery check",
      questionsSnapshot: promQuestions,
      dueAt: dateAt("2026-04-18", 12),
      status: "due",
      demoTag: PRESENTATION_DEMO_TAG,
    },
    {
      patientId: patient.patientId,
      templateKey: "AURA_PRESENTATION_RECOVERY_2",
      templateVersion: 1,
      titleSnapshot: "Recovery check",
      questionsSnapshot: promQuestions,
      dueAt: dateAt("2026-04-11", 12),
      status: "completed",
      completedAt: dateAt("2026-04-11", 18),
      answers: [
        { questionId: "pain", value: patient.painBase },
        { questionId: "confidence", value: Math.max(3, 8 - index) },
      ],
      score: {
        raw: 12 - patient.painBase,
        normalized: Math.max(30, 85 - patient.painBase * 7),
        bandKey: patient.painBase >= 6 ? "amber" : "green",
        bandLabel: patient.painBase >= 6 ? "Monitor" : "On track",
      },
      demoTag: PRESENTATION_DEMO_TAG,
    },
  ]);
}

async function insertPresentationData(): Promise<PresentationCounts> {
  const patients = await Patient.insertMany(buildPatientRecords());
  const dailyRecords = buildDailyRecords();
  const [checkIns, hydrationLogs, nutritionLogs, wearableDailies] = await Promise.all([
    CheckIn.insertMany(dailyRecords.checkIns),
    HydrationLog.insertMany(dailyRecords.hydrationLogs),
    NutritionLog.insertMany(dailyRecords.nutritionLogs),
    WearableDaily.insertMany(dailyRecords.wearableDailies),
  ]);

  const medications = await Medication.insertMany(
    PRESENTATION_PATIENTS.map((patient) => ({
      patientId: patient.patientId,
      name: "Care-team reviewed medication",
      type: "medication",
      instructions: "Follow the existing care plan from the treating clinician.",
      active: true,
      demoTag: PRESENTATION_DEMO_TAG,
    }))
  );

  const medicationSchedules = await MedicationSchedule.insertMany(
    medications.map((medication) => ({
      patientId: medication.patientId,
      medicationId: medication._id,
      times: ["08:00"],
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      startDate: "2026-04-01",
      demoTag: PRESENTATION_DEMO_TAG,
    }))
  );

  const medicationLogs = await MedicationLog.insertMany(
    medications.flatMap((medication, index) =>
      seedDates.slice(7).map((date, dateIndex) => ({
        patientId: medication.patientId,
        medicationId: medication._id,
        date,
        time: "08:00",
        status: (dateIndex + index) % 6 === 0 ? "skipped" : "taken",
        source: "manual",
        demoTag: PRESENTATION_DEMO_TAG,
      }))
    )
  );

  const exercisePlans = await ExercisePlan.insertMany(buildExercisePlans());
  const exerciseSessions = await ExerciseSession.insertMany(
    PRESENTATION_PATIENTS.flatMap((patient, patientIndex) =>
      ["2026-04-14", "2026-04-17"].map((date, sessionIndex) => ({
        patientId: patient.patientId,
        planPatientId: patient.patientId,
        planVersion: 1,
        planTitle: `${patient.context} plan`,
        planDayOfWeek: sessionIndex === 0 ? 2 : 5,
        startedAt: dateAt(date, 10 + sessionIndex),
        endedAt: dateAt(date, 11 + sessionIndex),
        durationSeconds: 1600 + patientIndex * 30,
        status: "completed",
        exercises: [
          {
            itemKey: `${patient.patientId}-mobility`,
            nameSnapshot: "Guided mobility set",
            order: 0,
            planned: { sets: 2, reps: 8, restSeconds: 45 },
            completed: true,
            setsDone: 2,
            repsDone: 8,
            difficulty: patient.painBase >= 6 ? "hard" : "ok",
            painDuring: Math.min(5, Math.max(1, patient.painBase - 2)),
            completedAt: dateAt(date, 10 + sessionIndex),
          },
        ],
        demoTag: PRESENTATION_DEMO_TAG,
      }))
    )
  );

  const promInstances = await PromInstance.insertMany(buildProms());
  const chatMessages = await ChatMessage.insertMany(
    PRESENTATION_PATIENTS.flatMap((patient, index) => [
      {
        patientId: patient.patientId,
        role: "user",
        text:
          patient.painBase >= 6
            ? "Symptoms are higher after yesterday's activity. I can still walk and do not need urgent help."
            : "Home exercises went well today with mild soreness only.",
        risk:
          patient.painBase >= 6
            ? { level: "high", reasons: ["PATIENT_REQUESTS_FOLLOW_UP"] }
            : { level: "low", reasons: [] },
        createdAt: dateAt("2026-04-18", 9 + index),
        demoTag: PRESENTATION_DEMO_TAG,
      },
      {
        patientId: patient.patientId,
        role: "assistant",
        text: "Thanks for the update. Your clinician can review this in the care workspace.",
        risk: { level: "low", reasons: [] },
        createdAt: dateAt("2026-04-18", 10 + index),
        demoTag: PRESENTATION_DEMO_TAG,
      },
    ])
  );

  const alertSources = [
    { patient: PRESENTATION_PATIENTS[2], reason: "PAIN_GE_THRESHOLD", sourceDoc: checkIns[40] },
    { patient: PRESENTATION_PATIENTS[6], reason: "PATIENT_REQUESTS_FOLLOW_UP", sourceDoc: chatMessages[12] },
    { patient: PRESENTATION_PATIENTS[1], reason: "ADHERENCE_DROP", sourceDoc: checkIns[20] },
    { patient: PRESENTATION_PATIENTS[0], reason: "BALANCE_CONFIDENCE_DROP", sourceDoc: checkIns[8] },
  ];
  const alerts = await Alert.insertMany(
    alertSources.map((item, index) => ({
      patientId: item.patient.patientId,
      reason: item.reason,
      source: {
        type: index === 1 ? "chat" : "checkin",
        sourceId: String(item.sourceDoc?._id),
      },
      status: index === 3 ? "acknowledged" : "open",
      acknowledgedAt: index === 3 ? dateAt("2026-04-18", 13) : undefined,
      riskAuto: index === 3 ? "medium" : "high",
      riskFinal: index === 3 ? "medium" : "high",
      assignedTo: index === 0 ? CLINICIAN_ID : undefined,
      assignedToName: index === 0 ? CLINICIAN_NAME : undefined,
      assignedAt: index === 0 ? dateAt("2026-04-18", 13) : undefined,
      notification: { channel: "telegram", status: "sent", retryCount: 0 },
      demoTag: PRESENTATION_DEMO_TAG,
    }))
  );

  const careEvents = await CareEvent.insertMany(
    alerts.flatMap((alert) => [
      {
        patientId: alert.patientId,
        alertId: String(alert._id),
        type: "ALERT_CREATED",
        payload: { seedId: PRESENTATION_SEED_ID },
        demoTag: PRESENTATION_DEMO_TAG,
      },
      {
        patientId: alert.patientId,
        alertId: String(alert._id),
        type: "CLINICIAN_REVIEW_PENDING",
        payload: { note: "Presentation follow-up queue item." },
        demoTag: PRESENTATION_DEMO_TAG,
      },
    ])
  );

  const communicationReviews = await CommunicationReview.insertMany(
    chatMessages
      .filter((message) => message.role === "user")
      .map((message) => ({
        patientId: message.patientId,
        messageId: `presentation-message-${String(message._id)}`,
        source: "chat",
        needsResponse: message.risk?.level === "high",
        flaggedBySafety: false,
        followUpRequested: message.risk?.level === "high",
        linkedTaskId: message.risk?.level === "high" ? `presentation-task-${message.patientId}` : undefined,
        messageCreatedAt: message.createdAt,
        messagePreview: message.text,
        demoTag: PRESENTATION_DEMO_TAG,
      }))
  );

  const communicationEvents = await CommunicationEvent.insertMany(
    communicationReviews.flatMap((review) => [
      {
        patientId: review.patientId,
        threadKey: `presentation-thread-${review.patientId}`,
        channel: "patient_chat",
        messageId: review.messageId,
        eventType: "patient_message_sent",
        actorType: "patient",
        actorId: review.patientId,
        sourceSurface: "presentation-seed",
        sourceRecordId: String(review._id),
        createdAt: review.messageCreatedAt ?? dateAt("2026-04-18", 9),
        demoTag: PRESENTATION_DEMO_TAG,
      },
      {
        patientId: review.patientId,
        threadKey: `presentation-thread-${review.patientId}`,
        channel: "patient_chat",
        messageId: review.messageId,
        eventType: "follow_up_requested",
        actorType: "automation",
        actorId: "presentation-seed",
        sourceSurface: "presentation-seed",
        sourceRecordId: String(review._id),
        createdAt: dateAt("2026-04-18", 18),
        demoTag: PRESENTATION_DEMO_TAG,
      },
    ])
  );

  const tasks = await Task.insertMany(
    PRESENTATION_PATIENTS.map((patient, index) => ({
      patientId: patient.patientId,
      title: index % 2 === 0 ? "Review presentation follow-up" : "Confirm appointment plan",
      description: "Seeded presentation worklist item for clinician review.",
      type: index % 2 === 0 ? "follow_up" : "appointment",
      priority: patient.painBase >= 6 ? "high" : "medium",
      status: index === 7 ? "completed" : "open",
      dueAt: dateAt("2026-04-19", 15),
      assignedTo: CLINICIAN_ID,
      createdBy: "presentation-seed",
      source: {
        type: "presentation-seed",
        entityType: "patient",
        entityId: patient.patientId,
        label: patient.context,
      },
      linkedAlertId: alerts.find((alert) => alert.patientId === patient.patientId)
        ? String(alerts.find((alert) => alert.patientId === patient.patientId)?._id)
        : undefined,
      completedAt: index === 7 ? dateAt("2026-04-18", 16) : undefined,
      demoTag: PRESENTATION_DEMO_TAG,
    }))
  );

  const insightSuggestions = await InsightSuggestion.insertMany(
    PRESENTATION_PATIENTS.map((patient) => ({
      patientId: patient.patientId,
      windowDays: 14,
      windowStart: dateAt("2026-04-06", 0),
      windowEnd: dateAt("2026-04-19", 23),
      status: "pending",
      title: patient.painBase >= 6 ? "Review symptom trend" : "Continue current plan",
      message:
        patient.painBase >= 6
          ? "Pain and confidence signals suggest a clinician review before progression."
          : "Recent check-ins support continuing the current conservative progression.",
      category: patient.painBase >= 6 ? "symptoms" : "recovery",
      confidence: "medium",
      priority: patient.painBase >= 6 ? 4 : 2,
      fingerprint: `presentation-insight-${patient.patientId}`,
      evidence: {
        checkinsCount: 14,
        avgPain: patient.painBase,
        avgMood: patient.painBase >= 6 ? 3 : 4,
        highRiskAlertsCount: patient.painBase >= 6 ? 1 : 0,
        sessionsCount: 2,
        promsDueNow: 1,
      },
      demoTag: PRESENTATION_DEMO_TAG,
    }))
  );

  const clinicianCoordinations = await ClinicianCoordination.insertMany(
    PRESENTATION_PATIENTS.map((patient, index) => ({
      patientId: patient.patientId,
      currentHandoff: {
        summary: `${patient.context}; presentation handoff for care-team review.`,
        nextStep: index % 3 === 0 ? "appointments" : "monitoring",
        followUpOwner: {
          kind: "clinician",
          clinicianId: CLINICIAN_ID,
          displayName: CLINICIAN_NAME,
        },
        linkedTaskId: `presentation-task-${patient.patientId}`,
        updatedBy: {
          clinicianId: CLINICIAN_ID,
          displayName: CLINICIAN_NAME,
        },
        updatedAt: dateAt("2026-04-18", 14),
      },
      noteHistory: [
        {
          id: `presentation-note-${patient.patientId}`,
          text: "Seeded presentation handoff note.",
          createdBy: {
            clinicianId: CLINICIAN_ID,
            displayName: CLINICIAN_NAME,
          },
          createdAt: dateAt("2026-04-18", 14),
        },
      ],
      demoTag: PRESENTATION_DEMO_TAG,
    }))
  );

  const appointmentSlots = await AppointmentSlot.insertMany(buildAppointmentSlots());
  const appointmentRequests = await AppointmentRequest.insertMany(
    PRESENTATION_PATIENTS.slice(0, 6).map((patient, index) => ({
      slotId: appointmentSlots[index]._id,
      patientId: patient.patientId,
      status: index % 3 === 0 ? "approved" : "pending",
      note: "Presentation request for scheduling review.",
      reviewedBy:
        index % 3 === 0
          ? { clinicianId: CLINICIAN_ID, name: CLINICIAN_NAME }
          : undefined,
      reviewedAt: index % 3 === 0 ? dateAt("2026-04-12", 12) : undefined,
      demoTag: PRESENTATION_DEMO_TAG,
    }))
  );

  const thresholdConfigs = await PatientThresholdConfig.insertMany(
    PRESENTATION_PATIENTS.map((patient) => ({
      patientId: patient.patientId,
      painHighThreshold: patient.painBase >= 6 ? 6 : 7,
      missedCheckinDays: 2,
      responseDelayHours: 24,
      safetyFlaggedResponseDelayHours: 8,
      rationale: "Presentation seed threshold config.",
      version: 1,
      updatedBy: {
        clinicianId: CLINICIAN_ID,
        name: CLINICIAN_NAME,
      },
      demoTag: PRESENTATION_DEMO_TAG,
    }))
  );

  const recoverySupportConfigs = await PatientRecoverySupportConfig.insertMany(
    PRESENTATION_PATIENTS.map((patient) => ({
      patientId: patient.patientId,
      checkinMode: patient.painBase >= 6 ? "adaptive" : "standard",
      nudgesEnabled: true,
      rationale: "Presentation seed recovery support config.",
      version: 1,
      updatedBy: {
        clinicianId: CLINICIAN_ID,
        name: CLINICIAN_NAME,
      },
      demoTag: PRESENTATION_DEMO_TAG,
    }))
  );

  return {
    patients: patients.length,
    checkIns: checkIns.length,
    hydrationLogs: hydrationLogs.length,
    nutritionLogs: nutritionLogs.length,
    wearableDailies: wearableDailies.length,
    medications: medications.length,
    medicationSchedules: medicationSchedules.length,
    medicationLogs: medicationLogs.length,
    exercisePlans: exercisePlans.length,
    exerciseSessions: exerciseSessions.length,
    promInstances: promInstances.length,
    chatMessages: chatMessages.length,
    alerts: alerts.length,
    careEvents: careEvents.length,
    communicationReviews: communicationReviews.length,
    communicationEvents: communicationEvents.length,
    clinicianCoordinations: clinicianCoordinations.length,
    tasks: tasks.length,
    insightSuggestions: insightSuggestions.length,
    appointmentSlots: appointmentSlots.length,
    appointmentRequests: appointmentRequests.length,
    thresholdConfigs: thresholdConfigs.length,
    recoverySupportConfigs: recoverySupportConfigs.length,
  };
}

export async function loadPresentationSeed() {
  assertPresentationSeedEnabled();
  await preflightPresentationSeedCollisions();
  const deleted = await resetPresentationSeedRecords();
  const counts = await insertPresentationData();

  return {
    enabled: true,
    loaded: true,
    seedId: PRESENTATION_SEED_ID,
    counts,
    deleted,
    lastLoadedAt: new Date().toISOString(),
  };
}

export async function resetPresentationSeed() {
  assertPresentationSeedEnabled();
  const deleted = await resetPresentationSeedRecords();
  const counts = await countPresentationRecords();

  return {
    enabled: true,
    loaded: false,
    seedId: PRESENTATION_SEED_ID,
    counts,
    deleted,
    lastLoadedAt: null,
  };
}
