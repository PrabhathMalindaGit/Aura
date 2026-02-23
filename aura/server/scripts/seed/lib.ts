import Alert from "../../src/models/Alert";
import CareEvent from "../../src/models/CareEvent";
import ChatMessage from "../../src/models/ChatMessage";
import CheckIn from "../../src/models/CheckIn";
import Patient from "../../src/models/Patient";
import User from "../../src/models/User";
import { hashPassword } from "../../src/utils/password";

import {
  ASSISTANT_CHAT_TEXTS,
  CHAT_MESSAGES_PER_PATIENT,
  CHECKIN_WINDOW_DAYS,
  CLINICIANS,
  DEMO_CLINICIAN_USERS,
  DEMO_PATIENTS,
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

export async function resetDemoData(): Promise<ResetSummary> {
  const [
    careEventsDeleted,
    alertsDeleted,
    chatMessagesDeleted,
    checkInsDeleted,
    patientsDeleted,
    usersDeleted,
  ] = await Promise.all([
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
    chatMessagesDeleted: chatMessagesDeleted.deletedCount ?? 0,
    alertsDeleted: alertsDeleted.deletedCount ?? 0,
    careEventsDeleted: careEventsDeleted.deletedCount ?? 0,
  };
}

function buildCheckInRows(now: Date): CheckInSeedRow[] {
  const rows: CheckInSeedRow[] = [];
  const rng = mulberry32(RNG_SEED);
  const baseDay = utcDay(now);

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

      const notes = hasNote
        ? patient.patientId === "p3"
          ? "Routine completed as planned."
          : "Knee feels tight after activity."
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

  await Patient.bulkWrite(
    DEMO_PATIENTS.map((patient) => ({
      updateOne: {
        filter: { patientId: patient.patientId },
        update: {
          $set: {
            displayName: patient.displayName,
            accessCode: patient.accessCode,
            status: patient.status,
            clinicianId: patient.clinicianId,
            demoTag: DEMO_TAG,
          },
          $setOnInsert: {
            patientId: patient.patientId,
          },
        },
        upsert: true,
      },
    })),
    { ordered: true }
  );

  const checkInRows = buildCheckInRows(now);
  const insertedCheckIns = await CheckIn.insertMany(checkInRows.map((row) => row.doc), {
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

  const [patients, checkIns, chatMessages, alerts, careEvents] = await Promise.all([
    Patient.countDocuments({ demoTag: DEMO_TAG }),
    CheckIn.countDocuments({ demoTag: DEMO_TAG }),
    ChatMessage.countDocuments({ demoTag: DEMO_TAG }),
    Alert.countDocuments({ demoTag: DEMO_TAG }),
    CareEvent.countDocuments({ demoTag: DEMO_TAG }),
  ]);

  const statusCounts = seedStatusCounts(alertDefinitions.map((definition) => definition.status));
  if (statusCounts.open < 3 || statusCounts.acknowledged < 2 || statusCounts.resolved < 1) {
    throw new Error("Seed status lifecycle constraints were not satisfied.");
  }

  return {
    patients,
    checkIns,
    chatMessages,
    alerts,
    careEvents,
  };
}

export { DEMO_TAG };
