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
const LEGACY_SEED_START = new Date(Date.UTC(2026, 3, 6));
const DAY_MS = 24 * 60 * 60 * 1000;
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

const PRESENTATION_COMMUNICATION_PRESSURE_MESSAGES = new Map<string, string>([
  [
    "presentation-maria-gonzalez",
    "Symptoms are higher after yesterday's activity. I can still walk and do not need urgent help.",
  ],
  [
    "presentation-emily-lee",
    "Neck pain flared overnight and I would like a clinician to review before I continue exercises.",
  ],
]);

type PresentationSeedTimeline = {
  seedDates: string[];
  rehabIntakeStartedAt: Date;
  rehabIntakeCompletedAt: Date;
  rehabStartedAt: Date;
  rehabUpdatedAt: Date;
  medicationStartDate: string;
  exerciseSessionDates: string[];
  promDueAt: Date;
  promCompletedAt: Date;
  chatMessageDate: string;
  alertAcknowledgedAt: Date;
  taskDueAt: Date;
  taskCompletedAt: Date;
  insightWindowStart: Date;
  insightWindowEnd: Date;
  coordinationUpdatedAt: Date;
  appointmentSlots: Array<{ date: string; hour: number }>;
  appointmentReviewedAt: Date;
};

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
type PresentationSeedMetadata = {
  firstPatientId: string | null;
  patientIds: string[];
  healthDateRange: { start: string; end: string } | null;
  appointmentDateRange: { start: string; end: string } | null;
};
type CountableModel = {
  countDocuments(filter: Record<string, unknown>): Promise<number>;
};
export type PresentationSeedClinicianContext = {
  clinicianId?: string;
  clinicianName?: string;
};
type PresentationSeedCollisionDetail = {
  collection: string;
  count: number;
  ids: string[];
  reason: string;
  safeToAutoClean: boolean;
  records?: Array<Record<string, unknown>>;
  recommendedCleanup?: string;
};

export class PresentationSeedDisabledError extends Error {
  constructor() {
    super("Presentation seed is disabled");
  }
}

export class PresentationSeedCollisionError extends Error {
  collisions: string[];
  details: PresentationSeedCollisionDetail[];

