import Alert from "../../src/models/Alert";
import AppointmentRequest from "../../src/models/AppointmentRequest";
import AppointmentSlot from "../../src/models/AppointmentSlot";
import CareEvent from "../../src/models/CareEvent";
import ChatMessage from "../../src/models/ChatMessage";
import CheckIn from "../../src/models/CheckIn";
import ExercisePlan from "../../src/models/ExercisePlan";
import HydrationLog from "../../src/models/HydrationLog";
import Medication from "../../src/models/Medication";
import MedicationLog from "../../src/models/MedicationLog";
import MedicationSchedule from "../../src/models/MedicationSchedule";
import NutritionLog from "../../src/models/NutritionLog";
import Patient from "../../src/models/Patient";
import PromInstance from "../../src/models/PromInstance";
import PromTemplate from "../../src/models/PromTemplate";
import User from "../../src/models/User";
import WearableDaily from "../../src/models/WearableDaily";
import {
  type BodyMapPainType,
  type BodyMapRegion,
} from "../../src/constants/bodyMap";
import { buildDefaultPhases, recomputePhaseStatuses } from "../../src/services/rehabPhaseService";
import { buildDefaultPromTemplate, computePromScore } from "../../src/services/promsService";
import { hashPassword } from "../../src/utils/password";

import {
  ASSISTANT_CHAT_TEXTS,
  CHAT_MESSAGES_PER_PATIENT,
  CHECKIN_WINDOW_DAYS,
  CLINICIANS,
  DEMO_CLINICIAN_USERS,
  DEMO_EXERCISE_PLANS,
  DEMO_PATIENTS,
  DEMO_REHAB_CURRENT_KEYS,
  DEMO_TAG,
  RNG_SEED,
  USER_CHAT_TEXTS,
} from "./constants";
import type { ResetSummary, SeedAlertDefinition, SeedOptions, SeedSummary } from "./types";

interface CheckInSeedRow {
  patientId: string;
  dayOffset: number;
  doc: Record<string, unknown>;
}

interface HydrationSeedRow {
  patientId: string;
  doc: Record<string, unknown>;
}

interface NutritionSeedRow {
  patientId: string;
  doc: Record<string, unknown>;
}

interface WearableSeedRow {
  patientId: string;
  doc: Record<string, unknown>;
}

interface MedicationSeedRow {
  patientId: string;
  medKey: string;
  doc: Record<string, unknown>;
}

interface MedicationScheduleSeedRow {
  patientId: string;
  medKey: string;
  times: string[];
  daysOfWeek?: number[];
  startDate?: string;
  endDate?: string;
}

interface MedicationLogSeedRow {
  patientId: string;
  medKey: string;
  doc: Record<string, unknown>;
}

interface AppointmentSlotSeedRow {
  slotKey: string;
  clinicianId: string;
  doc: Record<string, unknown>;
}

interface AppointmentRequestSeedRow {
  patientId: string;
  slotKey: string;
  doc: Record<string, unknown>;
}

interface ChatSeedRow {
  patientId: string;
  slot: number;
  doc: Record<string, unknown>;
}

type SeedStatus = "open" | "acknowledged" | "resolved";

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function utcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(date: Date, deltaDays: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + deltaDays);
  return next;
}

function withUtcTime(date: Date, hour: number, minute: number): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      hour,
      minute,
      0,
      0
    )
  );
}

function minutesAfter(date: Date, deltaMinutes: number): Date {
  return new Date(date.getTime() + deltaMinutes * 60_000);
}

function toDateKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate()
  ).padStart(2, "0")}`;
}

function requireMappedId(map: Map<string, string>, key: string, label: string): string {
  const value = map.get(key);
  if (!value) {
    throw new Error(`Missing seed source reference for ${label}.`);
  }
  return value;
}

function seedStatusCounts(statuses: SeedStatus[]): Record<SeedStatus, number> {
  return statuses.reduce<Record<SeedStatus, number>>(
    (acc, status) => {
      acc[status] += 1;
      return acc;
    },
    { open: 0, acknowledged: 0, resolved: 0 }
  );
}

function getClinicianName(clinicianId: string): string | undefined {
  if (clinicianId === CLINICIANS.one.id) {
    return CLINICIANS.one.name;
  }
  if (clinicianId === CLINICIANS.two.id) {
    return CLINICIANS.two.name;
  }
  return undefined;
}

export async function resetDemoData(): Promise<ResetSummary> {
  const [
    promInstancesDeleted,
    promTemplatesDeleted,
    exercisePlansDeleted,
    appointmentSlotsDeleted,
    appointmentRequestsDeleted,
    medicationSchedulesDeleted,
    medicationsDeleted,
    medicationLogsDeleted,
    hydrationLogsDeleted,
    nutritionLogsDeleted,
    wearableDailiesDeleted,
    careEventsDeleted,
    alertsDeleted,
    chatMessagesDeleted,
    checkInsDeleted,
    patientsDeleted,
    usersDeleted,
  ] = await Promise.all([
    PromInstance.deleteMany({ demoTag: DEMO_TAG }),
    PromTemplate.deleteMany({ demoTag: DEMO_TAG }),
    ExercisePlan.deleteMany({ demoTag: DEMO_TAG }),
    AppointmentSlot.deleteMany({ demoTag: DEMO_TAG }),
    AppointmentRequest.deleteMany({ demoTag: DEMO_TAG }),
    MedicationSchedule.deleteMany({ demoTag: DEMO_TAG }),
    Medication.deleteMany({ demoTag: DEMO_TAG }),
    MedicationLog.deleteMany({ demoTag: DEMO_TAG }),
    HydrationLog.deleteMany({ demoTag: DEMO_TAG }),
    NutritionLog.deleteMany({ demoTag: DEMO_TAG }),
    WearableDaily.deleteMany({ demoTag: DEMO_TAG }),
    CareEvent.deleteMany({ demoTag: DEMO_TAG }),
    Alert.deleteMany({ demoTag: DEMO_TAG }),
    ChatMessage.deleteMany({ demoTag: DEMO_TAG }),
    CheckIn.deleteMany({ demoTag: DEMO_TAG }),
    Patient.deleteMany({ demoTag: DEMO_TAG }),
    User.deleteMany({ demoTag: DEMO_TAG }),
  ]);

  return {
    usersDeleted: usersDeleted.deletedCount ?? 0,
    patientsDeleted: patientsDeleted.deletedCount ?? 0,
    checkInsDeleted: checkInsDeleted.deletedCount ?? 0,
    appointmentSlotsDeleted: appointmentSlotsDeleted.deletedCount ?? 0,
    appointmentRequestsDeleted: appointmentRequestsDeleted.deletedCount ?? 0,
    hydrationLogsDeleted: hydrationLogsDeleted.deletedCount ?? 0,
    nutritionLogsDeleted: nutritionLogsDeleted.deletedCount ?? 0,
    wearableDailiesDeleted: wearableDailiesDeleted.deletedCount ?? 0,
    chatMessagesDeleted: chatMessagesDeleted.deletedCount ?? 0,
    alertsDeleted: alertsDeleted.deletedCount ?? 0,
    careEventsDeleted: careEventsDeleted.deletedCount ?? 0,
    exercisePlansDeleted: exercisePlansDeleted.deletedCount ?? 0,
    medicationsDeleted: medicationsDeleted.deletedCount ?? 0,
    medicationSchedulesDeleted: medicationSchedulesDeleted.deletedCount ?? 0,
    medicationLogsDeleted: medicationLogsDeleted.deletedCount ?? 0,
    promTemplatesDeleted: promTemplatesDeleted.deletedCount ?? 0,
    promInstancesDeleted: promInstancesDeleted.deletedCount ?? 0,
  };
}

function buildCheckInRows(now: Date): CheckInSeedRow[] {
  const rows: CheckInSeedRow[] = [];
  const rng = mulberry32(RNG_SEED);
  const baseDay = utcDay(now);
  const regionSequence: BodyMapRegion[] = [
    "lower_back",
    "knee_left",
    "knee_right",
    "upper_back",
    "shoulder_left",
    "shoulder_right",
    "hip_left",
    "hip_right",
  ];
  const painTypeSequence: BodyMapPainType[] = [
    "stiffness",
    "ache",
    "sharp",
    "tingling",
    "burning",
    "other",
  ];

  DEMO_PATIENTS.forEach((patient, patientIndex) => {
    for (let dayOffset = 0; dayOffset < CHECKIN_WINDOW_DAYS; dayOffset += 1) {
      if (dayOffset % 4 === 0) {
        continue;
      }

      const day = addUtcDays(baseDay, -dayOffset);
      const createdAt = withUtcTime(day, 8 + patientIndex * 2, (dayOffset * 7) % 60);
      const forcedHighPain =
        (patient.patientId === "p1" && [1, 7, 15].includes(dayOffset)) ||
        (patient.patientId === "p2" && dayOffset === 2);

      const painBase = patient.patientId === "p1" ? 6 : patient.patientId === "p2" ? 5 : 4;
      const pain = forcedHighPain
        ? 7 + Math.floor(rng() * 3)
        : clamp(Math.round(painBase + (rng() * 4 - 2)), 0, 10);
      const mood = clamp(5 - Math.floor(pain / 3) + (rng() > 0.72 ? 1 : 0), 1, 5);
      const exercises = Number((0.2 + rng() * 0.75).toFixed(2));
      const medication = rng() > 0.28;
      const hasNote = rng() > 0.5;
      const includeSleep = rng() > 0.25;

      const sleepHoursRaw = clamp(8.2 - pain * 0.28 + (rng() * 1.4 - 0.7), 0, 16);
      const sleepHours = Math.round(sleepHoursRaw * 10) / 10;
      const sleepQuality = clamp(Math.round(5 - pain / 3 + (rng() > 0.7 ? 1 : 0)), 1, 5);
      const sleepDisturbances = clamp(Math.round((pain - 2) / 2 + (rng() > 0.75 ? 1 : 0)), 0, 5);

      const sleep =
        includeSleep
          ? {
              hours: sleepHours,
              quality: sleepQuality,
              disturbances: sleepDisturbances,
            }
          : undefined;

      const notes = hasNote
        ? patient.patientId === "p3"
          ? "Routine completed as planned."
          : "Knee feels tight after activity."
        : undefined;

      const includeBodyMap = pain >= 5 || (dayOffset + patientIndex) % 6 === 2;
      const bodyMap =
        includeBodyMap
          ? {
              regions: Array.from(
                { length: pain >= 7 ? 2 : 1 },
                (_unused, index) => {
                  const region =
                    regionSequence[
                      (dayOffset + patientIndex * 2 + index) % regionSequence.length
                    ];
                  const intensity = clamp(pain - index, 0, 10);
                  const type =
                    painTypeSequence[
                      (dayOffset + patientIndex + index) % painTypeSequence.length
                    ];
                  return {
                    region,
                    intensity,
                    type,
                  };
                }
              ),
            }
          : undefined;

      rows.push({
        patientId: patient.patientId,
        dayOffset,
        doc: {
          patientId: patient.patientId,
          date: toDateKey(day),
          mood,
          pain,
          adherence: {
            exercises,
            medication,
          },
          sleep,
          bodyMap,
          notes,
          risk: {
            level: pain >= 7 ? "high" : "low",
            reasons: pain >= 7 ? ["PAIN_GE_THRESHOLD"] : [],
          },
          demoTag: DEMO_TAG,
          createdAt,
          updatedAt: minutesAfter(createdAt, 5),
        },
      });
    }
  });

  return rows;
}

function buildHydrationRows(now: Date): HydrationSeedRow[] {
  const rows: HydrationSeedRow[] = [];
  const rng = mulberry32(RNG_SEED + 101);
  const baseDay = utcDay(now);
  const hydrationWindowDays = 14;
  const slots = [250, 500, 750];

  DEMO_PATIENTS.forEach((patient, patientIndex) => {
    for (let dayOffset = 0; dayOffset < hydrationWindowDays; dayOffset += 1) {
      if ((dayOffset + patientIndex) % 4 === 0) {
        continue;
      }

      const day = addUtcDays(baseDay, -dayOffset);
      const entryCount = 1 + ((dayOffset + patientIndex) % 3);

      for (let entryIndex = 0; entryIndex < entryCount; entryIndex += 1) {
        const amountMl = slots[Math.floor(rng() * slots.length)];
        const createdAt = withUtcTime(
          day,
          8 + patientIndex * 2 + entryIndex * 3,
          (dayOffset * 11 + entryIndex * 17) % 60
        );

        rows.push({
          patientId: patient.patientId,
          doc: {
            patientId: patient.patientId,
            date: toDateKey(day),
            amountMl,
            source: "manual",
            demoTag: DEMO_TAG,
            createdAt,
            updatedAt: createdAt,
          },
        });
      }
    }
  });

  return rows;
}

function buildNutritionRows(now: Date): NutritionSeedRow[] {
  const rows: NutritionSeedRow[] = [];
  const rng = mulberry32(RNG_SEED + 202);
  const baseDay = utcDay(now);
  const nutritionWindowDays = 14;
  const proteinScale: Array<"low" | "ok" | "high"> = ["low", "ok", "high"];
  const regularityScale: Array<"irregular" | "mostly" | "regular"> = [
    "irregular",
    "mostly",
    "regular",
  ];
  const appetiteScale: Array<"low" | "normal" | "high"> = ["low", "normal", "high"];

  DEMO_PATIENTS.forEach((patient, patientIndex) => {
    for (let dayOffset = 0; dayOffset < nutritionWindowDays; dayOffset += 1) {
      if ((dayOffset + patientIndex) % 5 === 0) {
        continue;
      }

      const day = addUtcDays(baseDay, -dayOffset);
      const createdAt = withUtcTime(day, 18 + patientIndex, (dayOffset * 13) % 60);
      const protein = proteinScale[(dayOffset + patientIndex) % proteinScale.length];
      const fruitVegServings = clamp(
        Math.round(1 + patientIndex + rng() * 4),
        0,
        6
      );
      const antiInflammatoryFocus = rng() > 0.45;
      const mealRegularity =
        regularityScale[(dayOffset + patientIndex * 2) % regularityScale.length];
      const appetite =
        (dayOffset + patientIndex) % 3 === 0
          ? appetiteScale[(dayOffset + patientIndex) % appetiteScale.length]
          : undefined;
      const notes =
        (dayOffset + patientIndex) % 4 === 0
          ? "Focused on balanced meals today."
          : undefined;

      rows.push({
        patientId: patient.patientId,
        doc: {
          patientId: patient.patientId,
          date: toDateKey(day),
          protein,
          fruitVegServings,
          antiInflammatoryFocus,
          mealRegularity,
          appetite,
          notes,
          source: "manual",
          demoTag: DEMO_TAG,
          createdAt,
          updatedAt: createdAt,
        },
      });
    }
  });

  return rows;
}

function buildWearableRows(now: Date): WearableSeedRow[] {
  const rows: WearableSeedRow[] = [];
  const rng = mulberry32(RNG_SEED + 303);
  const baseDay = utcDay(now);
  const windowDays = 14;
  const stepsBase = [6800, 5600, 4700];

  DEMO_PATIENTS.forEach((patient, patientIndex) => {
    for (let dayOffset = 0; dayOffset < windowDays; dayOffset += 1) {
      if ((dayOffset + patientIndex) % 6 === 0) {
        continue;
      }

      const day = addUtcDays(baseDay, -dayOffset);
      const steps = clamp(
        Math.round(
          stepsBase[patientIndex % stepsBase.length] -
            dayOffset * 120 +
            ((dayOffset + patientIndex) % 5) * 360 +
            (rng() * 700 - 350)
        ),
        2500,
        9000
      );
      const activeMinutes = clamp(
        Math.round(10 + steps / 220 + (rng() * 10 - 5)),
        10,
        60
      );
      const restingHr = clamp(
        Math.round(84 - activeMinutes / 2 + patientIndex * 2 + (rng() * 8 - 4)),
        55,
        85
      );
      const createdAt = withUtcTime(day, 6 + patientIndex, (dayOffset * 9) % 60);

      rows.push({
        patientId: patient.patientId,
        doc: {
          patientId: patient.patientId,
          source: "mock",
          date: toDateKey(day),
          steps,
          activeMinutes,
          restingHr,
          demoTag: DEMO_TAG,
          createdAt,
          updatedAt: createdAt,
        },
      });
    }
  });

  return rows;
}

function buildMedicationSeed(now: Date): {
  medications: MedicationSeedRow[];
  schedules: MedicationScheduleSeedRow[];
  logs: MedicationLogSeedRow[];
} {
  const definitions: Array<{
    patientId: string;
    medKey: string;
    name: string;
    type: "medication" | "supplement";
    instructions?: string;
    times: string[];
  }> = [
    {
      patientId: "p1",
      medKey: "p1-ibuprofen",
      name: "Ibuprofen",
      type: "medication",
      instructions: "Take as prescribed by your clinician with food.",
      times: ["08:00", "20:00"],
    },
    {
      patientId: "p1",
      medKey: "p1-omega3",
      name: "Omega-3",
      type: "supplement",
      instructions: "Take with breakfast as prescribed.",
      times: ["09:00"],
    },
    {
      patientId: "p2",
      medKey: "p2-acetaminophen",
      name: "Acetaminophen",
      type: "medication",
      instructions: "Take as prescribed by your clinician.",
      times: ["08:00", "20:00"],
    },
    {
      patientId: "p3",
      medKey: "p3-vitamin-d",
      name: "Vitamin D",
      type: "supplement",
      instructions: "Take daily as prescribed.",
      times: ["09:00"],
    },
  ];

  const medications: MedicationSeedRow[] = definitions.map((definition) => ({
    patientId: definition.patientId,
    medKey: definition.medKey,
    doc: {
      patientId: definition.patientId,
      name: definition.name,
      type: definition.type,
      instructions: definition.instructions,
      active: true,
      demoTag: DEMO_TAG,
    },
  }));

  const schedules: MedicationScheduleSeedRow[] = definitions.map((definition) => ({
    patientId: definition.patientId,
    medKey: definition.medKey,
    times: definition.times,
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  }));

  const patientOrder = new Map<string, number>(
    DEMO_PATIENTS.map((patient, index) => [patient.patientId, index])
  );
  const baseDay = utcDay(now);
  const logs: MedicationLogSeedRow[] = [];

  for (const [definitionIndex, definition] of definitions.entries()) {
    const patientIndex = patientOrder.get(definition.patientId) ?? 0;
    for (let dayOffset = 0; dayOffset < 14; dayOffset += 1) {
      if ((dayOffset + patientIndex + definitionIndex) % 5 === 0) {
        continue;
      }

      const day = addUtcDays(baseDay, -dayOffset);
      for (const [timeIndex, time] of definition.times.entries()) {
        const [hourString, minuteString] = time.split(":");
        const hour = Number.parseInt(hourString, 10);
        const minute = Number.parseInt(minuteString, 10);
        const createdAt = withUtcTime(day, hour, minute + ((dayOffset * 9 + timeIndex * 7) % 10));

        const taken = (dayOffset + timeIndex + definitionIndex + patientIndex) % 4 !== 0;
        logs.push({
          patientId: definition.patientId,
          medKey: definition.medKey,
          doc: {
            patientId: definition.patientId,
            date: toDateKey(day),
            time,
            status: taken ? "taken" : "skipped",
            note: taken ? undefined : "Skipped planned dose.",
            source: "manual",
            demoTag: DEMO_TAG,
            createdAt,
            updatedAt: createdAt,
          },
        });
      }
    }
  }

  return {
    medications,
    schedules,
    logs,
  };
}

function buildAppointmentSeed(now: Date): {
  slots: AppointmentSlotSeedRow[];
  requests: AppointmentRequestSeedRow[];
} {
  const baseDay = utcDay(now);
  const tomorrow = addUtcDays(baseDay, 1);
  const dayAfter = addUtcDays(baseDay, 2);

  const slots: AppointmentSlotSeedRow[] = [
    {
      slotKey: "p1-tomorrow-1000",
      clinicianId: CLINICIANS.one.id,
      doc: {
        clinicianId: CLINICIANS.one.id,
        startsAt: withUtcTime(tomorrow, 10, 0),
        endsAt: withUtcTime(tomorrow, 10, 30),
        modality: "video",
        status: "available",
        meetingLink: "https://example.com/meet/demo-slot-1",
        demoTag: DEMO_TAG,
      },
    },
    {
      slotKey: "p1-tomorrow-1030",
      clinicianId: CLINICIANS.one.id,
      doc: {
        clinicianId: CLINICIANS.one.id,
        startsAt: withUtcTime(tomorrow, 10, 30),
        endsAt: withUtcTime(tomorrow, 11, 0),
        modality: "video",
        status: "available",
        meetingLink: "https://example.com/meet/demo-slot-2",
        demoTag: DEMO_TAG,
      },
    },
    {
      slotKey: "p1-tomorrow-1100",
      clinicianId: CLINICIANS.one.id,
      doc: {
        clinicianId: CLINICIANS.one.id,
        startsAt: withUtcTime(tomorrow, 11, 0),
        endsAt: withUtcTime(tomorrow, 11, 30),
        modality: "video",
        status: "available",
        meetingLink: "https://example.com/meet/demo-slot-3",
        demoTag: DEMO_TAG,
      },
    },
    {
      slotKey: "p3-dayafter-0900",
      clinicianId: CLINICIANS.two.id,
      doc: {
        clinicianId: CLINICIANS.two.id,
        startsAt: withUtcTime(dayAfter, 9, 0),
        endsAt: withUtcTime(dayAfter, 9, 30),
        modality: "video",
        status: "available",
        meetingLink: "https://example.com/meet/demo-slot-4",
        demoTag: DEMO_TAG,
      },
    },
  ];

  const requests: AppointmentRequestSeedRow[] = [
    {
      patientId: "p1",
      slotKey: "p1-tomorrow-1000",
      doc: {
        patientId: "p1",
        status: "pending",
        note: "Available in the morning.",
        demoTag: DEMO_TAG,
      },
    },
  ];

  return {
    slots,
    requests,
  };
}

function buildChatRows(now: Date): ChatSeedRow[] {
  const rows: ChatSeedRow[] = [];
  const baseDay = utcDay(now);

  DEMO_PATIENTS.forEach((patient, patientIndex) => {
    for (let slot = 0; slot < CHAT_MESSAGES_PER_PATIENT; slot += 1) {
      const role = slot % 2 === 0 ? "user" : "assistant";
      const textIndex = Math.floor(slot / 2) % USER_CHAT_TEXTS.length;
      const dayOffset = CHAT_MESSAGES_PER_PATIENT - 1 - slot;
      const day = addUtcDays(baseDay, -dayOffset);
      const createdAt = withUtcTime(day, 16 + patientIndex, (slot * 5) % 60);
      const riskHigh = role === "user" && [2, 6].includes(slot);

      rows.push({
        patientId: patient.patientId,
        slot,
        doc: {
          patientId: patient.patientId,
          role,
          text: role === "user" ? USER_CHAT_TEXTS[textIndex] : ASSISTANT_CHAT_TEXTS[textIndex],
          risk: {
            level: riskHigh ? "high" : "low",
            reasons: riskHigh ? ["SYMPTOM_SPIKE"] : [],
          },
          demoTag: DEMO_TAG,
          createdAt,
          updatedAt: minutesAfter(createdAt, 1),
        },
      });
    }
  });

  return rows;
}

function buildAlertDefinitions(
  now: Date,
  checkInSourceIds: Map<string, string>,
  chatSourceIds: Map<string, string>
): SeedAlertDefinition[] {
  const nowMs = now.getTime();
  const p1CheckinOffset1 = requireMappedId(checkInSourceIds, "p1:1", "p1 checkin offset 1");
  const p2CheckinOffset2 = requireMappedId(checkInSourceIds, "p2:2", "p2 checkin offset 2");
  const p1ChatSlot8 = requireMappedId(chatSourceIds, "p1:8", "p1 chat slot 8");
  const p3ChatSlot6 = requireMappedId(chatSourceIds, "p3:6", "p3 chat slot 6");
  const p2CheckinOffset6 = requireMappedId(checkInSourceIds, "p2:6", "p2 checkin offset 6");
  const p1CheckinOffset10 = requireMappedId(checkInSourceIds, "p1:10", "p1 checkin offset 10");

  return [
    {
      key: "alert-open-seen",
      patientId: "p1",
      status: "open",
      reason: "PAIN_GE_THRESHOLD",
      sourceType: "checkin",
      sourceRef: p1CheckinOffset1,
      createdAt: new Date(nowMs - 6 * 60 * 60 * 1000),
      seenAt: new Date(nowMs - 5.5 * 60 * 60 * 1000),
      seenBy: [CLINICIANS.one.id],
      notificationStatus: "unknown",
      notificationAttemptedAt: new Date(nowMs - 5.9 * 60 * 60 * 1000),
    },
    {
      key: "alert-open-assigned",
      patientId: "p2",
      status: "open",
      reason: "ADHERENCE_DROP",
      sourceType: "checkin",
      sourceRef: p2CheckinOffset2,
      createdAt: new Date(nowMs - 30 * 60 * 60 * 1000),
      assignedTo: CLINICIANS.one.id,
      assignedToName: CLINICIANS.one.name,
      assignedAt: new Date(nowMs - 29.3 * 60 * 60 * 1000),
      notificationStatus: "unknown",
      notificationAttemptedAt: new Date(nowMs - 29.8 * 60 * 60 * 1000),
    },
    {
      key: "alert-open-chat-failed",
      patientId: "p1",
      status: "open",
      reason: "SYMPTOM_SPIKE",
      sourceType: "chat",
      sourceRef: p1ChatSlot8,
      createdAt: new Date(nowMs - 20 * 60 * 60 * 1000),
      notificationStatus: "failed",
      notificationAttemptedAt: new Date(nowMs - 19.9 * 60 * 60 * 1000),
      notificationFailedAt: new Date(nowMs - 19.8 * 60 * 60 * 1000),
      notificationError: "N8N_WEBHOOK_DELIVERY_FAILED",
    },
    {
      key: "alert-ack-override",
      patientId: "p3",
      status: "acknowledged",
      reason: "SYMPTOM_SPIKE",
      sourceType: "chat",
      sourceRef: p3ChatSlot6,
      createdAt: new Date(nowMs - 5 * 24 * 60 * 60 * 1000),
      acknowledgedAt: new Date(nowMs - 4.9 * 24 * 60 * 60 * 1000),
      riskFinal: "medium",
      overrideReason: "Symptoms improving; monitor",
      overriddenBy: CLINICIANS.one.id,
      overriddenByName: CLINICIANS.one.name,
      overriddenAt: new Date(nowMs - 4.95 * 24 * 60 * 60 * 1000),
      notificationStatus: "unknown",
      notificationAttemptedAt: new Date(nowMs - 4.99 * 24 * 60 * 60 * 1000),
    },
    {
      key: "alert-ack-checkin",
      patientId: "p2",
      status: "acknowledged",
      reason: "PAIN_GE_THRESHOLD",
      sourceType: "checkin",
      sourceRef: p2CheckinOffset6,
      createdAt: new Date(nowMs - 8 * 24 * 60 * 60 * 1000),
      acknowledgedAt: new Date(nowMs - 7.8 * 24 * 60 * 60 * 1000),
      notificationStatus: "unknown",
      notificationAttemptedAt: new Date(nowMs - 7.95 * 24 * 60 * 60 * 1000),
    },
    {
      key: "alert-resolved-checkin",
      patientId: "p1",
      status: "resolved",
      reason: "ADHERENCE_DROP",
      sourceType: "checkin",
      sourceRef: p1CheckinOffset10,
      createdAt: new Date(nowMs - 14 * 24 * 60 * 60 * 1000),
      acknowledgedAt: new Date(nowMs - 13.8 * 24 * 60 * 60 * 1000),
      resolvedAt: new Date(nowMs - 13.5 * 24 * 60 * 60 * 1000),
      notificationStatus: "unknown",
      notificationAttemptedAt: new Date(nowMs - 13.95 * 24 * 60 * 60 * 1000),
    },
  ];
}

function buildCareEventsForAlert(
  alertId: string,
  definition: SeedAlertDefinition
): Array<Record<string, unknown>> {
  const events: Array<Record<string, unknown>> = [];
  const attemptedAt = definition.notificationAttemptedAt ?? minutesAfter(definition.createdAt, 2);

  const pushEvent = (
    type: string,
    at: Date,
    payload: Record<string, unknown> = {}
  ): void => {
    events.push({
      type,
      patientId: definition.patientId,
      alertId,
      payload: {
        ...payload,
        demoTag: DEMO_TAG,
      },
      demoTag: DEMO_TAG,
      createdAt: at,
      updatedAt: at,
    });
  };

  pushEvent("ALERT_CREATED", definition.createdAt, {
    reasonCode: definition.reason,
    status: definition.status,
  });
  pushEvent("NOTIFICATION_ATTEMPTED", attemptedAt, {
    channel: "telegram",
  });

  if (definition.notificationStatus === "failed") {
    pushEvent("NOTIFICATION_FAILED", definition.notificationFailedAt ?? minutesAfter(attemptedAt, 1), {
      errorCode: definition.notificationError ?? "NOTIFICATION_FAILED",
    });
  }

  if (definition.seenAt && definition.seenBy && definition.seenBy.length > 0) {
    pushEvent("ALERT_SEEN", definition.seenAt, {
      clinicianId: definition.seenBy[0],
    });
  }

  if (definition.assignedTo && definition.assignedAt) {
    pushEvent("ALERT_ASSIGNED", definition.assignedAt, {
      assignedTo: definition.assignedTo,
      assignedToName: definition.assignedToName,
    });
  }

  if (
    definition.riskFinal &&
    definition.overrideReason &&
    definition.overriddenBy &&
    definition.overriddenAt
  ) {
    pushEvent("ALERT_RISK_OVERRIDDEN", definition.overriddenAt, {
      riskFinal: definition.riskFinal,
      overrideReason: definition.overrideReason,
      overriddenBy: definition.overriddenBy,
      overriddenByName: definition.overriddenByName,
    });
  }

  if (definition.acknowledgedAt) {
    pushEvent("ALERT_ACKNOWLEDGED", definition.acknowledgedAt);
  }

  if (definition.resolvedAt) {
    pushEvent("ALERT_RESOLVED", definition.resolvedAt);
  }

  return events;
}

function buildPromInstanceSeedDocs(now: Date): Array<Record<string, unknown>> {
  const template = buildDefaultPromTemplate();
  const questionSnapshot = template.questions.map((question) => ({
    id: question.id,
    text: question.text,
    type: question.type,
    min: question.min,
    max: question.max,
    labels: question.labels,
    required: question.required !== false,
    reverse: question.reverse === true,
  }));

  const completedAtP2 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const completedAnswersP2 = [
    { questionId: "q1", value: 2 },
    { questionId: "q2", value: 2 },
    { questionId: "q3", value: 1 },
    { questionId: "q4", value: 2 },
    { questionId: "q5", value: 1 },
  ];
  const completedScoreP2 = computePromScore(template, completedAnswersP2);

  const completedAtP3 = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
  const completedAnswersP3 = [
    { questionId: "q1", value: 3 },
    { questionId: "q2", value: 4 },
    { questionId: "q3", value: 3 },
    { questionId: "q4", value: 3 },
    { questionId: "q5", value: 4 },
  ];
  const completedScoreP3 = computePromScore(template, completedAnswersP3);

  return [
    {
      patientId: "p1",
      templateKey: template.key,
      templateVersion: template.version,
      titleSnapshot: template.title,
      questionsSnapshot: questionSnapshot,
      dueAt: new Date(now.getTime() - 1 * 60 * 60 * 1000),
      status: "due",
      answers: [],
      score: null,
      demoTag: DEMO_TAG,
      createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
      updatedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
    },
    {
      patientId: "p2",
      templateKey: template.key,
      templateVersion: template.version,
      titleSnapshot: template.title,
      questionsSnapshot: questionSnapshot,
      dueAt: new Date(now.getTime() - 30 * 60 * 1000),
      status: "due",
      answers: [],
      score: null,
      demoTag: DEMO_TAG,
      createdAt: new Date(now.getTime() - 90 * 60 * 1000),
      updatedAt: new Date(now.getTime() - 90 * 60 * 1000),
    },
    {
      patientId: "p2",
      templateKey: template.key,
      templateVersion: template.version,
      titleSnapshot: template.title,
      questionsSnapshot: questionSnapshot,
      dueAt: new Date(completedAtP2.getTime() - 2 * 60 * 60 * 1000),
      status: "completed",
      completedAt: completedAtP2,
      answers: completedAnswersP2,
      score: completedScoreP2,
      demoTag: DEMO_TAG,
      createdAt: new Date(completedAtP2.getTime() - 3 * 60 * 60 * 1000),
      updatedAt: completedAtP2,
    },
    {
      patientId: "p3",
      templateKey: template.key,
      templateVersion: template.version,
      titleSnapshot: template.title,
      questionsSnapshot: questionSnapshot,
      dueAt: new Date(completedAtP3.getTime() - 90 * 60 * 1000),
      status: "completed",
      completedAt: completedAtP3,
      answers: completedAnswersP3,
      score: completedScoreP3,
      demoTag: DEMO_TAG,
      createdAt: new Date(completedAtP3.getTime() - 3 * 60 * 60 * 1000),
      updatedAt: completedAtP3,
    },
  ];
}

export async function seedDemoData(options: SeedOptions = {}): Promise<SeedSummary> {
  const now = options.now ? new Date(options.now) : new Date();
  const resetFirst = options.resetFirst ?? true;

  if (resetFirst) {
    await resetDemoData();
  }

  const clinicianUsersWithHashes = await Promise.all(
    DEMO_CLINICIAN_USERS.map(async (user) => ({
      ...user,
      passwordHash: await hashPassword(user.password),
    }))
  );

  await User.bulkWrite(
    clinicianUsersWithHashes.map((user) => ({
      updateOne: {
        filter: { email: user.email.toLowerCase() },
        update: {
          $set: {
            passwordHash: user.passwordHash,
            role: user.role,
            displayName: user.displayName,
            demoTag: DEMO_TAG,
          },
          $setOnInsert: {
            email: user.email.toLowerCase(),
          },
        },
        upsert: true,
      },
    })),
    { ordered: true }
  );

  await Patient.collection.bulkWrite(
    DEMO_PATIENTS.map((patient) => ({
      updateOne: {
        filter: { patientId: patient.patientId },
        update: {
          $set: {
            displayName: patient.displayName,
            accessCode: patient.accessCode,
            status: patient.status,
            clinicianId: patient.clinicianId,
            rehab: {
              ...recomputePhaseStatuses(
                buildDefaultPhases(),
                DEMO_REHAB_CURRENT_KEYS[patient.patientId],
                now
              ),
              updatedAt: now,
              updatedBy: {
                clinicianId: patient.clinicianId,
                name: getClinicianName(patient.clinicianId),
              },
            },
            demoTag: DEMO_TAG,
          },
          $setOnInsert: {
            patientId: patient.patientId,
          },
        } as Record<string, unknown>,
        upsert: true,
      },
    })),
    { ordered: true }
  );

  await ExercisePlan.collection.bulkWrite(
    DEMO_EXERCISE_PLANS.map((plan) => ({
      updateOne: {
        filter: { patientId: plan.patientId },
        update: {
          $set: {
            title: plan.title,
            daysOfWeek: [...plan.daysOfWeek],
            items: [...plan.items].map((item) => ({ ...item })),
            timezone: "UTC",
            version: 1,
            updatedBy: {
              clinicianId:
                plan.patientId === "p3" ? CLINICIANS.two.id : CLINICIANS.one.id,
              name: plan.patientId === "p3" ? CLINICIANS.two.name : CLINICIANS.one.name,
            },
            demoTag: DEMO_TAG,
          },
          $setOnInsert: {
            patientId: plan.patientId,
          },
        },
        upsert: true,
      },
    })),
    { ordered: true }
  );

  const promTemplate = buildDefaultPromTemplate();
  await PromTemplate.updateOne(
    { key: promTemplate.key },
    {
      $set: {
        title: promTemplate.title,
        description: promTemplate.description,
        version: promTemplate.version,
        questions: promTemplate.questions.map((question) => ({
          ...question,
          required: question.required !== false,
          reverse: question.reverse === true,
        })),
        scoring: {
          ...promTemplate.scoring,
          normalizeTo100: promTemplate.scoring.normalizeTo100 !== false,
        },
        demoTag: DEMO_TAG,
      },
      $setOnInsert: {
        key: promTemplate.key,
      },
    },
    { upsert: true }
  );

  await PromInstance.insertMany(buildPromInstanceSeedDocs(now), { ordered: true });

  const appointmentSeed = buildAppointmentSeed(now);
  const insertedAppointmentSlots = await AppointmentSlot.insertMany(
    appointmentSeed.slots.map((row) => row.doc),
    { ordered: true }
  );
  const appointmentSlotIdByKey = new Map<string, string>();
  appointmentSeed.slots.forEach((row, index) => {
    appointmentSlotIdByKey.set(row.slotKey, String(insertedAppointmentSlots[index]._id));
  });

  await AppointmentRequest.insertMany(
    appointmentSeed.requests.map((row) => ({
      ...row.doc,
      slotId: requireMappedId(
        appointmentSlotIdByKey,
        row.slotKey,
        `${row.patientId} appointment request slot`
      ),
    })),
    { ordered: true }
  );

  const medicationSeed = buildMedicationSeed(now);
  const insertedMedications = await Medication.insertMany(
    medicationSeed.medications.map((row) => row.doc),
    { ordered: true }
  );
  const medicationIdByKey = new Map<string, string>();
  medicationSeed.medications.forEach((row, index) => {
    medicationIdByKey.set(row.medKey, String(insertedMedications[index]._id));
  });

  await MedicationSchedule.insertMany(
    medicationSeed.schedules.map((row) => ({
      patientId: row.patientId,
      medicationId: requireMappedId(medicationIdByKey, row.medKey, `${row.patientId} schedule medication`),
      times: row.times,
      daysOfWeek: row.daysOfWeek ?? [0, 1, 2, 3, 4, 5, 6],
      startDate: row.startDate,
      endDate: row.endDate,
      demoTag: DEMO_TAG,
    })),
    { ordered: true }
  );

  await MedicationLog.insertMany(
    medicationSeed.logs.map((row) => ({
      ...row.doc,
      medicationId: requireMappedId(medicationIdByKey, row.medKey, `${row.patientId} medication log`),
    })),
    { ordered: true }
  );

  const checkInRows = buildCheckInRows(now);
  const hydrationRows = buildHydrationRows(now);
  const nutritionRows = buildNutritionRows(now);
  const wearableRows = buildWearableRows(now);
  const insertedCheckIns = await CheckIn.insertMany(checkInRows.map((row) => row.doc), {
    ordered: true,
  });
  await HydrationLog.insertMany(hydrationRows.map((row) => row.doc), {
    ordered: true,
  });
  await NutritionLog.insertMany(nutritionRows.map((row) => row.doc), {
    ordered: true,
  });
  await WearableDaily.insertMany(wearableRows.map((row) => row.doc), {
    ordered: true,
  });
  const checkInSourceIds = new Map<string, string>();
  checkInRows.forEach((row, index) => {
    checkInSourceIds.set(`${row.patientId}:${row.dayOffset}`, String(insertedCheckIns[index]._id));
  });

  const chatRows = buildChatRows(now);
  const insertedChatMessages = await ChatMessage.insertMany(chatRows.map((row) => row.doc), {
    ordered: true,
  });
  const chatSourceIds = new Map<string, string>();
  chatRows.forEach((row, index) => {
    chatSourceIds.set(`${row.patientId}:${row.slot}`, String(insertedChatMessages[index]._id));
  });

  const alertDefinitions = buildAlertDefinitions(now, checkInSourceIds, chatSourceIds);
  const insertedAlerts = await Alert.insertMany(
    alertDefinitions.map((definition) => ({
      patientId: definition.patientId,
      risk: "high",
      reason: definition.reason,
      source: {
        type: definition.sourceType,
        sourceId: definition.sourceRef,
      },
      status: definition.status,
      acknowledgedAt: definition.acknowledgedAt,
      resolvedAt: definition.resolvedAt,
      seenAt: definition.seenAt,
      seenBy: definition.seenBy ?? [],
      assignedTo: definition.assignedTo,
      assignedToName: definition.assignedToName,
      assignedAt: definition.assignedAt,
      riskFinal: definition.riskFinal,
      overrideReason: definition.overrideReason,
      overriddenBy: definition.overriddenBy,
      overriddenByName: definition.overriddenByName,
      overriddenAt: definition.overriddenAt,
      notification: {
        channel: "telegram",
        status: definition.notificationStatus ?? "unknown",
        attemptedAt:
          definition.notificationAttemptedAt ?? minutesAfter(definition.createdAt, 2),
        failedAt: definition.notificationFailedAt,
        error: definition.notificationError,
        retryCount: definition.notificationStatus === "failed" ? 1 : 0,
      },
      demoTag: DEMO_TAG,
      createdAt: definition.createdAt,
      updatedAt: minutesAfter(definition.createdAt, 3),
    })),
    { ordered: true }
  );

  const careEventDocs = insertedAlerts.flatMap((alert, index) =>
    buildCareEventsForAlert(String(alert._id), alertDefinitions[index])
  );
  await CareEvent.insertMany(careEventDocs, { ordered: true });

  const [
    patients,
    checkIns,
    appointmentSlots,
    appointmentRequests,
    hydrationLogs,
    nutritionLogs,
    wearableDailies,
    medications,
    medicationSchedules,
    medicationLogs,
    chatMessages,
    alerts,
    careEvents,
    exercisePlans,
    promTemplates,
    promInstances,
  ] = await Promise.all([
    Patient.countDocuments({ demoTag: DEMO_TAG }),
    CheckIn.countDocuments({ demoTag: DEMO_TAG }),
    AppointmentSlot.countDocuments({ demoTag: DEMO_TAG }),
    AppointmentRequest.countDocuments({ demoTag: DEMO_TAG }),
    HydrationLog.countDocuments({ demoTag: DEMO_TAG }),
    NutritionLog.countDocuments({ demoTag: DEMO_TAG }),
    WearableDaily.countDocuments({ demoTag: DEMO_TAG }),
    Medication.countDocuments({ demoTag: DEMO_TAG }),
    MedicationSchedule.countDocuments({ demoTag: DEMO_TAG }),
    MedicationLog.countDocuments({ demoTag: DEMO_TAG }),
    ChatMessage.countDocuments({ demoTag: DEMO_TAG }),
    Alert.countDocuments({ demoTag: DEMO_TAG }),
    CareEvent.countDocuments({ demoTag: DEMO_TAG }),
    ExercisePlan.countDocuments({ demoTag: DEMO_TAG }),
    PromTemplate.countDocuments({ demoTag: DEMO_TAG }),
    PromInstance.countDocuments({ demoTag: DEMO_TAG }),
  ]);

  const statusCounts = seedStatusCounts(alertDefinitions.map((definition) => definition.status));
  if (statusCounts.open < 3 || statusCounts.acknowledged < 2 || statusCounts.resolved < 1) {
    throw new Error("Seed status lifecycle constraints were not satisfied.");
  }

  return {
    patients,
    checkIns,
    appointmentSlots,
    appointmentRequests,
    hydrationLogs,
    nutritionLogs,
    wearableDailies,
    medications,
    medicationSchedules,
    medicationLogs,
    chatMessages,
    alerts,
    careEvents,
    exercisePlans,
    promTemplates,
    promInstances,
  };
}

export { DEMO_TAG };
