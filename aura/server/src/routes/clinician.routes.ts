import { Router } from "express";
import { z } from "zod";

import Alert from "../models/Alert";
import CareEvent from "../models/CareEvent";
import ChatMessage from "../models/ChatMessage";
import CheckIn from "../models/CheckIn";
import Patient from "../models/Patient";
import {
  COORDINATION_NOTE_MAX_LENGTH,
  COORDINATION_NEXT_STEP_VALUES,
  COORDINATION_OWNER_LABEL_MAX_LENGTH,
  COORDINATION_SUMMARY_MAX_LENGTH,
} from "../models/ClinicianCoordination";
import { validateBody } from "../middleware/validate";
import type { RequestWithUser } from "../types/auth";
import { env } from "../env";
import {
  AlertNotificationRetryThrottleError,
  dispatchJob,
  NOTIFICATION_RETRY_AFTER_SECONDS,
  requestAlertNotificationRetry,
} from "../services/alertNotificationService";
import {
  appendClinicianCoordinationNote,
  ClinicianCoordinationValidationError,
  getClinicianCoordinationByPatient,
  saveClinicianCurrentHandoff,
  type CoordinationAuthorSnapshot,
  type CoordinationFollowUpOwner,
} from "../services/clinicianCoordinationService";
import { isObjectId } from "../utils/ids";
import { logger } from "../utils/logger";

const router = Router();

const alertStatusSchema = z.enum(["open", "acknowledged", "resolved"]);
const patientStatusFilterSchema = z.enum([
  "active",
  "on_hold",
  "discharged",
  "inactive",
  "all",
]);
const patchSchema = z.object({
  status: z.enum(["acknowledged", "resolved"]),
});
const seenSchema = z.object({
  clinicianId: z.string().trim().min(1).optional(),
  clinicianName: z.string().trim().min(1).optional(),
});
const assignmentSchema = z.object({
  assignedTo: z.union([z.string().trim().min(1), z.null()]).optional(),
  assignedToName: z.string().trim().min(1).optional(),
  requestedBy: z.string().trim().min(1).optional(),
  requestedByName: z.string().trim().min(1).optional(),
  force: z.boolean().optional().default(false),
});
const riskOverrideSchema = z.object({
  riskFinal: z.enum(["low", "medium", "high"]),
  overrideReason: z.string().trim().min(3),
  overriddenBy: z.string().trim().min(1).optional(),
  overriddenByName: z.string().trim().min(1).optional(),
});
const retryNotificationSchema = z.object({
  channel: z.enum(["telegram"]).optional().default("telegram"),
  requestedBy: z.string().trim().min(1).optional(),
  requestedByName: z.string().trim().min(1).optional(),
  reason: z.string().trim().max(200).optional(),
});
const listPatientsQuerySchema = z.object({
  status: patientStatusFilterSchema.optional().default("all"),
  clinicianId: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().positive().optional(),
});
const trendsQuerySchema = z.object({
  days: z.enum(["14", "30"]).optional().default("14"),
});
const checkinsRangeQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  includeNotes: z.enum(["true", "false"]).optional().default("false"),
});
const patchPatientSchema = z
  .object({
    displayName: z.string().trim().min(1).max(80).optional(),
    status: z.enum(["active", "on_hold", "discharged", "inactive"]).optional(),
    clinicianId: z.string().trim().min(1).max(80).optional(),
    requestedBy: z.string().trim().min(1).max(80).optional(),
    requestedByName: z.string().trim().min(1).max(80).optional(),
  })
  .refine(
    (value) =>
      value.displayName !== undefined ||
      value.status !== undefined ||
      value.clinicianId !== undefined,
    {
      path: ["body"],
      message: "At least one field must be provided",
    }
  );

const coordinationFollowUpOwnerSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("unassigned"),
  }),
  z.object({
    kind: z.literal("clinician"),
    clinicianId: z.string().trim().min(1).max(120),
    displayName: z.string().trim().min(1).max(120),
  }),
  z.object({
    kind: z.literal("custom"),
    label: z.string().trim().min(1).max(COORDINATION_OWNER_LABEL_MAX_LENGTH),
  }),
]);

const coordinationCurrentHandoffSchema = z.object({
  summary: z.string().trim().max(COORDINATION_SUMMARY_MAX_LENGTH).optional(),
  nextStep: z.enum(COORDINATION_NEXT_STEP_VALUES).optional(),
  followUpOwner: coordinationFollowUpOwnerSchema.optional(),
  linkedTaskId: z.union([z.string().trim().min(1).max(120), z.null()]).optional(),
  updatedBy: z.string().trim().min(1).max(120).optional(),
  updatedByName: z.string().trim().min(1).max(120).optional(),
});

const coordinationAppendNoteSchema = z.object({
  text: z.string().trim().min(1).max(COORDINATION_NOTE_MAX_LENGTH),
  createdBy: z.string().trim().min(1).max(120).optional(),
  createdByName: z.string().trim().min(1).max(120).optional(),
});

const DEFAULT_PATIENTS_LIMIT = 200;
const MAX_PATIENTS_LIMIT = 500;
const MISSED_CHECKINS_DAYS = 2;
const MISSED_CHECKINS_MS = MISSED_CHECKINS_DAYS * 24 * 60 * 60 * 1000;
const TRENDS_MAX_RECORDS = 2000;
const CHECKINS_MAX_RECORDS = 2000;
const CHECKINS_MAX_RANGE_DAYS = 366;
const NOTES_PREVIEW_MAX_LENGTH = 120;
const CHAT_CONTEXT_WINDOW_SIDE_SIZE = 2;
const TIMELINE_STRIP_KEYS = new Set(["text", "notes", "message", "content"]);
const NOTIFICATION_CHANNELS = new Set([
  "telegram",
  "email",
  "slack",
  "sms",
  "none",
]);
const NOTIFICATION_STATUSES = new Set(["unknown", "sent", "failed", "skipped"]);

type LatestCheckInAggregateRow = {
  _id: string;
  lastCheckinAt?: Date;
  lastPain?: number;
};

type AlertAggregateRow = {
  _id: string;
  openAlertCount: number;
  lastAlertAt?: Date;
};

type PatientSummary = {
  id: string;
  displayName?: string;
  status: "active" | "on_hold" | "discharged" | "inactive";
  clinicianId?: string;
  lastCheckinAt?: string;
  lastPain?: number;
  openAlertCount: number;
  lastAlertAt?: string;
  missedCheckins: boolean;
};

type PatientProfile = {
  patientId: string;
  displayName?: string;
  status?: "active" | "on_hold" | "discharged" | "inactive";
  clinicianId?: string;
  createdAt?: Date;
  updatedAt?: Date;
};

type ClinicianActor = {
  id: string;
  name?: string;
};

function hasAuthHeader(req: RequestWithUser): boolean {
  const header = req.header("authorization");
  return Boolean(header && header.trim());
}

function resolveClinicianActor(
  req: RequestWithUser,
  legacyId?: string,
  legacyName?: string
): ClinicianActor | null {
  if (req.user) {
    return {
      id: req.user.id,
      name: req.user.name,
    };
  }

  if (!env.ALLOW_UNAUTH_CLINICIAN_BODY_IDS || hasAuthHeader(req)) {
    return null;
  }

  if (!legacyId || !legacyId.trim()) {
    return null;
  }

  return {
    id: legacyId.trim(),
    name: legacyName?.trim() || undefined,
  };
}

