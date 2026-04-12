import Alert from "../models/Alert";
import AppointmentRequest from "../models/AppointmentRequest";
import AppointmentSlot from "../models/AppointmentSlot";
import CheckIn from "../models/CheckIn";
import ExercisePlan from "../models/ExercisePlan";
import HydrationLog from "../models/HydrationLog";
import Medication from "../models/Medication";
import MedicationLog from "../models/MedicationLog";
import MedicationSchedule from "../models/MedicationSchedule";
import NutritionLog from "../models/NutritionLog";
import Patient from "../models/Patient";
import PromInstance from "../models/PromInstance";
import type { CaregiverAccessMeta } from "./caregiverAccessService";
import {
  getPatientDischargeCareState,
  mapPatientCareStatus,
  type PatientCareStatusSnapshot,
} from "./patientCareStatusService";
import { generateWeeklyReport } from "./weeklyReportService";

export type CaregiverCareStateKey =
  | "active"
  | "on_hold"
  | "discharged"
  | "independent_mode"
  | "inactive";

export type CaregiverCareStateSummary = {
  state: CaregiverCareStateKey;
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

export type CaregiverSummaryView = {
  ok: true;
  patientId: string;
  patient: {
    id: string;
    displayName?: string;
  };
  access: CaregiverAccessMeta | null;
  updatedAt: string;
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
  plan: {
    statusLabel?: string;
    phaseTitle?: string | null;
    itemCount: number;
    title?: string;
  } | null;
  nextAppointment: {
    startsAt: string;
    endsAt: string;
    modality: "video";
  } | null;
  supportGuidance: CaregiverSupportGuidance;
};

export type CaregiverWeeklyReportView = {
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

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

function toIsoString(value: unknown): string | null {
  return value instanceof Date && Number.isFinite(value.getTime()) ? value.toISOString() : null;
}

function currentPhaseTitleFromPatient(patient: Record<string, unknown>): string | null {
  const rehabRecord =
    patient.rehab && typeof patient.rehab === "object"
      ? (patient.rehab as {
          currentKey?: unknown;
          phases?: Array<{ key?: unknown; title?: unknown; status?: unknown }>;
        })
      : null;
  const rehabPhases = Array.isArray(rehabRecord?.phases) ? rehabRecord.phases : [];
  const currentKey =
    typeof rehabRecord?.currentKey === "string" ? rehabRecord.currentKey : null;
  const currentPhase =
    rehabPhases.find((phase) => phase.key === currentKey) ??
    rehabPhases.find((phase) => phase.status === "current") ??
    null;

  return currentPhase && typeof currentPhase.title === "string"
    ? currentPhase.title
    : null;
}

function parseDateOnlyUtc(value: string): Date | null {
  if (!dateRegex.test(value)) {
    return null;
  }

  const [yearString, monthString, dayString] = value.split("-");
  const year = Number.parseInt(yearString, 10);
  const month = Number.parseInt(monthString, 10);
  const day = Number.parseInt(dayString, 10);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return parsed;
}

function compareDateOnly(left: string, right: string): number {
  return Date.parse(`${left}T00:00:00.000Z`) - Date.parse(`${right}T00:00:00.000Z`);
}

function scheduleAppliesOnDate(
  schedule: {
    daysOfWeek?: unknown;
    startDate?: unknown;
    endDate?: unknown;
  },
  date: string
): boolean {
  const parsed = parseDateOnlyUtc(date);
  if (!parsed) {
    return false;
  }

  const rawDays = Array.isArray(schedule.daysOfWeek)
    ? schedule.daysOfWeek
    : [0, 1, 2, 3, 4, 5, 6];
  const days = rawDays.filter(
    (value): value is number => Number.isInteger(value) && value >= 0 && value <= 6
  );

  if (!days.includes(parsed.getUTCDay())) {
    return false;
  }

  const startDate =
    typeof schedule.startDate === "string" && schedule.startDate.trim()
      ? schedule.startDate
      : null;
  const endDate =
    typeof schedule.endDate === "string" && schedule.endDate.trim()
      ? schedule.endDate
      : null;

  if (startDate && compareDateOnly(date, startDate) < 0) {
    return false;
  }
  if (endDate && compareDateOnly(date, endDate) > 0) {
    return false;
  }

  return true;
}

async function readMedicationSummaryForDate(
  patientId: string,
  date: string
): Promise<{ taken: number; scheduled: number } | null> {
  const medications = await Medication.find({ patientId, active: true })
    .select({ _id: 1 })
    .lean();
  if (medications.length === 0) {
    return null;
  }

  const medicationIds = medications.map((item) => item._id);
  const [schedules, logs] = await Promise.all([
    MedicationSchedule.find({
      patientId,
      medicationId: { $in: medicationIds },
    })
      .select({ times: 1, daysOfWeek: 1, startDate: 1, endDate: 1 })
      .lean(),
    MedicationLog.find({
      patientId,
      medicationId: { $in: medicationIds },
      date,
    })
      .select({ status: 1 })
      .lean(),
  ]);

  let scheduled = 0;
  for (const schedule of schedules) {
    if (!scheduleAppliesOnDate(schedule, date)) {
      continue;
    }
    const times = Array.isArray(schedule.times)
      ? schedule.times.filter((time): time is string => typeof time === "string")
      : [];
    scheduled += times.length;
  }

  const taken = logs.reduce(
    (count, item) => count + (item.status === "taken" ? 1 : 0),
    0
  );

  return {
    taken,
    scheduled,
  };
}

async function readNextAppointmentSummary(patientId: string) {
  const approvedRequests = await AppointmentRequest.find({
    patientId,
    status: "approved",
  })
    .select({ slotId: 1 })
    .lean();

  if (approvedRequests.length === 0) {
    return null;
  }

  const slotIds = approvedRequests.map((item) => item.slotId).filter(Boolean);
  if (slotIds.length === 0) {
    return null;
  }

  const slots = await AppointmentSlot.find({
    _id: { $in: slotIds },
    startsAt: { $gte: new Date() },
  })
    .select({ startsAt: 1, endsAt: 1, modality: 1 })
    .sort({ startsAt: 1 })
    .lean();

  const nextSlot = slots[0];
  if (!nextSlot) {
    return null;
  }

  return {
    startsAt: toIsoString(nextSlot.startsAt) ?? new Date(0).toISOString(),
    endsAt: toIsoString(nextSlot.endsAt) ?? new Date(0).toISOString(),
    modality: "video" as const,
  };
}

function buildCaregiverCareState(
  careStatus: PatientCareStatusSnapshot
): CaregiverCareStateSummary {
  const dischargeState = getPatientDischargeCareState(careStatus);
  const state: CaregiverCareStateKey =
    dischargeState ?? (careStatus.status === "on_hold" ? "on_hold" : "active");

  if (state === "independent_mode") {
    return {
      state,
      label: "Independent mode",
      message:
        careStatus.discharge?.summary?.trim() ||
        "The structured care program has ended. The patient may keep self-tracking here, but routine clinician monitoring is not ongoing.",
      isHistorical: true,
      dischargedAt: careStatus.discharge?.dischargedAt ?? null,
      programSummary: careStatus.discharge?.summary ?? null,
      contactInstructions: careStatus.discharge?.contactInstructions ?? null,
    };
  }

  if (state === "discharged") {
    return {
      state,
      label: "Program completed",
      message:
        careStatus.discharge?.summary?.trim() ||
        "The care program has ended. Historical summaries remain available here, but routine clinician monitoring is not ongoing.",
      isHistorical: true,
      dischargedAt: careStatus.discharge?.dischargedAt ?? null,
      programSummary: careStatus.discharge?.summary ?? null,
      contactInstructions: careStatus.discharge?.contactInstructions ?? null,
    };
  }

  if (state === "inactive") {
    return {
      state,
      label: "Archive view",
      message:
        careStatus.discharge?.summary?.trim() ||
        "This account is inactive. Historical recovery information remains available in read-only form.",
      isHistorical: true,
      dischargedAt: careStatus.discharge?.dischargedAt ?? null,
      programSummary: careStatus.discharge?.summary ?? null,
      contactInstructions: careStatus.discharge?.contactInstructions ?? null,
    };
  }

  if (state === "on_hold") {
    return {
      state,
      label: "On hold",
      message:
        "Care is temporarily on hold. This read-only caregiver view continues to show the latest approved summary information.",
      isHistorical: false,
      dischargedAt: null,
      programSummary: null,
      contactInstructions: null,
    };
  }

  return {
    state: "active",
    label: "Active care",
    message:
      "The patient remains in active care. This caregiver view stays read-only and does not replace clinician guidance.",
    isHistorical: false,
    dischargedAt: null,
    programSummary: null,
    contactInstructions: null,
  };
}

function buildSupportGuidance(
  careState: CaregiverCareStateSummary
): CaregiverSupportGuidance {
  if (careState.state === "discharged" || careState.state === "independent_mode") {
    return {
      clinicContact:
        careState.contactInstructions?.trim() ||
        "If recovery changes or new care is needed, contact the clinic directly.",
      urgentHelp:
        "If the patient may need urgent help, contact local emergency services right away.",
      monitoringNote:
        "This read-only summary does not indicate ongoing routine clinician monitoring.",
    };
  }

  if (careState.state === "inactive") {
    return {
      clinicContact:
        careState.contactInstructions?.trim() ||
        "If support is needed, contact the clinic directly before expecting new follow-up.",
      urgentHelp:
        "If the patient may need urgent help, contact local emergency services right away.",
      monitoringNote:
        "This account is inactive, so the caregiver view is historical and read-only.",
    };
  }

  return {
    clinicContact:
      "If something feels off or recovery changes, contact the clinic directly.",
    urgentHelp:
      "If the patient may need urgent help, contact local emergency services right away.",
    monitoringNote:
      "Caregiver access is read-only and should not be treated as direct clinician communication.",
  };
}

export async function buildCaregiverSummaryView(options: {
  patientId: string;
  access: CaregiverAccessMeta | null;
}): Promise<CaregiverSummaryView | null> {
  const patientId = options.patientId.trim();
  if (!patientId) {
    return null;
  }

  const [patient, lastCheckin, plan, nextAppointment] = await Promise.all([
    Patient.findOne({ patientId })
      .select({ patientId: 1, displayName: 1, status: 1, discharge: 1, rehab: 1 })
      .lean(),
    CheckIn.findOne({ patientId })
      .sort({ createdAt: -1 })
      .select({
        date: 1,
        pain: 1,
        mood: 1,
        adherence: 1,
        sleep: 1,
      })
      .lean(),
    ExercisePlan.findOne({ patientId })
      .select({ title: 1, items: 1 })
      .lean(),
    readNextAppointmentSummary(patientId),
  ]);

  if (!patient) {
    return null;
  }

  const careStatus = mapPatientCareStatus(
    patient as Record<string, unknown>,
    patientId
  );
  const careState = buildCaregiverCareState(careStatus);
  const currentPhaseTitle = currentPhaseTitleFromPatient(patient as Record<string, unknown>);

  const lastCheckinDate =
    typeof lastCheckin?.date === "string" && dateRegex.test(lastCheckin.date)
      ? lastCheckin.date
      : null;

  const [openAlertsCount, highRiskAlerts14d, dueNowCount, hydrationRows, nutritionToday, medsToday] =
    await Promise.all([
      Alert.countDocuments({ patientId, status: "open" }),
      Alert.countDocuments({
        patientId,
        risk: "high",
        createdAt: { $gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
      }),
      PromInstance.countDocuments({ patientId, status: "due" }),
      lastCheckinDate
        ? HydrationLog.find({ patientId, date: lastCheckinDate })
            .select({ amountMl: 1 })
            .lean()
        : Promise.resolve([]),
      lastCheckinDate
        ? NutritionLog.findOne({ patientId, date: lastCheckinDate })
            .sort({ createdAt: -1 })
            .select({ protein: 1, fruitVegServings: 1 })
            .lean()
        : Promise.resolve(null),
      lastCheckinDate
        ? readMedicationSummaryForDate(patientId, lastCheckinDate)
        : Promise.resolve(null),
    ]);

  const hydrationTodayMl =
    hydrationRows.length > 0
      ? hydrationRows.reduce((sum, item) => {
          const amount = typeof item.amountMl === "number" ? item.amountMl : 0;
          return sum + amount;
        }, 0)
      : undefined;

  return {
    ok: true,
    patientId,
    patient: {
      id: patient.patientId,
      displayName:
        typeof patient.displayName === "string" ? patient.displayName : undefined,
    },
    access: options.access,
    updatedAt: new Date().toISOString(),
    careState,
    lastCheckin:
      lastCheckin && lastCheckinDate
        ? {
            date: lastCheckinDate,
            pain: typeof lastCheckin.pain === "number" ? lastCheckin.pain : 0,
            mood: typeof lastCheckin.mood === "number" ? lastCheckin.mood : 0,
            adherence: {
              exercises:
                lastCheckin.adherence &&
                typeof lastCheckin.adherence === "object" &&
                typeof (lastCheckin.adherence as { exercises?: unknown }).exercises ===
                  "number"
                  ? (lastCheckin.adherence as { exercises: number }).exercises
                  : undefined,
              medication:
                lastCheckin.adherence &&
                typeof lastCheckin.adherence === "object" &&
                typeof (lastCheckin.adherence as { medication?: unknown }).medication ===
                  "boolean"
                  ? (lastCheckin.adherence as { medication: boolean }).medication
                  : undefined,
            },
            sleep:
              lastCheckin.sleep &&
              typeof lastCheckin.sleep === "object" &&
              (typeof (lastCheckin.sleep as { hours?: unknown }).hours === "number" ||
                typeof (lastCheckin.sleep as { quality?: unknown }).quality === "number")
                ? {
                    hours:
                      typeof (lastCheckin.sleep as { hours?: unknown }).hours ===
                      "number"
                        ? (lastCheckin.sleep as { hours: number }).hours
                        : undefined,
                    quality:
                      typeof (lastCheckin.sleep as { quality?: unknown }).quality ===
                      "number"
                        ? (lastCheckin.sleep as { quality: number }).quality
                        : undefined,
                  }
                : undefined,
            hydrationTodayMl,
            nutritionToday:
              nutritionToday &&
              (nutritionToday.protein === "low" ||
                nutritionToday.protein === "ok" ||
                nutritionToday.protein === "high" ||
                typeof nutritionToday.fruitVegServings === "number")
                ? {
                    protein:
                      nutritionToday.protein === "low" ||
                      nutritionToday.protein === "ok" ||
                      nutritionToday.protein === "high"
                        ? nutritionToday.protein
                        : undefined,
                    fruitVegServings:
                      typeof nutritionToday.fruitVegServings === "number"
                        ? nutritionToday.fruitVegServings
                        : undefined,
                  }
                : undefined,
            medsToday:
              medsToday && medsToday.scheduled > 0
                ? {
                    taken: medsToday.taken,
                    scheduled: medsToday.scheduled,
                  }
                : undefined,
          }
        : null,
    safety: {
      openAlertsCount,
      highRiskAlerts14d,
    },
    assessments: {
      dueNowCount,
    },
    plan: {
      statusLabel: plan
        ? Array.isArray(plan.items) && plan.items.length > 0
          ? "Plan assigned"
          : "Nothing scheduled right now"
        : "No plan assigned",
      phaseTitle: currentPhaseTitle,
      itemCount: Array.isArray(plan?.items) ? plan.items.length : 0,
      title: typeof plan?.title === "string" ? plan.title : undefined,
    },
    nextAppointment,
    supportGuidance: buildSupportGuidance(careState),
  };
}

export async function buildCaregiverWeeklyReportView(options: {
  patientId: string;
  access: CaregiverAccessMeta | null;
  weekStart?: string;
  tzOffsetMinutes?: number;
}): Promise<CaregiverWeeklyReportView | null> {
  const patientId = options.patientId.trim();
  if (!patientId) {
    return null;
  }

  const patient = await Patient.findOne({ patientId })
    .select({ patientId: 1, status: 1, discharge: 1 })
    .lean();
  if (!patient) {
    return null;
  }

  const careStatus = mapPatientCareStatus(
    patient as Record<string, unknown>,
    patientId
  );
  const careState = buildCaregiverCareState(careStatus);
  const report = await generateWeeklyReport({
    patientId,
    weekStart: options.weekStart,
    tzOffsetMinutes: options.tzOffsetMinutes,
  });

  return {
    ok: true,
    patientId,
    period: report.period,
    careState,
    summary: {
      headline: report.summary.headline,
      highlights: report.summary.highlights,
      nextSteps: report.summary.nextSteps,
    },
    checkins: {
      count: report.checkins.count,
      avgPain: report.checkins.avgPain,
      avgMood: report.checkins.avgMood,
    },
    exercises: {
      sessionCount: report.exercises.sessionCount,
      totalDurationMinutes: report.exercises.totalDurationMinutes,
      completedExercises: report.exercises.completedExercises,
      totalExercises: report.exercises.totalExercises,
    },
    medications: {
      adherencePct: report.medications.adherencePct,
    },
    hydration: {
      avgDailyMl: report.hydration.avgDailyMl,
    },
    nutrition: {
      avgFruitVegServings: report.nutrition.avgFruitVegServings,
    },
    assessments: {
      dueNowCount: report.proms.dueNowCount,
      completedThisWeekCount: report.proms.completedThisWeekCount,
    },
    safety: {
      alertsCreatedThisWeek: report.safety.alertsCreatedThisWeek,
      highRiskAlertsThisWeek: report.safety.highRiskAlertsThisWeek,
    },
    updatedAt: new Date().toISOString(),
  };
}
