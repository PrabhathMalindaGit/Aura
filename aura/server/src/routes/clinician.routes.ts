import { Router } from "express";
import { z } from "zod";

import Alert from "../models/Alert";
import CareEvent from "../models/CareEvent";
import ChatMessage from "../models/ChatMessage";
import CheckIn from "../models/CheckIn";
import Patient from "../models/Patient";
import { validateBody } from "../middleware/validate";
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
  clinicianId: z.string().trim().min(1),
  clinicianName: z.string().trim().min(1).optional(),
});
const assignmentSchema = z.object({
  assignedTo: z.union([z.string().trim().min(1), z.null()]),
  assignedToName: z.string().trim().min(1).optional(),
  requestedBy: z.string().trim().min(1),
  requestedByName: z.string().trim().min(1).optional(),
  force: z.boolean().optional().default(false),
});
const listPatientsQuerySchema = z.object({
  status: patientStatusFilterSchema.optional().default("all"),
  clinicianId: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().positive().optional(),
});
const trendsQuerySchema = z.object({
  days: z.enum(["14", "30"]).optional().default("14"),
});

const DEFAULT_PATIENTS_LIMIT = 200;
const MAX_PATIENTS_LIMIT = 500;
const MISSED_CHECKINS_DAYS = 2;
const MISSED_CHECKINS_MS = MISSED_CHECKINS_DAYS * 24 * 60 * 60 * 1000;
const TRENDS_MAX_RECORDS = 2000;
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

function toIsoDateString(value?: Date): string | undefined {
  if (!value) {
    return undefined;
  }

  return value.toISOString();
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
    adherence: {
      exercises: toNumberOrNull(adherenceRecord.exercises),
      medication:
        typeof adherenceRecord.medication === "boolean"
          ? adherenceRecord.medication
          : null,
    },
    notes: toStringOrNull(checkin.notes) ?? undefined,
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
      const { clinicianId, clinicianName } = req.body as z.infer<
        typeof seenSchema
      >;
      const alert = await Alert.findById(alertId);

      if (!alert) {
        return res.status(404).json({
          ok: false,
          error: "NOT_FOUND",
        });
      }

      const existingSeenBy = Array.isArray(alert.seenBy) ? alert.seenBy : [];
      const alreadySeen = existingSeenBy.includes(clinicianId);

      if (alreadySeen) {
        return res.json({
          ok: true,
          alert: mapAlertContextAlert(alert.toObject() as Record<string, unknown>),
        });
      }

      alert.seenBy = Array.from(new Set([...existingSeenBy, clinicianId]));
      if (!alert.seenAt) {
        alert.seenAt = new Date();
      }
      await alert.save();

      await CareEvent.create({
        type: "ALERT_SEEN",
        patientId: alert.patientId,
        alertId: String(alert._id),
        payload: clinicianName
          ? { clinicianId, clinicianName }
          : { clinicianId },
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
      const { assignedTo, assignedToName, requestedBy, requestedByName, force } =
        req.body as z.infer<typeof assignmentSchema>;
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

      if (assignedTo === null) {
        if (!previousAssignedTo) {
          return res.json({
            ok: true,
            alert: mapAlertContextAlert(alert.toObject() as Record<string, unknown>),
          });
        }

        if (previousAssignedTo !== requestedBy && !force) {
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
        const nextAssignedTo = assignedTo.trim();

        if (!previousAssignedTo) {
          alert.assignedTo = nextAssignedTo;
          alert.assignedToName = assignedToName?.trim();
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
          alert.assignedToName = assignedToName?.trim();
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
          requestedBy,
          requestedByName,
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