function mapCoordinationAuthor(
  actor: CoordinationAuthorSnapshot
): CoordinationAuthorSnapshot {
  return {
    clinicianId: actor.clinicianId,
    displayName: actor.displayName,
  };
}

function mapCoordinationFollowUpOwner(
  owner: CoordinationFollowUpOwner
): CoordinationFollowUpOwner {
  if (owner.kind === "clinician") {
    return {
      kind: "clinician",
      clinicianId: owner.clinicianId,
      displayName: owner.displayName,
    };
  }

  if (owner.kind === "custom") {
    return {
      kind: "custom",
      label: owner.label,
    };
  }

  return { kind: "unassigned" };
}

function toCoordinationFollowUpOwnerInput(
  value:
    | z.infer<typeof coordinationFollowUpOwnerSchema>
    | undefined
): CoordinationFollowUpOwner | undefined {
  if (!value || value.kind === "unassigned") {
    return value ? { kind: "unassigned" } : undefined;
  }

  if (value.kind === "custom") {
    return {
      kind: "custom",
      label: value.label,
    };
  }

  return {
    kind: "clinician",
    clinicianId: value.clinicianId,
    displayName: value.displayName,
  };
}

function mapCoordinationRecord(
  coordination: Awaited<ReturnType<typeof getClinicianCoordinationByPatient>>
) {
  if (!coordination) {
    return null;
  }

  return {
    patientId: coordination.patientId,
    currentHandoff: coordination.currentHandoff
      ? {
          summary: coordination.currentHandoff.summary,
          nextStep: coordination.currentHandoff.nextStep,
          followUpOwner: mapCoordinationFollowUpOwner(
            coordination.currentHandoff.followUpOwner
          ),
          linkedTaskId: coordination.currentHandoff.linkedTaskId,
          linkedTask: coordination.currentHandoff.linkedTask
            ? {
                id: coordination.currentHandoff.linkedTask.id,
                title: coordination.currentHandoff.linkedTask.title,
                type: coordination.currentHandoff.linkedTask.type,
                priority: coordination.currentHandoff.linkedTask.priority,
                status: coordination.currentHandoff.linkedTask.status,
                dueAt: coordination.currentHandoff.linkedTask.dueAt,
                assignedTo: coordination.currentHandoff.linkedTask.assignedTo,
                source: coordination.currentHandoff.linkedTask.source,
                updatedAt: coordination.currentHandoff.linkedTask.updatedAt,
              }
            : coordination.currentHandoff.linkedTaskId
              ? null
              : undefined,
          updatedBy: mapCoordinationAuthor(coordination.currentHandoff.updatedBy),
          updatedAt: coordination.currentHandoff.updatedAt,
        }
      : null,
    noteHistory: coordination.noteHistory.map((note) => ({
      id: note.id,
      text: note.text,
      createdBy: mapCoordinationAuthor(note.createdBy),
      createdAt: note.createdAt,
    })),
    createdAt: coordination.createdAt,
    updatedAt: coordination.updatedAt,
  };
}

function toIsoDateString(value?: Date): string | undefined {
  if (!value) {
    return undefined;
  }

  return value.toISOString();
}

function parsePatientIdParam(
  patientIdParam: unknown
): { patientId?: string; details?: Array<{ path: string; message: string }> } {
  const patientId =
    typeof patientIdParam === "string" ? patientIdParam.trim() : "";

  if (!patientId || patientId.length > 64) {
    return {
      details: [
        {
          path: "patientId",
          message: "patientId is required and must be at most 64 characters",
        },
      ],
    };
  }

  return { patientId };
}

function toDate(value: unknown): Date | undefined {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return undefined;
}

function toNotesPreview(notes: unknown): string | undefined {
  if (typeof notes !== "string") {
    return undefined;
  }

  const trimmed = notes.trim();
  if (!trimmed) {
    return undefined;
  }

  if (trimmed.length <= NOTES_PREVIEW_MAX_LENGTH) {
    return trimmed;
  }

  return `${trimmed.slice(0, NOTES_PREVIEW_MAX_LENGTH)}…`;
}

function parseDateOnly(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
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

function getInclusiveDayCount(from: Date, to: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((to.getTime() - from.getTime()) / msPerDay) + 1;
}

function toIsoDateStringOrNull(value: unknown): string | null {
  const parsed = toDate(value);
  if (!parsed) {
    return null;
  }

  return parsed.toISOString();
}

function toIsoDateStringRequired(value: unknown): string {
  return toIsoDateStringOrNull(value) ?? new Date(0).toISOString();
}

function toStringOrNull(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function toNumberOrNull(value: unknown): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }

  return value;
}

function mapBodyMap(value: unknown):
  | {
      primaryRegion?: string;
      regions: Array<{
        region: string;
        intensity: number;
        type: string;
      }>;
    }
  | undefined {
  const bodyMapRecord =
    value && typeof value === "object"
      ? (value as { regions?: unknown })
      : undefined;

  if (!bodyMapRecord || !Array.isArray(bodyMapRecord.regions)) {
    return undefined;
  }

  const regions = bodyMapRecord.regions
    .map((entry) => {
      const row =
        entry && typeof entry === "object"
          ? (entry as { region?: unknown; intensity?: unknown; type?: unknown })
          : undefined;
      const region = toStringOrNull(row?.region);
      const intensity = toNumberOrNull(row?.intensity);
      const type = toStringOrNull(row?.type);
      if (!region || intensity === null || !type) {
        return null;
      }
      return {
        region,
        intensity,
        type,
      };
    })
    .filter(
      (
        region
      ): region is {
        region: string;
        intensity: number;
        type: string;
      } => Boolean(region)
    );

  if (regions.length === 0) {
    return undefined;
  }

  return {
    primaryRegion: toStringOrNull(
      value && typeof value === "object"
        ? (value as { primaryRegion?: unknown }).primaryRegion
        : undefined
    ) ?? undefined,
    regions,
  };
}

function mapSymptomFlags(value: unknown):
  | {
      flags: string[];
    }
  | undefined {
  const symptomRecord =
    value && typeof value === "object" ? (value as { flags?: unknown }) : undefined;

  if (!symptomRecord || !Array.isArray(symptomRecord.flags)) {
    return undefined;
  }

  const flags = symptomRecord.flags.filter(
    (entry): entry is string => typeof entry === "string" && entry.trim().length > 0
  );

  return flags.length > 0 ? { flags } : undefined;
}

function mapRecovery(value: unknown):
  | {
      difficultyLevel?: number | null;
      confidenceLevel?: number | null;
      mobilityLevel?: number | null;
    }
  | undefined {
  const recoveryRecord =
    value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;

  if (!recoveryRecord) {
    return undefined;
  }

  const difficultyLevel = toNumberOrNull(recoveryRecord.difficultyLevel);
  const confidenceLevel = toNumberOrNull(recoveryRecord.confidenceLevel);
  const mobilityLevel = toNumberOrNull(recoveryRecord.mobilityLevel);

  if (
    difficultyLevel === null &&
    confidenceLevel === null &&
    mobilityLevel === null
  ) {
    return undefined;
  }

  return {
    difficultyLevel,
    confidenceLevel,
    mobilityLevel,
  };
}