  constructor(
    collisions: string[],
    details: PresentationSeedCollisionDetail[] = []
  ) {
    super("Presentation seed collision detected");
    this.collisions = collisions;
    this.details = details;
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

function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function utcDateAt(date: Date, hour: number): Date {
  return dateAt(dateKey(date), hour);
}

function dateAt(date: string, hour: number): Date {
  return new Date(`${date}T${String(hour).padStart(2, "0")}:00:00.000Z`);
}

function buildPresentationSeedTimeline(anchorInput = new Date()): PresentationSeedTimeline {
  const anchor = new Date(anchorInput);
  anchor.setUTCHours(0, 0, 0, 0);
  const seedStart = addUtcDays(anchor, -13);
  const seedDates = Array.from({ length: 14 }, (_, index) =>
    dateKey(addUtcDays(seedStart, index))
  );

  return {
    seedDates,
    rehabIntakeStartedAt: utcDateAt(addUtcDays(anchor, -20), 9),
    rehabIntakeCompletedAt: utcDateAt(addUtcDays(anchor, -17), 9),
    rehabStartedAt: utcDateAt(seedStart, 9),
    rehabUpdatedAt: utcDateAt(addUtcDays(anchor, -6), 9),
    medicationStartDate: dateKey(addUtcDays(anchor, -18)),
    exerciseSessionDates: [dateKey(addUtcDays(anchor, -5)), dateKey(addUtcDays(anchor, -2))],
    promDueAt: utcDateAt(addUtcDays(anchor, 1), 12),
    promCompletedAt: utcDateAt(addUtcDays(anchor, -6), 18),
    chatMessageDate: dateKey(addUtcDays(anchor, -1)),
    alertAcknowledgedAt: utcDateAt(addUtcDays(anchor, -1), 13),
    taskDueAt: utcDateAt(anchor, 15),
    taskCompletedAt: utcDateAt(addUtcDays(anchor, -1), 16),
    insightWindowStart: dateAt(seedDates[0], 0),
    insightWindowEnd: new Date(`${seedDates[seedDates.length - 1]}T23:00:00.000Z`),
    coordinationUpdatedAt: utcDateAt(addUtcDays(anchor, -1), 14),
    appointmentSlots: [
      { date: dateKey(anchor), hour: 14 },
      { date: dateKey(addUtcDays(anchor, 1)), hour: 15 },
      { date: dateKey(addUtcDays(anchor, 2)), hour: 13 },
      { date: dateKey(addUtcDays(anchor, 2)), hour: 16 },
      { date: dateKey(addUtcDays(anchor, 3)), hour: 14 },
      { date: dateKey(addUtcDays(anchor, 4)), hour: 10 },
      { date: dateKey(addUtcDays(anchor, 4)), hour: 15 },
      { date: dateKey(addUtcDays(anchor, 5)), hour: 9 },
      { date: dateKey(addUtcDays(anchor, 5)), hour: 11 },
      { date: dateKey(addUtcDays(anchor, 6)), hour: 10 },
    ],
    appointmentReviewedAt: utcDateAt(anchor, 12),
  };
}

function buildLegacyPresentationSeedTimeline(): PresentationSeedTimeline {
  const legacy = buildPresentationSeedTimeline(addUtcDays(LEGACY_SEED_START, 13));
  return {
    ...legacy,
    appointmentSlots: [
      { date: "2026-04-27", hour: 14 },
      { date: "2026-04-28", hour: 15 },
      { date: "2026-04-29", hour: 13 },
      { date: "2026-04-29", hour: 16 },
      { date: "2026-04-30", hour: 14 },
      { date: "2026-05-01", hour: 10 },
      { date: "2026-05-01", hour: 15 },
      { date: "2026-05-02", hour: 9 },
      { date: "2026-05-02", hour: 11 },
      { date: "2026-05-03", hour: 10 },
    ],
    appointmentReviewedAt: dateAt("2026-04-12", 12),
  };
}

function resolveSeedClinician(
  context?: PresentationSeedClinicianContext
): { clinicianId: string; clinicianName: string } {
  return {
    clinicianId: context?.clinicianId?.trim() || CLINICIAN_ID,
    clinicianName: context?.clinicianName?.trim() || CLINICIAN_NAME,
  };
}

function appointmentSlotCleanupContexts(
  context?: PresentationSeedClinicianContext
): Array<PresentationSeedClinicianContext | undefined> {
  const seedClinician = resolveSeedClinician(context);
  if (seedClinician.clinicianId === CLINICIAN_ID) {
    return [context];
  }

  return [context, undefined];
}

function isTaggedQuery() {
  return { demoTag: PRESENTATION_DEMO_TAG };
}

function presentationPatientQuery() {
  return {
    $or: [
      isTaggedQuery(),
      { patientId: { $in: presentationPatientIds() } },
    ],
  };
}

function presentationAppointmentSlotQuery() {
  return {
    $or: [
      isTaggedQuery(),
      {
        meetingLink: /^https:\/\/meet\.example\.com\/presentation-\d+$/,
      },
    ],
  };
}

function presentationCommunicationEventResetQuery() {
  return {
    $or: [
      isTaggedQuery(),
      {
        patientId: { $in: presentationPatientIds() },
        sourceSurface: "presentation-seed",
      },
      {
        patientId: { $in: presentationPatientIds() },
        threadKey: /^patient_chat:presentation-/,
        channel: "patient_chat",
        eventType: "thread_opened",
        actorType: "clinician",
        sourceSurface: {
          $in: ["communication_inbox", "patient_detail_communication_panel"],
        },
      },
    ],
  };
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

async function getPresentationSeedMetadata(): Promise<PresentationSeedMetadata | null> {
  const tag = isTaggedQuery();
  const [patientRecords, healthBounds, appointmentBounds] = await Promise.all([
    Patient.find(tag).select("patientId").lean(),
    CheckIn.aggregate<{ _id: null; start: string; end: string }>([
      { $match: tag },
      { $group: { _id: null, start: { $min: "$date" }, end: { $max: "$date" } } },
    ]),
    AppointmentSlot.aggregate<{ _id: null; start: Date; end: Date }>([
      { $match: tag },
      { $group: { _id: null, start: { $min: "$startsAt" }, end: { $max: "$endsAt" } } },
    ]),
  ]);
  const loadedPatientIds = new Set(
    patientRecords
      .map((patient) => patient.patientId)
      .filter((patientId): patientId is string => typeof patientId === "string")
  );
  const patientIds = presentationPatientIds().filter((patientId) =>
    loadedPatientIds.has(patientId)
  );

  if (patientIds.length === 0) {
    return null;
  }

  const appointmentRange = appointmentBounds[0];

  return {
    firstPatientId: patientIds[0] ?? null,
    patientIds,
    healthDateRange: healthBounds[0]
      ? { start: healthBounds[0].start, end: healthBounds[0].end }
      : null,
    appointmentDateRange: appointmentRange
      ? {
          start: appointmentRange.start.toISOString().slice(0, 10),
          end: appointmentRange.end.toISOString().slice(0, 10),
        }
      : null,
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
      metadata: null,
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
    metadata: loaded ? await getPresentationSeedMetadata() : null,
  };
}

async function preflightPresentationSeedCollisions(
  context?: PresentationSeedClinicianContext
): Promise<void> {
  await retagLegacyPresentationCommunicationEvents(context);

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

  if (collisions.length > 0) {
    throw new PresentationSeedCollisionError(collisions);
  }

  const communicationEventCollisionDetail =
    await getUnsafeCommunicationEventCollisionDetail(context);
  if (communicationEventCollisionDetail) {
    collisions.push(`communicationEvents:${communicationEventCollisionDetail.count}`);
  }

  await retagLegacyPresentationAppointmentSlots(context);

  const slotCollisionDetail = await getUnsafeAppointmentSlotCollisionDetail(context);
  if (slotCollisionDetail) {
    collisions.push(`appointmentSlots:${slotCollisionDetail.count}`);
  }

  if (collisions.length > 0) {
    throw new PresentationSeedCollisionError(
      collisions,
      [
        communicationEventCollisionDetail,
        slotCollisionDetail,
      ].filter((detail): detail is PresentationSeedCollisionDetail => Boolean(detail))
    );
  }
}

function buildCommunicationEventManifest(
  timeline: PresentationSeedTimeline = buildPresentationSeedTimeline()
) {
  return PRESENTATION_PATIENTS.flatMap((patient, index) => [
    {
      patientId: patient.patientId,
      threadKey: `presentation-thread-${patient.patientId}`,
      channel: "patient_chat",
      eventType: "patient_message_sent",
      actorType: "patient",
      actorId: patient.patientId,
      sourceSurface: "presentation-seed",
      createdAt: dateAt(timeline.chatMessageDate, 9 + index),
    },
    {
      patientId: patient.patientId,
      threadKey: `presentation-thread-${patient.patientId}`,
      channel: "patient_chat",
      eventType: "follow_up_requested",
      actorType: "automation",
      actorId: "presentation-seed",
      sourceSurface: "presentation-seed",
      createdAt: dateAt(timeline.chatMessageDate, 18),
    },
  ]);
}

function buildCommunicationEventManifests() {
  return [
    ...buildCommunicationEventManifest(),
    ...buildCommunicationEventManifest(buildLegacyPresentationSeedTimeline()),
  ];
}

function communicationEventManifestKey(event: {
  patientId: string;
  eventType: string;
  createdAt: Date;
}): string {
  return `${event.patientId}|${event.eventType}|${event.createdAt.toISOString()}`;
}

function isObjectIdString(value: unknown): boolean {
  return typeof value === "string" && /^[a-f\d]{24}$/i.test(value);
}

function matchesCommunicationEventManifest(
  event: Record<string, unknown>,
  manifestEvent: ReturnType<typeof buildCommunicationEventManifest>[number]
): boolean {
  const createdAt = event.createdAt instanceof Date ? event.createdAt : null;
  const messageId = typeof event.messageId === "string" ? event.messageId : "";
  const messageRecordId = messageId.replace("presentation-message-", "");

  return (
    event.patientId === manifestEvent.patientId &&
    event.threadKey === manifestEvent.threadKey &&
    event.channel === manifestEvent.channel &&
    event.eventType === manifestEvent.eventType &&
    event.actorType === manifestEvent.actorType &&
    event.actorId === manifestEvent.actorId &&
    event.sourceSurface === manifestEvent.sourceSurface &&
    createdAt?.toISOString() === manifestEvent.createdAt.toISOString() &&
    messageId.startsWith("presentation-message-") &&
    isObjectIdString(messageRecordId) &&
    isObjectIdString(event.sourceRecordId)
  );
}

function matchesPresentationInteractionCommunicationEvent(event: Record<string, unknown>): boolean {
  const patientId = typeof event.patientId === "string" ? event.patientId : "";
  const presentationInteractionSurfaces = new Set([
    "communication_inbox",
    "patient_detail_communication_panel",
  ]);

  return (
    presentationPatientIds().includes(patientId) &&
    event.threadKey === `patient_chat:${patientId}` &&
    event.channel === "patient_chat" &&
    event.eventType === "thread_opened" &&
    event.actorType === "clinician" &&
    typeof event.sourceSurface === "string" &&
    presentationInteractionSurfaces.has(event.sourceSurface) &&
    event.createdAt instanceof Date
  );
}

function communicationEventDiagnostic(event: Record<string, unknown>) {
  const createdAt = event.createdAt instanceof Date ? event.createdAt.toISOString() : null;
  const idValue =
    event._id && typeof (event._id as { toString?: unknown }).toString === "function"
      ? (event._id as { toString(): string }).toString()
      : String(event._id ?? "");

  return {
    id: idValue,
    patientId: event.patientId,
    threadKey: event.threadKey,
    eventType: event.eventType,
    actorType: event.actorType,
    actorId: event.actorId,
    sourceSurface: event.sourceSurface,
    createdAt,
    demoTag: event.demoTag ?? null,
  };
}

async function findUntaggedPresentationCommunicationEventCollisions() {
  return CommunicationEvent.find({
    patientId: { $in: presentationPatientIds() },
    ...untaggedQuery(),
  })
    .select(
      "_id patientId threadKey channel messageId eventType actorType actorId sourceSurface sourceRecordId createdAt demoTag"
    )
    .lean();
}

async function retagLegacyPresentationCommunicationEvents(
  context?: PresentationSeedClinicianContext
): Promise<void> {
  const manifestByKey = new Map(
    buildCommunicationEventManifests().map((event) => [
      communicationEventManifestKey(event),
      event,
    ])
  );
  const collisions = await findUntaggedPresentationCommunicationEventCollisions();
  const safeIds = collisions
    .filter((event) => {
      const createdAt = event.createdAt instanceof Date ? event.createdAt : null;
      const manifestEvent = createdAt
        ? manifestByKey.get(`${event.patientId}|${event.eventType}|${createdAt.toISOString()}`)
        : null;

      return (
        (manifestEvent ? matchesCommunicationEventManifest(event, manifestEvent) : false) ||
        matchesPresentationInteractionCommunicationEvent(event)
      );
    })
    .map((event) => event._id);

  if (safeIds.length === 0) {
    return;
  }

  await CommunicationEvent.updateMany(
    { _id: { $in: safeIds } },
    { $set: { demoTag: PRESENTATION_DEMO_TAG } }
  );
}

async function getUnsafeCommunicationEventCollisionDetail(
  context?: PresentationSeedClinicianContext
): Promise<PresentationSeedCollisionDetail | null> {
  const manifestByKey = new Map(
    buildCommunicationEventManifests().map((event) => [
      communicationEventManifestKey(event),
      event,
    ])
  );
  const collisions = await findUntaggedPresentationCommunicationEventCollisions();
  const unsafeRecords = collisions
    .filter((event) => {
      const createdAt = event.createdAt instanceof Date ? event.createdAt : null;
      const manifestEvent = createdAt
        ? manifestByKey.get(`${event.patientId}|${event.eventType}|${createdAt.toISOString()}`)
        : null;

      const matchesSeedManifest = manifestEvent
        ? matchesCommunicationEventManifest(event, manifestEvent)
        : false;

      return (
        !matchesSeedManifest &&
        !matchesPresentationInteractionCommunicationEvent(event)
      );
    })
    .map(communicationEventDiagnostic);

  if (unsafeRecords.length === 0) {
    return null;
  }

  return {
    collection: "communicationEvents",
    count: unsafeRecords.length,
    ids: unsafeRecords.map((record) => String(record.id)),
    reason: "untagged records use reserved presentation communication event patients without matching the deterministic presentation event manifest",
    safeToAutoClean: false,
    records: unsafeRecords,
    recommendedCleanup:
      "Inspect these local CommunicationEvent records. No automatic cleanup was applied because they do not exactly match the deterministic presentation seed event manifest.",
  };
}

function appointmentSlotManifestKey(slot: {
  clinicianId: string;
  startsAt: Date;
}): string {
  return `${slot.clinicianId}|${slot.startsAt.toISOString()}`;
}

function matchesAppointmentSlotManifest(
  slot: Record<string, unknown>,
  manifestSlot: ReturnType<typeof buildAppointmentSlots>[number]
): boolean {
  const startsAt = slot.startsAt instanceof Date ? slot.startsAt : null;
  const endsAt = slot.endsAt instanceof Date ? slot.endsAt : null;

  return (
    slot.clinicianId === manifestSlot.clinicianId &&
    startsAt?.toISOString() === manifestSlot.startsAt.toISOString() &&
    endsAt?.toISOString() === manifestSlot.endsAt.toISOString() &&
    slot.modality === manifestSlot.modality &&
    slot.status === manifestSlot.status &&
    slot.meetingLink === manifestSlot.meetingLink
  );
}

function appointmentSlotDiagnostic(slot: Record<string, unknown>) {
  const startsAt = slot.startsAt instanceof Date ? slot.startsAt.toISOString() : null;
  const endsAt = slot.endsAt instanceof Date ? slot.endsAt.toISOString() : null;
  const idValue =
    slot._id && typeof (slot._id as { toString?: unknown }).toString === "function"
      ? (slot._id as { toString(): string }).toString()
      : String(slot._id ?? "");

  return {
    id: idValue,
    clinicianId: slot.clinicianId,
    startsAt,
    endsAt,
    modality: slot.modality,
    status: slot.status,
    meetingLink: slot.meetingLink,
    demoTag: slot.demoTag ?? null,
  };
}

async function findUntaggedPresentationSlotCollisions(
  context?: PresentationSeedClinicianContext
) {
  const slotWindows = buildAppointmentSlotManifests(context).map((slot) => ({
    clinicianId: slot.clinicianId,
    startsAt: slot.startsAt,
  }));

  return AppointmentSlot.find({
    $and: [{ $or: slotWindows }, untaggedQuery()],
  })
    .select("_id clinicianId startsAt endsAt modality status meetingLink demoTag")
    .lean();
}

async function retagLegacyPresentationAppointmentSlots(
  context?: PresentationSeedClinicianContext
): Promise<void> {
  const manifestByKey = new Map(
    buildAppointmentSlotManifests(context).map((slot) => [appointmentSlotManifestKey(slot), slot])
  );
  const collisions = await findUntaggedPresentationSlotCollisions(context);
  const safeIds = collisions
    .filter((slot) => {
      const startsAt = slot.startsAt instanceof Date ? slot.startsAt : null;
      const manifestSlot = startsAt
        ? manifestByKey.get(`${slot.clinicianId}|${startsAt.toISOString()}`)
        : null;

      return manifestSlot ? matchesAppointmentSlotManifest(slot, manifestSlot) : false;
    })
    .map((slot) => slot._id);

  if (safeIds.length === 0) {
    return;
  }

  await AppointmentSlot.updateMany(
    { _id: { $in: safeIds } },
    { $set: { demoTag: PRESENTATION_DEMO_TAG } }
  );
}

async function getUnsafeAppointmentSlotCollisionDetail(
  context?: PresentationSeedClinicianContext
): Promise<PresentationSeedCollisionDetail | null> {
  const manifestByKey = new Map(
    buildAppointmentSlotManifests(context).map((slot) => [appointmentSlotManifestKey(slot), slot])
  );
  const collisions = await findUntaggedPresentationSlotCollisions(context);
  const unsafeRecords = collisions
    .filter((slot) => {
      const startsAt = slot.startsAt instanceof Date ? slot.startsAt : null;
      const manifestSlot = startsAt
        ? manifestByKey.get(`${slot.clinicianId}|${startsAt.toISOString()}`)
        : null;

      return !manifestSlot || !matchesAppointmentSlotManifest(slot, manifestSlot);
    })
    .map(appointmentSlotDiagnostic);

  if (unsafeRecords.length === 0) {
    return null;
  }

  return {
    collection: "appointmentSlots",
    count: unsafeRecords.length,
    ids: unsafeRecords.map((record) => String(record.id)),
    reason: "untagged records collide with deterministic presentation appointment slots",
    safeToAutoClean: false,
    records: unsafeRecords,
    recommendedCleanup:
      "Inspect these local AppointmentSlot records. No automatic cleanup was applied because they do not exactly match the deterministic presentation seed manifest.",
  };
}

async function resetPresentationSeedRecords(
  context?: PresentationSeedClinicianContext
): Promise<PresentationCounts> {
  const tag = isTaggedQuery();
  const patientScopedPresentationQuery = presentationPatientQuery();
  const presentationSlotIds = await AppointmentSlot.find(presentationAppointmentSlotQuery())
    .select("_id")
    .lean();
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
    AppointmentRequest.deleteMany({
      $or: [
        tag,
        { patientId: { $in: presentationPatientIds() } },
        { slotId: { $in: presentationSlotIds.map((slot) => slot._id) } },
      ],
    }),
    AppointmentSlot.deleteMany({
      _id: { $in: presentationSlotIds.map((slot) => slot._id) },
    }),
    InsightSuggestion.deleteMany(patientScopedPresentationQuery),
    Task.deleteMany(patientScopedPresentationQuery),
    ClinicianCoordination.deleteMany(patientScopedPresentationQuery),
    CommunicationEvent.deleteMany(presentationCommunicationEventResetQuery()),
    CommunicationReview.deleteMany(patientScopedPresentationQuery),
    CareEvent.deleteMany(patientScopedPresentationQuery),
    Alert.deleteMany(patientScopedPresentationQuery),
    ChatMessage.deleteMany(patientScopedPresentationQuery),
    PromInstance.deleteMany(patientScopedPresentationQuery),
    ExerciseSession.deleteMany(patientScopedPresentationQuery),
    ExercisePlan.deleteMany(patientScopedPresentationQuery),
    MedicationLog.deleteMany(patientScopedPresentationQuery),
    MedicationSchedule.deleteMany(patientScopedPresentationQuery),
    Medication.deleteMany(patientScopedPresentationQuery),
    WearableDaily.deleteMany(patientScopedPresentationQuery),
    NutritionLog.deleteMany(patientScopedPresentationQuery),
    HydrationLog.deleteMany(patientScopedPresentationQuery),
    CheckIn.deleteMany(patientScopedPresentationQuery),
    PatientThresholdConfig.deleteMany(patientScopedPresentationQuery),
    PatientRecoverySupportConfig.deleteMany(patientScopedPresentationQuery),
    Patient.deleteMany(patientScopedPresentationQuery),
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

function buildAppointmentSlots(
  context?: PresentationSeedClinicianContext,
  timeline: PresentationSeedTimeline = buildPresentationSeedTimeline()
) {
  const seedClinician = resolveSeedClinician(context);
  return timeline.appointmentSlots.map(({ date, hour }, index) => ({
    clinicianId: seedClinician.clinicianId,
    startsAt: dateAt(date, hour),
    endsAt: dateAt(date, hour + 1),
    modality: "video",
    status: index % 3 === 0 ? "closed" : "available",
    meetingLink: `https://meet.example.com/presentation-${index + 1}`,
    demoTag: PRESENTATION_DEMO_TAG,
  }));
}

function buildAppointmentSlotManifests(context?: PresentationSeedClinicianContext) {
  return appointmentSlotCleanupContexts(context).flatMap((cleanupContext) => [
    ...buildAppointmentSlots(cleanupContext),
    ...buildAppointmentSlots(cleanupContext, buildLegacyPresentationSeedTimeline()),
  ]);
}

function buildPatientRecords(seedClinician: ReturnType<typeof resolveSeedClinician>, timeline: PresentationSeedTimeline) {
  return PRESENTATION_PATIENTS.map((patient, index) => ({
    patientId: patient.patientId,
    displayName: patient.displayName,
    accessCode: `presentation-${index + 1}`,
    status: index === 6 ? "on_hold" : "active",
    clinicianId: seedClinician.clinicianId,
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
          startedAt: timeline.rehabIntakeStartedAt,
          completedAt: timeline.rehabIntakeCompletedAt,
        },
        {
          key: patient.phase,
          title: patient.context,
          description: "Current conservative rehab focus.",
          order: 1,
          status: "current",
          startedAt: timeline.rehabStartedAt,
        },
        {
          key: "phase-maintenance",
          title: "Maintenance planning",
          description: "Progressive return-to-activity planning.",
          order: 2,
          status: "locked",
        },
      ],
      updatedAt: timeline.rehabUpdatedAt,
      updatedBy: {
        clinicianId: seedClinician.clinicianId,
        name: seedClinician.clinicianName,
      },
    },
  }));
}

function buildDailyRecords(timeline: PresentationSeedTimeline) {
  const checkIns = [];
  const hydrationLogs = [];
  const nutritionLogs = [];
  const wearableDailies = [];

  for (const [patientIndex, patient] of PRESENTATION_PATIENTS.entries()) {
    for (const [dateIndex, date] of timeline.seedDates.entries()) {
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

function buildExercisePlans(seedClinician: ReturnType<typeof resolveSeedClinician>) {
  return PRESENTATION_PATIENTS.map((patient) => ({
    patientId: patient.patientId,
    title: `${patient.context} plan`,
    timezone: "America/New_York",
    daysOfWeek: [1, 3, 5],
    version: 1,
    updatedBy: {
      clinicianId: seedClinician.clinicianId,
      name: seedClinician.clinicianName,
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

function buildProms(timeline: PresentationSeedTimeline) {
  return PRESENTATION_PATIENTS.flatMap((patient, index) => [
    {
      patientId: patient.patientId,
      templateKey: "AURA_PRESENTATION_RECOVERY_2",
      templateVersion: 1,
      titleSnapshot: "Recovery check",
      questionsSnapshot: promQuestions,
      dueAt: timeline.promDueAt,
      status: "due",
      demoTag: PRESENTATION_DEMO_TAG,
    },
    {
      patientId: patient.patientId,
      templateKey: "AURA_PRESENTATION_RECOVERY_2",
      templateVersion: 1,
      titleSnapshot: "Recovery check",
      questionsSnapshot: promQuestions,
      dueAt: timeline.promCompletedAt,
      status: "completed",
      completedAt: timeline.promCompletedAt,
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

async function insertPresentationData(
  context?: PresentationSeedClinicianContext
): Promise<PresentationCounts> {
  const seedClinician = resolveSeedClinician(context);
  const timeline = buildPresentationSeedTimeline();
  const patients = await Patient.insertMany(buildPatientRecords(seedClinician, timeline));
  const dailyRecords = buildDailyRecords(timeline);
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
      startDate: timeline.medicationStartDate,
      demoTag: PRESENTATION_DEMO_TAG,
    }))
  );

  const medicationLogs = await MedicationLog.insertMany(
    medications.flatMap((medication, index) =>
      timeline.seedDates.slice(7).map((date, dateIndex) => ({
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

  const exercisePlans = await ExercisePlan.insertMany(buildExercisePlans(seedClinician));
  const exerciseSessions = await ExerciseSession.insertMany(
    PRESENTATION_PATIENTS.flatMap((patient, patientIndex) =>
      timeline.exerciseSessionDates.map((date, sessionIndex) => ({
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

  const promInstances = await PromInstance.insertMany(buildProms(timeline));
  const chatMessages = await ChatMessage.insertMany(
    PRESENTATION_PATIENTS.flatMap((patient, index) => [
      {
        patientId: patient.patientId,
        role: "user",
        text:
          PRESENTATION_COMMUNICATION_PRESSURE_MESSAGES.get(patient.patientId) ??
          "Home exercises went well today with mild soreness only.",
        risk:
          PRESENTATION_COMMUNICATION_PRESSURE_MESSAGES.has(patient.patientId)
            ? { level: "high", reasons: ["PATIENT_REQUESTS_FOLLOW_UP"] }
            : { level: "low", reasons: [] },
        createdAt: dateAt(timeline.chatMessageDate, 9 + index),
        demoTag: PRESENTATION_DEMO_TAG,
      },
      {
        patientId: patient.patientId,
        role: "assistant",
        text: "Thanks for the update. Your clinician can review this in the care workspace.",
        risk: { level: "low", reasons: [] },
        createdAt: dateAt(timeline.chatMessageDate, 10 + index),
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
      acknowledgedAt: index === 3 ? timeline.alertAcknowledgedAt : undefined,
      riskAuto: index === 3 ? "medium" : "high",
      riskFinal: index === 3 ? "medium" : "high",
      assignedTo: index === 0 ? seedClinician.clinicianId : undefined,
      assignedToName: index === 0 ? seedClinician.clinicianName : undefined,
      assignedAt: index === 0 ? timeline.alertAcknowledgedAt : undefined,
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
        createdAt: review.messageCreatedAt ?? dateAt(timeline.chatMessageDate, 9),
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
        createdAt: dateAt(timeline.chatMessageDate, 18),
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
      dueAt: timeline.taskDueAt,
      assignedTo: seedClinician.clinicianId,
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
      completedAt: index === 7 ? timeline.taskCompletedAt : undefined,
      demoTag: PRESENTATION_DEMO_TAG,
    }))
  );

  const insightSuggestions = await InsightSuggestion.insertMany(
    PRESENTATION_PATIENTS.map((patient) => ({
      patientId: patient.patientId,
      windowDays: 14,
      windowStart: timeline.insightWindowStart,
      windowEnd: timeline.insightWindowEnd,
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
          clinicianId: seedClinician.clinicianId,
          displayName: seedClinician.clinicianName,
        },
        linkedTaskId: `presentation-task-${patient.patientId}`,
        updatedBy: {
          clinicianId: seedClinician.clinicianId,
          displayName: seedClinician.clinicianName,
        },
        updatedAt: timeline.coordinationUpdatedAt,
      },
      noteHistory: [
        {
          id: `presentation-note-${patient.patientId}`,
          text: "Seeded presentation handoff note.",
          createdBy: {
            clinicianId: seedClinician.clinicianId,
            displayName: seedClinician.clinicianName,
          },
          createdAt: timeline.coordinationUpdatedAt,
        },
      ],
      demoTag: PRESENTATION_DEMO_TAG,
    }))
  );

  const appointmentSlots = await AppointmentSlot.insertMany(
    buildAppointmentSlots(context, timeline)
  );
  const appointmentRequests = await AppointmentRequest.insertMany(
    PRESENTATION_PATIENTS.slice(0, 6).map((patient, index) => ({
      slotId: appointmentSlots[index]._id,
      patientId: patient.patientId,
      status: index % 3 === 0 ? "approved" : "pending",
      note: "Presentation request for scheduling review.",
      reviewedBy:
        index % 3 === 0
          ? { clinicianId: seedClinician.clinicianId, name: seedClinician.clinicianName }
          : undefined,
      reviewedAt: index % 3 === 0 ? timeline.appointmentReviewedAt : undefined,
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
        clinicianId: seedClinician.clinicianId,
        name: seedClinician.clinicianName,
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
        clinicianId: seedClinician.clinicianId,
        name: seedClinician.clinicianName,
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

export async function loadPresentationSeed(context?: PresentationSeedClinicianContext) {
  assertPresentationSeedEnabled();
  const deleted = await resetPresentationSeedRecords(context);
  await preflightPresentationSeedCollisions(context);
  const counts = await insertPresentationData(context);

  return {
    enabled: true,
    loaded: true,
    seedId: PRESENTATION_SEED_ID,
    counts,
    deleted,
    lastLoadedAt: new Date().toISOString(),
    metadata: await getPresentationSeedMetadata(),
  };
}

export async function resetPresentationSeed(context?: PresentationSeedClinicianContext) {
  assertPresentationSeedEnabled();
  const deleted = await resetPresentationSeedRecords(context);
  const counts = await countPresentationRecords();

  return {
    enabled: true,
    loaded: false,
    seedId: PRESENTATION_SEED_ID,
    counts,
    deleted,
    lastLoadedAt: null,
    metadata: null,
  };
}