function mapSupport(value: unknown):
  | {
      stressLevel?: number | null;
      feelsSafe?: boolean | null;
      wantsFollowUp?: boolean | null;
      wantsExtraSupport?: boolean | null;
      needsUrgentHelp?: boolean | null;
    }
  | undefined {
  const supportRecord =
    value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;

  if (!supportRecord) {
    return undefined;
  }

  const stressLevel = toNumberOrNull(supportRecord.stressLevel);
  const feelsSafe =
    typeof supportRecord.feelsSafe === "boolean" ? supportRecord.feelsSafe : null;
  const wantsFollowUp =
    typeof supportRecord.wantsFollowUp === "boolean"
      ? supportRecord.wantsFollowUp
      : null;
  const wantsExtraSupport =
    typeof supportRecord.wantsExtraSupport === "boolean"
      ? supportRecord.wantsExtraSupport
      : null;
  const needsUrgentHelp =
    typeof supportRecord.needsUrgentHelp === "boolean"
      ? supportRecord.needsUrgentHelp
      : null;

  if (
    stressLevel === null &&
    feelsSafe === null &&
    wantsFollowUp === null &&
    wantsExtraSupport === null &&
    needsUrgentHelp === null
  ) {
    return undefined;
  }

  return {
    stressLevel,
    feelsSafe,
    wantsFollowUp,
    wantsExtraSupport,
    needsUrgentHelp,
  };
}

function mapDailySignals(value: unknown):
  | {
      hydrationLevel?: number | null;
      energyLevel?: number | null;
    }
  | undefined {
  const dailySignalsRecord =
    value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;

  if (!dailySignalsRecord) {
    return undefined;
  }

  const hydrationLevel = toNumberOrNull(dailySignalsRecord.hydrationLevel);
  const energyLevel = toNumberOrNull(dailySignalsRecord.energyLevel);

  if (hydrationLevel === null && energyLevel === null) {
    return undefined;
  }

  return {
    hydrationLevel,
    energyLevel,
  };
}

function sanitizePayload(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  if (Array.isArray(payload)) {
    return payload.map((entry) => sanitizePayload(entry));
  }

  const recordPayload = payload as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};

  Object.entries(recordPayload).forEach(([key, value]) => {
    if (TIMELINE_STRIP_KEYS.has(key)) {
      return;
    }
    sanitized[key] = sanitizePayload(value);
  });

  return sanitized;
}

function mapAlertNotification(notification: unknown) {
  const notificationRecord =
    notification && typeof notification === "object"
      ? (notification as Record<string, unknown>)
      : {};

  const channelRaw = toStringOrNull(notificationRecord.channel);
  const statusRaw = toStringOrNull(notificationRecord.status);
  const retryCount =
    typeof notificationRecord.retryCount === "number" &&
    Number.isFinite(notificationRecord.retryCount) &&
    notificationRecord.retryCount >= 0
      ? notificationRecord.retryCount
      : 0;

  return {
    channel:
      channelRaw && NOTIFICATION_CHANNELS.has(channelRaw)
        ? channelRaw
        : "telegram",
    status:
      statusRaw && NOTIFICATION_STATUSES.has(statusRaw)
        ? statusRaw
        : "unknown",
    attemptedAt: toIsoDateStringOrNull(notificationRecord.attemptedAt),
    sentAt: toIsoDateStringOrNull(notificationRecord.sentAt),
    failedAt: toIsoDateStringOrNull(notificationRecord.failedAt),
    target: toStringOrNull(notificationRecord.target),
    messageId: toStringOrNull(notificationRecord.messageId),
    error: toStringOrNull(notificationRecord.error),
    retryCount,
  };
}

function mapAlertContextAlert(alert: Record<string, unknown>) {
  const sourceRecord =
    alert.source && typeof alert.source === "object"
      ? (alert.source as Record<string, unknown>)
      : {};
  const reason = Array.isArray(alert.reason)
    ? alert.reason.filter((value): value is string => typeof value === "string")
    : typeof alert.reason === "string"
      ? alert.reason
      : "";
  const status =
    alert.status === "acknowledged" || alert.status === "resolved"
      ? alert.status
      : "open";
  const sourceType = sourceRecord.type === "chat" ? "chat" : "checkin";

  return {
    _id: String(alert._id ?? ""),
    patientId: toStringOrNull(alert.patientId) ?? "",
    risk: toStringOrNull(alert.risk) ?? "",
    reason,
    source: {
      type: sourceType,
      sourceId: toStringOrNull(sourceRecord.sourceId) ?? "",
    },
    status,
    createdAt: toIsoDateStringRequired(alert.createdAt),
    updatedAt: toIsoDateStringRequired(alert.updatedAt),
    acknowledgedAt: toIsoDateStringOrNull(alert.acknowledgedAt),
    resolvedAt: toIsoDateStringOrNull(alert.resolvedAt),
    seenAt: toIsoDateStringOrNull(alert.seenAt),
    seenBy: toStringArray(alert.seenBy),
    assignedTo: toStringOrNull(alert.assignedTo),
    assignedToName: toStringOrNull(alert.assignedToName),
    assignedAt: toIsoDateStringOrNull(alert.assignedAt),
    riskFinal: toStringOrNull(alert.riskFinal),
    overrideReason: toStringOrNull(alert.overrideReason),
    overriddenBy: toStringOrNull(alert.overriddenBy),
    overriddenByName: toStringOrNull(alert.overriddenByName),
    overriddenAt: toIsoDateStringOrNull(alert.overriddenAt),
    notification: mapAlertNotification(alert.notification),
  };
}

function mapAssignmentCurrent(alert: Record<string, unknown>) {
  return {
    assignedTo: toStringOrNull(alert.assignedTo),
    assignedToName: toStringOrNull(alert.assignedToName),
    assignedAt: toIsoDateStringOrNull(alert.assignedAt),
  };
}

function mapPatientProfile(patient: PatientProfile) {
  return {
    patientId: toStringOrNull(patient.patientId) ?? "",
    displayName: toStringOrNull(patient.displayName),
    status: patient.status ?? "active",
    clinicianId: toStringOrNull(patient.clinicianId),
    createdAt: toIsoDateStringRequired(patient.createdAt),
    updatedAt: toIsoDateStringRequired(patient.updatedAt),
  };
}

function mapCheckinSnapshot(checkin: Record<string, unknown>) {
  const adherenceRecord =
    checkin.adherence && typeof checkin.adherence === "object"
      ? (checkin.adherence as Record<string, unknown>)
      : {};
  const riskRecord =
    checkin.risk && typeof checkin.risk === "object"
      ? (checkin.risk as Record<string, unknown>)
      : undefined;

  return {
    id: String(checkin._id ?? ""),
    date: toStringOrNull(checkin.date) ?? "",
    pain: toNumberOrNull(checkin.pain),
    mood: toNumberOrNull(checkin.mood),
    symptoms: mapSymptomFlags(checkin.symptoms),
    adherence: {
      exercises: toNumberOrNull(adherenceRecord.exercises),
      medication:
        typeof adherenceRecord.medication === "boolean"
          ? adherenceRecord.medication
          : null,
      medicationStatus: toStringOrNull(adherenceRecord.medicationStatus),
      medicationReason: toStringOrNull(adherenceRecord.medicationReason),
    },
    recovery: mapRecovery(checkin.recovery),
    support: mapSupport(checkin.support),
    notes: toStringOrNull(checkin.notes) ?? undefined,
    bodyMap: mapBodyMap(checkin.bodyMap),
    dailySignals: mapDailySignals(checkin.dailySignals),
    risk: riskRecord
      ? {
          level: toStringOrNull(riskRecord.level),
          reasons: toStringArray(riskRecord.reasons),
        }
      : undefined,
    createdAt: toIsoDateStringRequired(checkin.createdAt),
  };
}

function mapChatWindowMessage(message: Record<string, unknown>) {
  const riskRecord =
    message.risk && typeof message.risk === "object"
      ? (message.risk as Record<string, unknown>)
      : undefined;

  return {
    id: String(message._id ?? ""),
    createdAt: toIsoDateStringRequired(message.createdAt),
    role:
      message.role === "assistant" || message.role === "system"
        ? message.role
        : "user",
    text: toStringOrNull(message.text) ?? "",
    risk: riskRecord
      ? {
          level: toStringOrNull(riskRecord.level),
          reasons: toStringArray(riskRecord.reasons),
        }
      : undefined,
  };
}

router.get("/clinician/alerts", async (req, res) => {
  try {
    const rawStatus = (req.query.status as string | undefined) ?? "open";
    const parsedStatus = alertStatusSchema.safeParse(rawStatus);

    if (!parsedStatus.success) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        details: parsedStatus.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    const alerts = await Alert.find({ status: parsedStatus.data })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    return res.json({
      ok: true,
      alerts,
    });
  } catch (error) {
    logger.error("Get alerts route failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({
      ok: false,
      error: "INTERNAL_ERROR",
      message: "Something went wrong",
    });
  }
});

router.get("/clinician/alerts/:id/context", async (req, res) => {
  const alertId = typeof req.params.id === "string" ? req.params.id : "";

  if (!isObjectId(alertId)) {
    return res.status(400).json({
      ok: false,
      error: "VALIDATION_ERROR",
      details: [
        {
          path: "id",
          message: "Invalid alert id",
        },
      ],
    });
  }

  try {
    const alert = await Alert.findById(alertId).lean();

    if (!alert) {
      return res.status(404).json({
        ok: false,
        error: "NOT_FOUND",
      });
    }

    let triggering:
      | null
      | { type: "checkin"; checkin: ReturnType<typeof mapCheckinSnapshot> }
      | { type: "chat"; messageWindow: ReturnType<typeof mapChatWindowMessage>[] } =
      null;

    const alertSource =
      alert.source && typeof alert.source === "object"
        ? (alert.source as Record<string, unknown>)
        : undefined;
    const sourceType = alertSource?.type;
    const sourceId =
      alertSource && typeof alertSource.sourceId === "string"
        ? alertSource.sourceId
        : "";

    if (sourceType === "checkin" && isObjectId(sourceId)) {
      const checkin = await CheckIn.findById(sourceId).lean();
      if (checkin) {
        triggering = {
          type: "checkin",
          checkin: mapCheckinSnapshot(checkin as unknown as Record<string, unknown>),
        };
      }
    }

    if (sourceType === "chat" && isObjectId(sourceId)) {
      const targetMessage = await ChatMessage.findById(sourceId).lean();
      if (targetMessage) {
        const patientId =
          typeof targetMessage.patientId === "string"
            ? targetMessage.patientId
            : "";
        const createdAt = toDate(targetMessage.createdAt);

        let beforeMessages: Record<string, unknown>[] = [];
        let afterMessages: Record<string, unknown>[] = [];

        if (patientId && createdAt) {
          const [beforeRaw, afterRaw] = await Promise.all([
            ChatMessage.find({
              patientId,
              createdAt: { $lt: createdAt },
            })
              .sort({ createdAt: -1 })
              .limit(CHAT_CONTEXT_WINDOW_SIDE_SIZE)
              .lean(),
            ChatMessage.find({
              patientId,
              createdAt: { $gt: createdAt },
            })
              .sort({ createdAt: 1 })
              .limit(CHAT_CONTEXT_WINDOW_SIDE_SIZE)
              .lean(),
          ]);

          beforeMessages = beforeRaw as unknown as Record<string, unknown>[];
          afterMessages = afterRaw as unknown as Record<string, unknown>[];
        }

        const windowMessages = [
          ...beforeMessages.reverse(),
          targetMessage as unknown as Record<string, unknown>,
          ...afterMessages,
        ]
          .slice(0, CHAT_CONTEXT_WINDOW_SIDE_SIZE * 2 + 1)
          .map((message) => mapChatWindowMessage(message));

        triggering = {
          type: "chat",
          messageWindow: windowMessages,
        };
      }
    }

    const careEvents = await CareEvent.find({
      alertId: String(alert._id),
    })
      .sort({ createdAt: 1 })
      .lean();

    const timeline = careEvents.map((event) => {
      const eventRecord = event as unknown as Record<string, unknown>;
      return {
        id: String(eventRecord._id ?? ""),
        type: toStringOrNull(eventRecord.type) ?? "UNKNOWN",
        createdAt: toIsoDateStringRequired(eventRecord.createdAt),
        payload: sanitizePayload(eventRecord.payload) ?? {},
      };
    });

    return res.json({
      ok: true,
      alert: mapAlertContextAlert(alert as unknown as Record<string, unknown>),
      triggering,
      timeline,
    });
  } catch (error) {
    logger.error("Get alert context route failed", {
      route: "GET /clinician/alerts/:id/context",
      alertId,
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({
      ok: false,
      error: "INTERNAL_ERROR",
    });
  }
});

router.get("/clinician/patients", async (req, res) => {
  try {
    const parsedQuery = listPatientsQuerySchema.safeParse(req.query);

    if (!parsedQuery.success) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        details: parsedQuery.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    const statusFilter = parsedQuery.data.status;
    const clinicianFilter = parsedQuery.data.clinicianId;
    const requestedLimit = parsedQuery.data.limit ?? DEFAULT_PATIENTS_LIMIT;
    const limit = Math.min(MAX_PATIENTS_LIMIT, Math.max(1, requestedLimit));

    logger.info("GET /clinician/patients", {
      status: statusFilter,
      hasClinicianFilter: Boolean(clinicianFilter),
      limit,
    });

    const [latestCheckIns, alertStats] = await Promise.all([
      CheckIn.aggregate<LatestCheckInAggregateRow>([
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: "$patientId",
            lastCheckinAt: { $first: "$createdAt" },
            lastPain: { $first: "$pain" },
          },
        },
      ]),
      Alert.aggregate<AlertAggregateRow>([
        {
          $group: {
            _id: "$patientId",
            openAlertCount: {
              $sum: {
                $cond: [{ $eq: ["$status", "open"] }, 1, 0],
              },
            },
            lastAlertAt: { $max: "$createdAt" },
          },
        },
      ]),
    ]);

    const patientIds = new Set<string>();

    latestCheckIns.forEach((row) => {
      if (typeof row._id === "string" && row._id.length > 0) {
        patientIds.add(row._id);
      }
    });

    alertStats.forEach((row) => {
      if (typeof row._id === "string" && row._id.length > 0) {
        patientIds.add(row._id);
      }
    });

    if (patientIds.size === 0) {
      return res.json({
        ok: true,
        patients: [],
      });
    }

    const patientIdList = Array.from(patientIds);

    const [profiles] = await Promise.all([
      Patient.find({ patientId: { $in: patientIdList } }).lean(),
    ]);

    const profileMap = new Map(
      profiles.map((profile) => [profile.patientId, profile])
    );
    const latestCheckInMap = new Map(
      latestCheckIns.map((row) => [row._id, row])
    );
    const alertStatsMap = new Map(alertStats.map((row) => [row._id, row]));
    const nowMs = Date.now();

    const mergedPatients: PatientSummary[] = patientIdList.map((patientId) => {
      const profile = profileMap.get(patientId);
      const latestCheckIn = latestCheckInMap.get(patientId);
      const patientAlerts = alertStatsMap.get(patientId);

      const normalizedStatus =
        (profile?.status as
          | "active"
          | "on_hold"
          | "discharged"
          | "inactive"
          | undefined) ?? "active";
      const lastCheckinAt = latestCheckIn?.lastCheckinAt;
      const missedCheckins = Boolean(
        lastCheckinAt && nowMs - lastCheckinAt.getTime() > MISSED_CHECKINS_MS
      );

      return {
        id: patientId,
        displayName: profile?.displayName,
        status: normalizedStatus,
        clinicianId: profile?.clinicianId,
        lastCheckinAt: toIsoDateString(lastCheckinAt),
        lastPain: latestCheckIn?.lastPain,
        openAlertCount: patientAlerts?.openAlertCount ?? 0,
        lastAlertAt: toIsoDateString(patientAlerts?.lastAlertAt),
        missedCheckins,
      };
    });

    const filtered = mergedPatients.filter((patient) => {
      if (statusFilter !== "all" && patient.status !== statusFilter) {
        return false;
      }

      if (clinicianFilter && patient.clinicianId !== clinicianFilter) {
        return false;
      }

      return true;
    });

    filtered.sort((left, right) => {
      if (right.openAlertCount !== left.openAlertCount) {
        return right.openAlertCount - left.openAlertCount;
      }

      const leftCheckin = left.lastCheckinAt
        ? Date.parse(left.lastCheckinAt)
        : 0;
      const rightCheckin = right.lastCheckinAt
        ? Date.parse(right.lastCheckinAt)
        : 0;

      if (rightCheckin !== leftCheckin) {
        return rightCheckin - leftCheckin;
      }

      return left.id.localeCompare(right.id);
    });

    return res.json({
      ok: true,
      patients: filtered.slice(0, limit),
    });
  } catch (error) {
    logger.error("Get patients route failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({
      ok: false,
      error: "INTERNAL_ERROR",
      message: "Something went wrong",
    });
  }
});

router.patch(
  "/clinician/patients/:patientId",
  validateBody(patchPatientSchema),
  async (req, res) => {
    try {
      const patientId =
        typeof req.params.patientId === "string"
          ? req.params.patientId.trim()
          : "";

      if (!patientId || patientId.length > 64) {
        return res.status(400).json({
          ok: false,
          error: "VALIDATION_ERROR",
          details: [
            {
              path: "patientId",
              message:
                "patientId is required and must be at most 64 characters",
            },
          ],
        });
      }

      const { displayName, status, clinicianId, requestedBy, requestedByName } =
        req.body as z.infer<typeof patchPatientSchema>;
      const requestWithUser = req as RequestWithUser;
      const auditRequestedBy = requestWithUser.user?.id ?? requestedBy;
      const auditRequestedByName =
        requestWithUser.user?.name ?? requestedByName;

      const existing = await Patient.findOne({ patientId });
      const changed: Record<string, { from: string | null; to: string | null }> = {};

      let patientDoc = existing;

      if (!patientDoc) {
        patientDoc = new Patient({
          patientId,
        });

        if (displayName !== undefined) {
          patientDoc.displayName = displayName;
          changed.displayName = {
            from: null,
            to: displayName,
          };
        }

        if (status !== undefined) {
          patientDoc.status = status;
          changed.status = {
            from: null,
            to: status,
          };
        }

        if (clinicianId !== undefined) {
          patientDoc.clinicianId = clinicianId;
          changed.clinicianId = {
            from: null,
            to: clinicianId,
          };
        }

        await patientDoc.save();
      } else {
        const previousDisplayName =
          typeof patientDoc.displayName === "string"
            ? patientDoc.displayName.trim()
            : undefined;
        const previousStatus =
          typeof patientDoc.status === "string" ? patientDoc.status : undefined;
        const previousClinicianId =
          typeof patientDoc.clinicianId === "string"
            ? patientDoc.clinicianId.trim()
            : undefined;

        if (
          displayName !== undefined &&
          (previousDisplayName ?? null) !== displayName
        ) {
          changed.displayName = {
            from: previousDisplayName ?? null,
            to: displayName,
          };
          patientDoc.displayName = displayName;
        }

        if (status !== undefined && (previousStatus ?? null) !== status) {
          changed.status = {
            from: previousStatus ?? null,
            to: status,
          };
          patientDoc.status = status;
        }

        if (
          clinicianId !== undefined &&
          (previousClinicianId ?? null) !== clinicianId
        ) {
          changed.clinicianId = {
            from: previousClinicianId ?? null,
            to: clinicianId,
          };
          patientDoc.clinicianId = clinicianId;
        }

        if (Object.keys(changed).length > 0) {
          await patientDoc.save();
        }
      }

      if (Object.keys(changed).length > 0) {
        await CareEvent.create({
          type: "PATIENT_UPDATED",
          patientId,
          payload: {
            changed,
            requestedBy: auditRequestedBy,
            requestedByName: auditRequestedByName,
          },
        });
      }

      return res.json({
        ok: true,
        patient: mapPatientProfile(
          patientDoc.toObject() as unknown as PatientProfile
        ),
      });
    } catch (error) {
      logger.error("Patch patient route failed", {
        route: "PATCH /clinician/patients/:patientId",
        patientId:
          typeof req.params.patientId === "string" ? req.params.patientId : "",
        message: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({
        ok: false,
        error: "INTERNAL_ERROR",
      });
    }
  }
);

router.get("/clinician/patients/:patientId/checkins", async (req, res) => {
  try {
    const patientId =
      typeof req.params.patientId === "string" ? req.params.patientId.trim() : "";

    if (!patientId) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        details: [
          {
            path: "patientId",
            message: "patientId is required",
          },
        ],
      });
    }

    const parsedQuery = checkinsRangeQuerySchema.safeParse(req.query);

    if (!parsedQuery.success) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        details: parsedQuery.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    const { from, to } = parsedQuery.data;
    const includeNotes = parsedQuery.data.includeNotes === "true";
    const fromDate = parseDateOnly(from);
    const toDate = parseDateOnly(to);
    const validationDetails: Array<{ path: string; message: string }> = [];

    if (!fromDate) {
      validationDetails.push({
        path: "from",
        message: "Invalid calendar date",
      });
    }
    if (!toDate) {
      validationDetails.push({
        path: "to",
        message: "Invalid calendar date",
      });
    }
    if (from > to) {
      validationDetails.push({
        path: "from",
        message: "'from' must be less than or equal to 'to'",
      });
    }
    if (fromDate && toDate) {
      const rangeDays = getInclusiveDayCount(fromDate, toDate);
      if (rangeDays > CHECKINS_MAX_RANGE_DAYS) {
        validationDetails.push({
          path: "to",
          message: `Date range must be ${CHECKINS_MAX_RANGE_DAYS} days or less`,
        });
      }
    }

    if (validationDetails.length > 0) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        details: validationDetails,
      });
    }

    logger.info("GET /clinician/patients/:patientId/checkins", {
      patientId,
      from,
      to,
      includeNotes,
    });

    const selectedFields = includeNotes
      ? "patientId date pain mood symptoms adherence recovery support sleep dailySignals bodyMap risk createdAt notes"
      : "patientId date pain mood symptoms adherence recovery support sleep dailySignals bodyMap risk createdAt";

    const rows = await CheckIn.find({
      patientId,
      date: { $gte: from, $lte: to },
    })
      .sort({ date: 1, createdAt: 1 })
      .select(selectedFields)
      .limit(CHECKINS_MAX_RECORDS)
      .lean();

    const checkins = rows.map((row) => {
      const adherenceRecord =
        row.adherence && typeof row.adherence === "object"
          ? (row.adherence as Record<string, unknown>)
          : {};
      const riskRecord =
        row.risk && typeof row.risk === "object"
          ? (row.risk as Record<string, unknown>)
          : undefined;
      const sleepRecord =
        row.sleep && typeof row.sleep === "object"
          ? (row.sleep as Record<string, unknown>)
          : undefined;

      return {
        id: String(row._id ?? ""),
        patientId: toStringOrNull(row.patientId) ?? patientId,
        date: toStringOrNull(row.date) ?? "",
        pain: toNumberOrNull(row.pain),
        mood: toNumberOrNull(row.mood),
        symptoms: mapSymptomFlags(row.symptoms),
        adherence: {
          exercises: toNumberOrNull(adherenceRecord.exercises),
          medication:
            typeof adherenceRecord.medication === "boolean"
              ? adherenceRecord.medication
              : null,
          medicationStatus: toStringOrNull(adherenceRecord.medicationStatus),
          medicationReason: toStringOrNull(adherenceRecord.medicationReason),
        },
        recovery: mapRecovery(row.recovery),
        support: mapSupport(row.support),
        sleep: sleepRecord
          ? {
              hours: toNumberOrNull(sleepRecord.hours),
              quality: toNumberOrNull(sleepRecord.quality),
              disturbances: toNumberOrNull(sleepRecord.disturbances),
            }
          : undefined,
        dailySignals: mapDailySignals(row.dailySignals),
        bodyMap: mapBodyMap(row.bodyMap),
        risk: riskRecord
          ? {
              level: riskRecord.level === "high" ? "high" : "low",
              reasons: toStringArray(riskRecord.reasons),
            }
          : undefined,
        createdAt: toIsoDateStringRequired(row.createdAt),
        ...(includeNotes
          ? {
              notes:
                typeof row.notes === "string" ? row.notes : undefined,
            }
          : {}),
      };
    });

    return res.json({
      ok: true,
      patientId,
      from,
      to,
      count: checkins.length,
      checkins,
    });
  } catch (error) {
    logger.error("Get patient checkins range route failed", {
      route: "GET /clinician/patients/:patientId/checkins",
      patientId:
        typeof req.params.patientId === "string" ? req.params.patientId : "",
      from: typeof req.query.from === "string" ? req.query.from : undefined,
      to: typeof req.query.to === "string" ? req.query.to : undefined,
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({
      ok: false,
      error: "INTERNAL_ERROR",
    });
  }
});

router.get("/clinician/patients/:patientId/trends", async (req, res) => {
  try {
    const patientId =
      typeof req.params.patientId === "string" ? req.params.patientId.trim() : "";

    if (!patientId) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        details: [
          {
            path: "patientId",
            message: "patientId is required",
          },
        ],
      });
    }

    const parsedQuery = trendsQuerySchema.safeParse(req.query);

    if (!parsedQuery.success) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        details: parsedQuery.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    const days = Number.parseInt(parsedQuery.data.days, 10) as 14 | 30;
    const to = new Date();
    const from = new Date(to);
    from.setDate(from.getDate() - days);

    logger.info("GET /clinician/patients/:patientId/trends", {
      patientId,
      days,
    });

    const checkins = await CheckIn.find({
      patientId,
      createdAt: { $gte: from, $lte: to },
    })
      .sort({ createdAt: 1 })
      .limit(TRENDS_MAX_RECORDS)
      .lean();

    const trends = checkins.map((checkin) => {
      const createdAt = toDate(checkin.createdAt) ?? new Date();
      const riskPayload =
        checkin.risk && typeof checkin.risk === "object"
          ? {
              level:
                checkin.risk.level === "high" ? "high" : "low",
              reasons: Array.isArray(checkin.risk.reasons)
                ? checkin.risk.reasons.filter(
                    (reason) => typeof reason === "string"
                  )
                : [],
            }
          : undefined;

      return {
        date: checkin.date,
        pain: checkin.pain,
        mood: checkin.mood,
        adherence: {
          exercises: checkin.adherence?.exercises,
          medication: checkin.adherence?.medication,
        },
        notesPreview: toNotesPreview(checkin.notes),
        createdAt: createdAt.toISOString(),
        risk: riskPayload,
      };
    });

    return res.json({
      ok: true,
      patientId,
      days,
      from: from.toISOString(),
      to: to.toISOString(),
      trends,
    });
  } catch (error) {
    logger.error("Get patient trends route failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({
      ok: false,
      error: "INTERNAL_ERROR",
      message: "Something went wrong",
    });
  }
});

router.get("/clinician/patients/:patientId/coordination", async (req, res) => {
  try {
    const parsedPatientId = parsePatientIdParam(req.params.patientId);
    if (!parsedPatientId.patientId) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        details: parsedPatientId.details,
      });
    }

    const coordination = await getClinicianCoordinationByPatient(
      parsedPatientId.patientId
    );

    return res.json({
      ok: true,
      coordination: mapCoordinationRecord(coordination),
    });
  } catch (error) {
    logger.error("Get clinician coordination route failed", {
      route: "GET /clinician/patients/:patientId/coordination",
      patientId:
        typeof req.params.patientId === "string" ? req.params.patientId : "",
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({
      ok: false,
      error: "INTERNAL_ERROR",
    });
  }
});

router.put(
  "/clinician/patients/:patientId/coordination/current-handoff",
  validateBody(coordinationCurrentHandoffSchema),
  async (req, res) => {
    try {
      const parsedPatientId = parsePatientIdParam(req.params.patientId);
      if (!parsedPatientId.patientId) {
        return res.status(400).json({
          ok: false,
          error: "VALIDATION_ERROR",
          details: parsedPatientId.details,
        });
      }

      const requestWithUser = req as RequestWithUser;
      const {
        summary,
        nextStep,
        followUpOwner,
        linkedTaskId,
        updatedBy,
        updatedByName,
      } =
        req.body as z.infer<typeof coordinationCurrentHandoffSchema>;
      const actor = resolveClinicianActor(
        requestWithUser,
        updatedBy,
        updatedByName
      );

      if (!actor) {
        return res.status(401).json({
          ok: false,
          error: "UNAUTHORIZED",
        });
      }

      const coordination = await saveClinicianCurrentHandoff({
        patientId: parsedPatientId.patientId,
        summary,
        nextStep,
        followUpOwner: toCoordinationFollowUpOwnerInput(followUpOwner),
        linkedTaskId,
        updatedBy: {
          clinicianId: actor.id,
          displayName: actor.name ?? actor.id,
        },
      });

      return res.json({
        ok: true,
        coordination: mapCoordinationRecord(coordination),
      });
    } catch (error) {
      if (error instanceof ClinicianCoordinationValidationError) {
        return res.status(400).json({
          ok: false,
          error: "VALIDATION_ERROR",
          details: [
            {
              path: error.path,
              message: error.message,
            },
          ],
        });
      }

      logger.error("Put clinician coordination handoff route failed", {
        route: "PUT /clinician/patients/:patientId/coordination/current-handoff",
        patientId:
          typeof req.params.patientId === "string" ? req.params.patientId : "",
        message: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({
        ok: false,
        error: "INTERNAL_ERROR",
      });
    }
  }
);

router.post(
  "/clinician/patients/:patientId/coordination/notes",
  validateBody(coordinationAppendNoteSchema),
  async (req, res) => {
    try {
      const parsedPatientId = parsePatientIdParam(req.params.patientId);
      if (!parsedPatientId.patientId) {
        return res.status(400).json({
          ok: false,
          error: "VALIDATION_ERROR",
          details: parsedPatientId.details,
        });
      }

      const requestWithUser = req as RequestWithUser;
      const { text, createdBy, createdByName } =
        req.body as z.infer<typeof coordinationAppendNoteSchema>;
      const actor = resolveClinicianActor(
        requestWithUser,
        createdBy,
        createdByName
      );

      if (!actor) {
        return res.status(401).json({
          ok: false,
          error: "UNAUTHORIZED",
        });
      }

      const coordination = await appendClinicianCoordinationNote({
        patientId: parsedPatientId.patientId,
        text,
        createdBy: {
          clinicianId: actor.id,
          displayName: actor.name ?? actor.id,
        },
      });

      return res.status(201).json({
        ok: true,
        coordination: mapCoordinationRecord(coordination),
      });
    } catch (error) {
      logger.error("Post clinician coordination note route failed", {
        route: "POST /clinician/patients/:patientId/coordination/notes",
        patientId:
          typeof req.params.patientId === "string" ? req.params.patientId : "",
        message: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({
        ok: false,
        error: "INTERNAL_ERROR",
      });
    }
  }
);

router.patch(
  "/clinician/alerts/:id/seen",
  validateBody(seenSchema),
  async (req, res) => {
    const alertId = typeof req.params.id === "string" ? req.params.id : "";

    if (!isObjectId(alertId)) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        details: [
          {
            path: "id",
            message: "Invalid alert id",
          },
        ],
      });
    }

    try {
      const requestWithUser = req as RequestWithUser;
      const { clinicianId, clinicianName } = req.body as z.infer<
        typeof seenSchema
      >;
      const actor = resolveClinicianActor(
        requestWithUser,
        clinicianId,
        clinicianName
      );
      if (!actor) {
        return res.status(401).json({
          ok: false,
          error: "UNAUTHORIZED",
        });
      }

      const alert = await Alert.findById(alertId);

      if (!alert) {
        return res.status(404).json({
          ok: false,
          error: "NOT_FOUND",
        });
      }

      const existingSeenBy = Array.isArray(alert.seenBy) ? alert.seenBy : [];
      const alreadySeen = existingSeenBy.includes(actor.id);

      if (alreadySeen) {
        return res.json({
          ok: true,
          alert: mapAlertContextAlert(alert.toObject() as Record<string, unknown>),
        });
      }

      alert.seenBy = Array.from(new Set([...existingSeenBy, actor.id]));
      if (!alert.seenAt) {
        alert.seenAt = new Date();
      }
      await alert.save();

      await CareEvent.create({
        type: "ALERT_SEEN",
        patientId: alert.patientId,
        alertId: String(alert._id),
        payload: actor.name
          ? { clinicianId: actor.id, clinicianName: actor.name }
          : { clinicianId: actor.id },
      });

      return res.json({
        ok: true,
        alert: mapAlertContextAlert(alert.toObject() as Record<string, unknown>),
      });
    } catch (error) {
      logger.error("Patch alert seen route failed", {
        route: "PATCH /clinician/alerts/:id/seen",
        alertId,
        message: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({
        ok: false,
        error: "INTERNAL_ERROR",
      });
    }
  }
);

router.patch(
  "/clinician/alerts/:id/assignment",
  validateBody(assignmentSchema),
  async (req, res) => {
    const alertId = typeof req.params.id === "string" ? req.params.id : "";

    if (!isObjectId(alertId)) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        details: [
          {
            path: "id",
            message: "Invalid alert id",
          },
        ],
      });
    }

    try {
      const requestWithUser = req as RequestWithUser;
      const {
        assignedTo,
        assignedToName,
        requestedBy,
        requestedByName,
        force,
      } = req.body as z.infer<typeof assignmentSchema>;
      const actor = resolveClinicianActor(
        requestWithUser,
        requestedBy,
        requestedByName
      );
      if (!actor) {
        return res.status(401).json({
          ok: false,
          error: "UNAUTHORIZED",
        });
      }

      const hasAssignedToField = Object.prototype.hasOwnProperty.call(
        req.body as Record<string, unknown>,
        "assignedTo"
      );

      let targetAssignedTo: string | null;
      if (assignedTo === null) {
        targetAssignedTo = null;
      } else if (!hasAssignedToField || assignedTo === "me") {
        targetAssignedTo = actor.id;
      } else {
        targetAssignedTo = assignedTo.trim();
      }

      const targetAssignedToName =
        targetAssignedTo && targetAssignedTo === actor.id
          ? requestWithUser.user?.name ?? actor.name ?? assignedToName?.trim()
          : assignedToName?.trim();

      const alert = await Alert.findById(alertId);

      if (!alert) {
        return res.status(404).json({
          ok: false,
          error: "NOT_FOUND",
        });
      }

      const previousAssignedTo =
        typeof alert.assignedTo === "string" && alert.assignedTo.trim()
          ? alert.assignedTo.trim()
          : null;
      const previousAssignedToName =
        typeof alert.assignedToName === "string" && alert.assignedToName.trim()
          ? alert.assignedToName.trim()
          : undefined;
      const current = mapAssignmentCurrent(alert.toObject() as Record<string, unknown>);

      let action: "assign" | "unassign" | "takeover" | null = null;

      if (targetAssignedTo === null) {
        if (!previousAssignedTo) {
          return res.json({
            ok: true,
            alert: mapAlertContextAlert(alert.toObject() as Record<string, unknown>),
          });
        }

        if (previousAssignedTo !== actor.id && !force) {
          return res.status(409).json({
            ok: false,
            error: "ASSIGNMENT_CONFLICT",
            current,
          });
        }

        alert.assignedTo = undefined;
        alert.assignedToName = undefined;
        alert.assignedAt = undefined;
        action = "unassign";
      } else {
        const nextAssignedTo = targetAssignedTo;

        if (!previousAssignedTo) {
          alert.assignedTo = nextAssignedTo;
          alert.assignedToName = targetAssignedToName;
          alert.assignedAt = new Date();
          action = "assign";
        } else if (previousAssignedTo === nextAssignedTo) {
          return res.json({
            ok: true,
            alert: mapAlertContextAlert(alert.toObject() as Record<string, unknown>),
          });
        } else if (!force) {
          return res.status(409).json({
            ok: false,
            error: "ASSIGNMENT_CONFLICT",
            current,
          });
        } else {
          alert.assignedTo = nextAssignedTo;
          alert.assignedToName = targetAssignedToName;
          alert.assignedAt = new Date();
          action = "takeover";
        }
      }

      await alert.save();

      await CareEvent.create({
        type: "ALERT_ASSIGNED",
        patientId: alert.patientId,
        alertId: String(alert._id),
        payload: {
          action,
          assignedTo: alert.assignedTo ?? null,
          assignedToName: alert.assignedToName,
          previousAssignedTo,
          previousAssignedToName,
          requestedBy: actor.id,
          requestedByName: requestWithUser.user?.name ?? actor.name,
          force,
        },
      });

      return res.json({
        ok: true,
        alert: mapAlertContextAlert(alert.toObject() as Record<string, unknown>),
      });
    } catch (error) {
      logger.error("Patch alert assignment route failed", {
        route: "PATCH /clinician/alerts/:id/assignment",
        alertId,
        message: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({
        ok: false,
        error: "INTERNAL_ERROR",
      });
    }
  }
);

router.post(
  "/clinician/alerts/:id/retry-notification",
  validateBody(retryNotificationSchema),
  async (req, res) => {
    const alertId = typeof req.params.id === "string" ? req.params.id : "";

    if (!isObjectId(alertId)) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        details: [
          {
            path: "id",
            message: "Invalid alert id",
          },
        ],
      });
    }

    try {
      const requestWithUser = req as RequestWithUser;
      const { channel, requestedBy, requestedByName, reason } =
        req.body as z.infer<typeof retryNotificationSchema>;
      const actor = resolveClinicianActor(
        requestWithUser,
        requestedBy,
        requestedByName
      );
      if (!actor) {
        return res.status(401).json({
          ok: false,
          error: "UNAUTHORIZED",
        });
      }

      const actorName = requestWithUser.user?.name ?? actor.name;
      const alert = await Alert.findById(alertId);

      if (!alert) {
        return res.status(404).json({
          ok: false,
          error: "NOT_FOUND",
        });
      }

      const job = await requestAlertNotificationRetry({
        alert: {
          _id: alert._id,
          patientId: alert.patientId,
          reason: alert.reason,
          notification: alert.notification,
        },
        actor: {
          id: actor.id,
          name: actorName,
        },
        reason,
        channel,
      });

      if (env.N8N_RETRY_WEBHOOK_URL) {
        await dispatchJob(String(job._id));
      }

      const updatedAlert = await Alert.findById(alertId);
      if (!updatedAlert) {
        return res.status(404).json({
          ok: false,
          error: "NOT_FOUND",
        });
      }

      return res.json({
        ok: true,
        status: "queued",
        alert: mapAlertContextAlert(updatedAlert.toObject() as Record<string, unknown>),
      });
    } catch (error) {
      if (error instanceof AlertNotificationRetryThrottleError) {
        return res.status(429).json({
          ok: false,
          error: "TOO_MANY_REQUESTS",
          retryAfterSeconds: NOTIFICATION_RETRY_AFTER_SECONDS,
        });
      }

      logger.error("Post alert retry notification route failed", {
        route: "POST /clinician/alerts/:id/retry-notification",
        alertId,
        message: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({
        ok: false,
        error: "INTERNAL_ERROR",
      });
    }
  }
);

router.patch(
  "/clinician/alerts/:id/risk-override",
  validateBody(riskOverrideSchema),
  async (req, res) => {
    const alertId = typeof req.params.id === "string" ? req.params.id : "";

    if (!isObjectId(alertId)) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        details: [
          {
            path: "id",
            message: "Invalid alert id",
          },
        ],
      });
    }

    try {
      const requestWithUser = req as RequestWithUser;
      const { riskFinal, overrideReason, overriddenBy, overriddenByName } =
        req.body as z.infer<typeof riskOverrideSchema>;
      const actor = resolveClinicianActor(
        requestWithUser,
        overriddenBy,
        overriddenByName
      );
      if (!actor) {
        return res.status(401).json({
          ok: false,
          error: "UNAUTHORIZED",
        });
      }
      const actorName = requestWithUser.user?.name ?? actor.name;
      const alert = await Alert.findById(alertId);

      if (!alert) {
        return res.status(404).json({
          ok: false,
          error: "NOT_FOUND",
        });
      }

      const previousRiskFinal =
        typeof alert.riskFinal === "string" && alert.riskFinal.trim()
          ? alert.riskFinal.trim()
          : null;
      const previousOverrideReason =
        typeof alert.overrideReason === "string" && alert.overrideReason.trim()
          ? alert.overrideReason.trim()
          : null;
      const currentOverriddenBy =
        typeof alert.overriddenBy === "string" ? alert.overriddenBy.trim() : "";

      const isSameOverride =
        previousRiskFinal === riskFinal &&
        (previousOverrideReason ?? "") === overrideReason &&
        currentOverriddenBy === actor.id;

      if (isSameOverride) {
        return res.json({
          ok: true,
          alert: mapAlertContextAlert(alert.toObject() as Record<string, unknown>),
        });
      }

      alert.riskFinal = riskFinal;
      alert.overrideReason = overrideReason;
      alert.overriddenBy = actor.id;
      alert.overriddenByName = actorName;
      alert.overriddenAt = new Date();

      await alert.save();

      await CareEvent.create({
        type: "ALERT_RISK_OVERRIDDEN",
        patientId: alert.patientId,
        alertId: String(alert._id),
        payload: {
          riskFinal,
          overrideReason,
          overriddenBy: actor.id,
          overriddenByName: actorName,
          previousRiskFinal,
          previousOverrideReason,
        },
      });

      return res.json({
        ok: true,
        alert: mapAlertContextAlert(alert.toObject() as Record<string, unknown>),
      });
    } catch (error) {
      logger.error("Patch alert risk override route failed", {
        route: "PATCH /clinician/alerts/:id/risk-override",
        alertId,
        message: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({
        ok: false,
        error: "INTERNAL_ERROR",
      });
    }
  }
);

router.delete("/clinician/alerts/:id/risk-override", async (req, res) => {
  const alertId = typeof req.params.id === "string" ? req.params.id : "";

  if (!isObjectId(alertId)) {
    return res.status(400).json({
      ok: false,
      error: "VALIDATION_ERROR",
      details: [
        {
          path: "id",
          message: "Invalid alert id",
        },
      ],
    });
  }

  try {
    const requestWithUser = req as RequestWithUser;
    const body =
      req.body && typeof req.body === "object"
        ? (req.body as { overriddenBy?: unknown; overriddenByName?: unknown })
        : undefined;
    const actor = resolveClinicianActor(
      requestWithUser,
      typeof body?.overriddenBy === "string" ? body.overriddenBy : undefined,
      typeof body?.overriddenByName === "string" ? body.overriddenByName : undefined
    );

    if (!actor) {
      return res.status(401).json({
        ok: false,
        error: "UNAUTHORIZED",
      });
    }

    const alert = await Alert.findById(alertId);

    if (!alert) {
      return res.status(404).json({
        ok: false,
        error: "NOT_FOUND",
      });
    }

    alert.riskFinal = undefined;
    alert.overrideReason = undefined;
    alert.overriddenBy = undefined;
    alert.overriddenByName = undefined;
    alert.overriddenAt = undefined;

    await alert.save();

    return res.json({
      ok: true,
      alert: mapAlertContextAlert(alert.toObject() as Record<string, unknown>),
    });
  } catch (error) {
    logger.error("Delete alert risk override route failed", {
      route: "DELETE /clinician/alerts/:id/risk-override",
      alertId,
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({
      ok: false,
      error: "INTERNAL_ERROR",
    });
  }
});

router.patch(
  "/clinician/alerts/:id",
  validateBody(patchSchema),
  async (req, res) => {
    try {
      const { id } = req.params;

      if (!isObjectId(id)) {
        return res.status(400).json({
          ok: false,
          error: "VALIDATION_ERROR",
          details: [
            {
              path: "id",
              message: "Invalid alert id",
            },
          ],
        });
      }

      const { status } = req.body as z.infer<typeof patchSchema>;

      const update: Record<string, unknown> = {
        status,
      };

      if (status === "acknowledged") {
        update.acknowledgedAt = new Date();
      }

      if (status === "resolved") {
        update.resolvedAt = new Date();
      }

      const updated = await Alert.findByIdAndUpdate(id, update, {
        new: true,
      }).lean();

      if (!updated) {
        return res.status(404).json({
          ok: false,
          error: "NOT_FOUND",
          message: "Alert not found",
        });
      }

      return res.json({
        ok: true,
        alert: updated,
      });
    } catch (error) {
      logger.error("Patch alert route failed", {
        message: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({
        ok: false,
        error: "INTERNAL_ERROR",
        message: "Something went wrong",
      });
    }
  }
);

export default router;
