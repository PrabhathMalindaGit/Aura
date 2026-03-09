import CareEvent from "../models/CareEvent";
import CommunicationReview from "../models/CommunicationReview";
import Patient from "../models/Patient";
import Task from "../models/Task";
import {
  getDashboardFollowUpTasks,
  getDashboardSummary,
  getPriorityQueue,
} from "./dashboardSummaryService";
import { listAppointmentWorkflowItems } from "./appointmentWorkflowService";
import { listClinicianWorklist } from "./worklistService";

export const FOLLOW_THROUGH_WORKFLOW_VALUES = [
  "missed_checkin_reminder",
  "task_reminder_timing",
  "appointment_follow_through",
  "communication_no_response_escalation",
  "daily_clinician_digest",
] as const;

export type FollowThroughWorkflow =
  (typeof FOLLOW_THROUGH_WORKFLOW_VALUES)[number];

export type FollowThroughCandidate = {
  dedupeKey: string;
  patientId?: string;
  title: string;
  message: string;
  audience: "clinician" | "patient";
  taskId?: string;
  appointmentRequestId?: string;
  communicationReviewId?: string;
  linkedEntityType?: string;
  linkedEntityId?: string;
  meta?: Record<string, unknown>;
};

export type FollowThroughProcessResult = {
  workflow: FollowThroughWorkflow;
  generatedAt: string;
  items: FollowThroughCandidate[];
  messageText?: string;
  summary?: Record<string, unknown>;
};

type ProcessOptions = {
  now?: Date;
  limit?: number;
  force?: boolean;
};

type PatientInfo = {
  patientName: string;
  clinicianId?: string;
};

const AUTOMATION_STATUS_EVENT_TYPE = "AUTOMATION_STATUS";
const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const DEFAULT_LIMIT = 25;

function asDate(value: unknown): Date | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value;
  }
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime())) {
      return parsed;
    }
  }
  return null;
}

function asIso(value: Date | null | undefined): string | undefined {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    return undefined;
  }
  return value.toISOString();
}

function cleanString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function dayKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function formatPatientName(info: PatientInfo | undefined, patientId: string): string {
  return cleanString(info?.patientName) ?? patientId;
}

function formatRelativeDue(now: Date, dueAt: Date): string {
  const deltaMs = dueAt.getTime() - now.getTime();
  if (deltaMs <= 0) {
    const daysOverdue = Math.max(1, Math.floor(Math.abs(deltaMs) / MS_PER_DAY) + 1);
    return daysOverdue === 1 ? "overdue today" : `${daysOverdue} days overdue`;
  }

  const hours = Math.round(deltaMs / MS_PER_HOUR);
  if (hours <= 2) {
    return "due within 2 hours";
  }
  if (hours <= 24) {
    return "due today";
  }

  const days = Math.ceil(deltaMs / MS_PER_DAY);
  return days === 1 ? "due tomorrow" : `due in ${days} days`;
}

async function getPatientInfoMap(patientIds: string[]): Promise<Map<string, PatientInfo>> {
  const uniquePatientIds = [...new Set(patientIds.filter(Boolean))];
  if (uniquePatientIds.length === 0) {
    return new Map();
  }

  const rows = await Patient.find({ patientId: { $in: uniquePatientIds } })
    .select({ patientId: 1, displayName: 1, clinicianId: 1 })
    .lean();

  return new Map(
    rows.map((row) => [
      row.patientId,
      {
        patientName: cleanString(row.displayName) ?? row.patientId,
        clinicianId: cleanString(row.clinicianId),
      },
    ])
  );
}

async function getDeliveredDedupeKeys(
  workflow: FollowThroughWorkflow,
  dedupeKeys: string[]
): Promise<Set<string>> {
  const uniqueKeys = [...new Set(dedupeKeys.filter(Boolean))];
  if (uniqueKeys.length === 0) {
    return new Set();
  }

  const rows = await CareEvent.find({
    type: AUTOMATION_STATUS_EVENT_TYPE,
    "payload.workflow": workflow,
    "payload.dedupeKey": { $in: uniqueKeys },
    "payload.status": { $in: ["sent", "skipped"] },
  })
    .select({ payload: 1 })
    .lean();

  return new Set(
    rows
      .map((row) =>
        row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
          ? cleanString((row.payload as Record<string, unknown>).dedupeKey)
          : undefined
      )
      .filter((value): value is string => Boolean(value))
  );
}

async function upsertAutomationTask(params: {
  patientId: string;
  match: Record<string, unknown>;
  create: Record<string, unknown>;
  update: Record<string, unknown>;
}): Promise<{ id: string; created: boolean } | null> {
  const existing = await Task.findOne({
    patientId: params.patientId,
    status: { $in: ["open", "in_progress"] },
    ...params.match,
  }).sort({ updatedAt: -1 });

  if (existing) {
    Object.entries(params.update).forEach(([key, value]) => {
      existing.set(key, value);
    });
    await existing.save();
    return { id: String(existing._id), created: false };
  }

  const created = await Task.create({
    patientId: params.patientId,
    status: "open",
    ...params.create,
  });
  return { id: String(created._id), created: true };
}

function normalizeProcessOptions(options: ProcessOptions): Required<ProcessOptions> {
  return {
    now: options.now ?? new Date(),
    limit: options.limit && options.limit > 0 ? Math.min(options.limit, 100) : DEFAULT_LIMIT,
    force: options.force === true,
  };
}

export async function processMissedCheckinAutomation(
  options: ProcessOptions = {}
): Promise<FollowThroughProcessResult> {
  const normalized = normalizeProcessOptions(options);
  const generatedAt = normalized.now.toISOString();
  const worklist = await listClinicianWorklist({ missedCheckins: true, sort: "priority" });
  const limitedRows = worklist.slice(0, normalized.limit);
  const patientInfoMap = await getPatientInfoMap(limitedRows.map((row) => row.patientId));

  const candidateSpecs: Array<{
    dedupeKey: string;
    row: (typeof limitedRows)[number];
    patientTaskId?: string;
    clinicianTaskId?: string;
  }> = [];

  for (const row of limitedRows) {
    const patientInfo = patientInfoMap.get(row.patientId);
    const patientName = formatPatientName(patientInfo, row.patientId);
    const patientTask = await upsertAutomationTask({
      patientId: row.patientId,
      match: {
        "source.entityType": "missed_checkin_reminder",
        "source.entityId": row.patientId,
      },
      create: {
        title: "Complete your rehab check-in",
        description: `We haven't received a recent check-in from ${patientName}. Send a quick update so your care team can see how you're doing.`,
        type: "follow_up",
        priority:
          row.latestRiskLevel === "high" || row.openAlertsCount > 0 ? "high" : "medium",
        dueAt: normalized.now,
        createdBy: "automation:n8n:missed-checkin",
        source: {
          type: "automation",
          entityType: "missed_checkin_reminder",
          entityId: row.patientId,
          label: "Missed check-in reminder",
        },
        meta: {
          patientCompletable: false,
          patientAction: {
            kind: "checkin",
            label: "Open check-in",
          },
          automation: {
            workflow: "missed_checkin_reminder",
            missedCheckins: row.missedCheckins.count,
            generatedAt,
          },
        },
      },
      update: {
        title: "Complete your rehab check-in",
        description: `We haven't received a recent check-in from ${patientName}. Send a quick update so your care team can see how you're doing.`,
        priority:
          row.latestRiskLevel === "high" || row.openAlertsCount > 0 ? "high" : "medium",
        dueAt: normalized.now,
        meta: {
          patientCompletable: false,
          patientAction: {
            kind: "checkin",
            label: "Open check-in",
          },
          automation: {
            workflow: "missed_checkin_reminder",
            missedCheckins: row.missedCheckins.count,
            generatedAt,
          },
        },
      },
    });

    let clinicianTaskId: string | undefined;
    const needsClinicianFollowThrough =
      row.latestRiskLevel === "high" || row.openAlertsCount > 0 || row.missedCheckins.count >= 2;

    if (needsClinicianFollowThrough) {
      const clinicianTask = await upsertAutomationTask({
        patientId: row.patientId,
        match: {
          "source.entityType": "missed_checkin_follow_up",
          "source.entityId": row.patientId,
        },
        create: {
          title: "Review missed check-in follow-up",
          description: `${patientName} missed ${row.missedCheckins.count} recent check-in${row.missedCheckins.count === 1 ? "" : "s"}. Review follow-through and consider outreach.`,
          type: "follow_up",
          priority:
            row.latestRiskLevel === "high" || row.openAlertsCount > 0 ? "high" : "medium",
          dueAt: normalized.now,
          assignedTo: patientInfo?.clinicianId,
          createdBy: "automation:n8n:missed-checkin",
          source: {
            type: "automation",
            entityType: "missed_checkin_follow_up",
            entityId: row.patientId,
            label: "Missed check-in clinician follow-up",
          },
          meta: {
            automation: {
              workflow: "missed_checkin_reminder",
              missedCheckins: row.missedCheckins.count,
              generatedAt,
            },
          },
        },
        update: {
          title: "Review missed check-in follow-up",
          description: `${patientName} missed ${row.missedCheckins.count} recent check-in${row.missedCheckins.count === 1 ? "" : "s"}. Review follow-through and consider outreach.`,
          priority:
            row.latestRiskLevel === "high" || row.openAlertsCount > 0 ? "high" : "medium",
          dueAt: normalized.now,
          assignedTo: patientInfo?.clinicianId,
          meta: {
            automation: {
              workflow: "missed_checkin_reminder",
              missedCheckins: row.missedCheckins.count,
              generatedAt,
            },
          },
        },
      });
      clinicianTaskId = clinicianTask?.id;
    }

    if (!needsClinicianFollowThrough) {
      continue;
    }

    candidateSpecs.push({
      dedupeKey: `missed-checkin:${row.patientId}:${row.missedCheckins.count}:${dayKey(normalized.now)}`,
      row,
      patientTaskId: patientTask?.id,
      clinicianTaskId,
    });
  }

  const deliveredKeys = normalized.force
    ? new Set<string>()
    : await getDeliveredDedupeKeys(
        "missed_checkin_reminder",
        candidateSpecs.map((item) => item.dedupeKey)
      );

  const items = candidateSpecs
    .filter((item) => !deliveredKeys.has(item.dedupeKey))
    .map((item) => {
      const patientName = formatPatientName(
        patientInfoMap.get(item.row.patientId),
        item.row.patientId
      );
      return {
        dedupeKey: item.dedupeKey,
        patientId: item.row.patientId,
        title: `${patientName} missed recent check-ins`,
        message: `${patientName} has ${item.row.missedCheckins.count} missed check-in${item.row.missedCheckins.count === 1 ? "" : "s"}, ${item.row.openAlertsCount} open alert${item.row.openAlertsCount === 1 ? "" : "s"}, and current risk ${item.row.latestRiskLevel}.`,
        audience: "clinician",
        taskId: item.clinicianTaskId ?? item.patientTaskId,
        linkedEntityType: "patient",
        linkedEntityId: item.row.patientId,
        meta: {
          patientTaskId: item.patientTaskId,
          clinicianTaskId: item.clinicianTaskId,
          missedCheckins: item.row.missedCheckins.count,
          openAlertsCount: item.row.openAlertsCount,
          latestRiskLevel: item.row.latestRiskLevel,
        },
      } satisfies FollowThroughCandidate;
    });

  return {
    workflow: "missed_checkin_reminder",
    generatedAt,
    items,
    summary: {
      scanned: limitedRows.length,
      actionable: items.length,
    },
  };
}

function deriveTaskReminderPhase(now: Date, dueAt: Date): {
  phase: "due_soon" | "due_today" | "overdue";
  dedupeBucket: string;
} | null {
  const deltaMs = dueAt.getTime() - now.getTime();

  if (deltaMs <= 0) {
    const daysOverdue = Math.max(1, Math.floor(Math.abs(deltaMs) / MS_PER_DAY) + 1);
    return {
      phase: "overdue",
      dedupeBucket: String(daysOverdue),
    };
  }

  if (deltaMs <= 6 * MS_PER_HOUR) {
    return {
      phase: "due_soon",
      dedupeBucket: `${dayKey(now)}:${Math.floor(now.getUTCHours() / 6)}`,
    };
  }

  if (deltaMs <= MS_PER_DAY) {
    return {
      phase: "due_today",
      dedupeBucket: dayKey(now),
    };
  }

  return null;
}

export async function processTaskReminderAutomation(
  options: ProcessOptions = {}
): Promise<FollowThroughProcessResult> {
  const normalized = normalizeProcessOptions(options);
  const generatedAt = normalized.now.toISOString();

  const rows = await Task.find({
    status: { $in: ["open", "in_progress"] },
    dueAt: { $ne: null },
    "meta.patientAction.kind": { $exists: true },
  })
    .sort({ dueAt: 1, updatedAt: -1 })
    .limit(normalized.limit * 3)
    .lean();

  const patientInfoMap = await getPatientInfoMap(
    rows.map((row) => cleanString(row.patientId) ?? "")
  );

  const specs = rows
    .map((row) => {
      const dueAt = asDate(row.dueAt);
      const patientId = cleanString(row.patientId);
      if (!dueAt || !patientId) {
        return null;
      }

      const phase = deriveTaskReminderPhase(normalized.now, dueAt);
      if (!phase) {
        return null;
      }

      return {
        row,
        patientId,
        dueAt,
        phase,
        dedupeKey: `task-reminder:${String(row._id)}:${phase.phase}:${phase.dedupeBucket}`,
      };
    })
    .filter(Boolean)
    .slice(0, normalized.limit) as Array<{
    row: Record<string, unknown>;
    patientId: string;
    dueAt: Date;
    phase: { phase: "due_soon" | "due_today" | "overdue"; dedupeBucket: string };
    dedupeKey: string;
  }>;

  const deliveredKeys = normalized.force
    ? new Set<string>()
    : await getDeliveredDedupeKeys(
        "task_reminder_timing",
        specs.map((item) => item.dedupeKey)
      );

  const items = specs
    .filter((item) => !deliveredKeys.has(item.dedupeKey))
    .map((item) => {
      const patientName = formatPatientName(
        patientInfoMap.get(item.patientId),
        item.patientId
      );
      const meta =
        item.row.meta && typeof item.row.meta === "object" && !Array.isArray(item.row.meta)
          ? (item.row.meta as Record<string, unknown>)
          : undefined;
      const patientAction =
        meta?.patientAction && typeof meta.patientAction === "object"
          ? (meta.patientAction as Record<string, unknown>)
          : undefined;
      return {
        dedupeKey: item.dedupeKey,
        patientId: item.patientId,
        title: `${patientName}: ${cleanString(item.row.title) ?? "Follow-up task"}`,
        message: `${cleanString(item.row.title) ?? "Task"} is ${formatRelativeDue(normalized.now, item.dueAt)} for ${patientName}.${cleanString(item.row.description) ? ` ${cleanString(item.row.description)}` : ""}`,
        audience: "clinician",
        taskId: String(item.row._id),
        linkedEntityType: "task",
        linkedEntityId: String(item.row._id),
        meta: {
          phase: item.phase.phase,
          dueAt: item.dueAt.toISOString(),
          patientActionKind: cleanString(patientAction?.kind),
          priority: cleanString(item.row.priority),
        },
      } satisfies FollowThroughCandidate;
    });

  return {
    workflow: "task_reminder_timing",
    generatedAt,
    items,
    summary: {
      scanned: rows.length,
      actionable: items.length,
    },
  };
}

export async function processAppointmentFollowThroughAutomation(
  options: ProcessOptions = {}
): Promise<FollowThroughProcessResult> {
  const normalized = normalizeProcessOptions(options);
  const generatedAt = normalized.now.toISOString();
  const from = new Date(normalized.now.getTime() - 2 * MS_PER_DAY);
  const to = new Date(normalized.now.getTime() + 2 * MS_PER_DAY);

  const appointmentItems = await listAppointmentWorkflowItems({
    from,
    to,
    workflowStatuses: [
      "upcoming",
      "awaiting_confirmation",
      "missed",
      "reschedule_requested",
    ],
    limit: normalized.limit * 4,
  });
  const patientInfoMap = await getPatientInfoMap(
    appointmentItems.map((item) => item.patientId)
  );

  const specs: Array<{
    dedupeKey: string;
    item: (typeof appointmentItems)[number];
    clinicianTaskId?: string;
  }> = [];

  for (const item of appointmentItems) {
    const patientInfo = patientInfoMap.get(item.patientId);
    const patientName = formatPatientName(patientInfo, item.patientId);
    const startsInMs = item.startsAt.getTime() - normalized.now.getTime();

    if (item.workflowStatus === "upcoming") {
      let phase: string | null = null;
      if (startsInMs > 23 * MS_PER_HOUR && startsInMs <= 25 * MS_PER_HOUR) {
        phase = "24h";
      } else if (startsInMs > MS_PER_HOUR && startsInMs <= 3 * MS_PER_HOUR) {
        phase = "2h";
      }
      if (!phase) {
        continue;
      }
      specs.push({
        dedupeKey: `appointment:${item.requestId}:upcoming:${phase}`,
        item,
      });
      continue;
    }

    if (item.workflowStatus === "awaiting_confirmation") {
      if (startsInMs > MS_PER_DAY || startsInMs < -MS_PER_HOUR) {
        continue;
      }
      const task = await upsertAutomationTask({
        patientId: item.patientId,
        match: {
          "source.entityType": "appointment_follow_up",
          "source.entityId": item.requestId,
        },
        create: {
          title: "Review appointment confirmation",
          description: `${patientName} has an appointment that is still awaiting confirmation.`,
          type: "appointment",
          priority: "medium",
          dueAt: item.startsAt,
          assignedTo: patientInfo?.clinicianId,
          createdBy: "automation:n8n:appointments",
          source: {
            type: "automation",
            entityType: "appointment_follow_up",
            entityId: item.requestId,
            label: "Appointment confirmation follow-up",
          },
          linkedAppointmentId: item.requestId,
          meta: {
            automation: {
              workflow: "appointment_follow_through",
              workflowStatus: item.workflowStatus,
              generatedAt,
            },
          },
        },
        update: {
          title: "Review appointment confirmation",
          description: `${patientName} has an appointment that is still awaiting confirmation.`,
          priority: "medium",
          dueAt: item.startsAt,
          assignedTo: patientInfo?.clinicianId,
          linkedAppointmentId: item.requestId,
          meta: {
            automation: {
              workflow: "appointment_follow_through",
              workflowStatus: item.workflowStatus,
              generatedAt,
            },
          },
        },
      });
      specs.push({
        dedupeKey: `appointment:${item.requestId}:awaiting_confirmation:${dayKey(normalized.now)}`,
        item,
        clinicianTaskId: task?.id,
      });
      continue;
    }

    if (item.workflowStatus === "missed" || item.workflowStatus === "reschedule_requested") {
      const task = await upsertAutomationTask({
        patientId: item.patientId,
        match: {
          "source.entityType": "appointment_follow_up",
          "source.entityId": item.requestId,
        },
        create: {
          title:
            item.workflowStatus === "missed"
              ? "Follow up on missed appointment"
              : "Review appointment reschedule request",
          description:
            item.workflowStatus === "missed"
              ? `${patientName} missed an appointment scheduled for ${item.startsAt.toISOString()}.`
              : `${patientName} requested an appointment reschedule or update.`,
          type: "appointment",
          priority: "high",
          dueAt: normalized.now,
          assignedTo: patientInfo?.clinicianId,
          createdBy: "automation:n8n:appointments",
          source: {
            type: "automation",
            entityType: "appointment_follow_up",
            entityId: item.requestId,
            label: "Appointment follow-up",
          },
          linkedAppointmentId: item.requestId,
          meta: {
            automation: {
              workflow: "appointment_follow_through",
              workflowStatus: item.workflowStatus,
              generatedAt,
            },
          },
        },
        update: {
          title:
            item.workflowStatus === "missed"
              ? "Follow up on missed appointment"
              : "Review appointment reschedule request",
          description:
            item.workflowStatus === "missed"
              ? `${patientName} missed an appointment scheduled for ${item.startsAt.toISOString()}.`
              : `${patientName} requested an appointment reschedule or update.`,
          priority: "high",
          dueAt: normalized.now,
          assignedTo: patientInfo?.clinicianId,
          linkedAppointmentId: item.requestId,
          meta: {
            automation: {
              workflow: "appointment_follow_through",
              workflowStatus: item.workflowStatus,
              generatedAt,
            },
          },
        },
      });
      specs.push({
        dedupeKey: `appointment:${item.requestId}:${item.workflowStatus}:${dayKey(normalized.now)}`,
        item,
        clinicianTaskId: task?.id,
      });
    }
  }

  const deliveredKeys = normalized.force
    ? new Set<string>()
    : await getDeliveredDedupeKeys(
        "appointment_follow_through",
        specs.map((item) => item.dedupeKey)
      );

  const items = specs
    .filter((item) => !deliveredKeys.has(item.dedupeKey))
    .slice(0, normalized.limit)
    .map((item) => {
      const patientName = formatPatientName(
        patientInfoMap.get(item.item.patientId),
        item.item.patientId
      );
      return {
        dedupeKey: item.dedupeKey,
        patientId: item.item.patientId,
        title: `${patientName} appointment ${item.item.workflowStatus.replace(/_/g, " ")}`,
        message: `${patientName} has an appointment workflow state of ${item.item.workflowStatus.replace(/_/g, " ")} for ${item.item.startsAt.toISOString()}.${cleanString(item.item.note) ? ` Note: ${cleanString(item.item.note)}` : ""}`,
        audience: "clinician",
        taskId: item.clinicianTaskId,
        appointmentRequestId: item.item.requestId,
        linkedEntityType: "appointment_request",
        linkedEntityId: item.item.requestId,
        meta: {
          workflowStatus: item.item.workflowStatus,
          startsAt: item.item.startsAt.toISOString(),
          clinicianTaskId: item.clinicianTaskId,
        },
      } satisfies FollowThroughCandidate;
    });

  return {
    workflow: "appointment_follow_through",
    generatedAt,
    items,
    summary: {
      scanned: appointmentItems.length,
      actionable: items.length,
    },
  };
}

export async function processCommunicationNoResponseAutomation(
  options: ProcessOptions = {}
): Promise<FollowThroughProcessResult> {
  const normalized = normalizeProcessOptions(options);
  const generatedAt = normalized.now.toISOString();

  const reviews = await CommunicationReview.find({ needsResponse: true })
    .sort({ messageCreatedAt: 1, updatedAt: 1 })
    .limit(normalized.limit * 3)
    .lean();
  const patientInfoMap = await getPatientInfoMap(reviews.map((row) => row.patientId));

  const specs: Array<{
    dedupeKey: string;
    review: Record<string, unknown>;
    taskId?: string;
  }> = [];

  for (const review of reviews) {
    const patientId = cleanString(review.patientId);
    if (!patientId) {
      continue;
    }
    const patientInfo = patientInfoMap.get(patientId);
    const patientName = formatPatientName(patientInfo, patientId);
    const messageCreatedAt = asDate(review.messageCreatedAt) ?? asDate(review.updatedAt);
    if (!messageCreatedAt) {
      continue;
    }

    const thresholdMs = review.flaggedBySafety === true ? 6 * MS_PER_HOUR : 24 * MS_PER_HOUR;
    if (normalized.now.getTime() - messageCreatedAt.getTime() < thresholdMs) {
      continue;
    }

    const messageId = cleanString(review.messageId);
    if (!messageId) {
      continue;
    }

    const task = await upsertAutomationTask({
      patientId,
      match: {
        "source.entityType": "communication_no_response",
        "source.entityId": messageId,
      },
      create: {
        title: review.flaggedBySafety === true ? "Urgent message follow-up" : "Review message follow-up",
        description: `${patientName} has a message without clinician response since ${messageCreatedAt.toISOString()}.`,
        type: "communication",
        priority: review.flaggedBySafety === true ? "high" : "medium",
        dueAt: normalized.now,
        assignedTo: patientInfo?.clinicianId,
        createdBy: "automation:n8n:communication",
        source: {
          type: "automation",
          entityType: "communication_no_response",
          entityId: messageId,
          label: "Communication no-response escalation",
        },
        linkedMessageId: messageId,
        meta: {
          automation: {
            workflow: "communication_no_response_escalation",
            flaggedBySafety: review.flaggedBySafety === true,
            generatedAt,
          },
        },
      },
      update: {
        title: review.flaggedBySafety === true ? "Urgent message follow-up" : "Review message follow-up",
        description: `${patientName} has a message without clinician response since ${messageCreatedAt.toISOString()}.`,
        priority: review.flaggedBySafety === true ? "high" : "medium",
        dueAt: normalized.now,
        assignedTo: patientInfo?.clinicianId,
        linkedMessageId: messageId,
        meta: {
          automation: {
            workflow: "communication_no_response_escalation",
            flaggedBySafety: review.flaggedBySafety === true,
            generatedAt,
          },
        },
      },
    });

    specs.push({
      dedupeKey: `communication:${messageId}:${review.flaggedBySafety === true ? "6h" : "24h"}`,
      review,
      taskId: task?.id,
    });
  }

  const deliveredKeys = normalized.force
    ? new Set<string>()
    : await getDeliveredDedupeKeys(
        "communication_no_response_escalation",
        specs.map((item) => item.dedupeKey)
      );

  const items = specs
    .filter((item) => !deliveredKeys.has(item.dedupeKey))
    .slice(0, normalized.limit)
    .map((item) => {
      const patientId = cleanString(item.review.patientId) ?? "";
      const patientName = formatPatientName(patientInfoMap.get(patientId), patientId);
      const messagePreview = cleanString(item.review.messagePreview);
      const messageId = cleanString(item.review.messageId);
      return {
        dedupeKey: item.dedupeKey,
        patientId,
        title: `${patientName} message still needs response`,
        message: `${patientName} still has no clinician response recorded.${messagePreview ? ` Preview: ${messagePreview}` : ""}`,
        audience: "clinician",
        taskId: item.taskId,
        communicationReviewId: String(item.review._id ?? ""),
        linkedEntityType: "chat_message",
        linkedEntityId: messageId,
        meta: {
          flaggedBySafety: item.review.flaggedBySafety === true,
          messageCreatedAt: asIso(asDate(item.review.messageCreatedAt)),
          taskId: item.taskId,
        },
      } satisfies FollowThroughCandidate;
    });

  return {
    workflow: "communication_no_response_escalation",
    generatedAt,
    items,
    summary: {
      scanned: reviews.length,
      actionable: items.length,
    },
  };
}

export async function buildDailyClinicianDigest(
  options: ProcessOptions = {}
): Promise<FollowThroughProcessResult> {
  const normalized = normalizeProcessOptions(options);
  const generatedAt = normalized.now.toISOString();
  const dedupeKey = `daily-digest:${dayKey(normalized.now)}`;

  const alreadyDelivered = normalized.force
    ? false
    : (await getDeliveredDedupeKeys("daily_clinician_digest", [dedupeKey])).has(dedupeKey);

  if (alreadyDelivered) {
    return {
      workflow: "daily_clinician_digest",
      generatedAt,
      items: [],
      summary: { skipped: true, dedupeKey },
    };
  }

  const [summary, priorityQueue, followUpTasks, worklist] = await Promise.all([
    getDashboardSummary(),
    getPriorityQueue(undefined, 5),
    getDashboardFollowUpTasks(undefined, 5),
    listClinicianWorklist({ sort: "priority" }),
  ]);

  const patientsNeedingReview = worklist.filter((row) => row.priorityScore > 0).length;
  const overdueTaskCount = followUpTasks.filter((task) => {
    const dueAt = asDate(task.dueAt);
    return dueAt ? dueAt.getTime() <= normalized.now.getTime() : false;
  }).length;

  const highlightLines = priorityQueue.slice(0, 5).map((item) => {
    const label = item.itemType.replace(/_/g, " ");
    return `- [${item.priority}] ${label}: ${item.title}${cleanString(item.subtitle) ? ` — ${cleanString(item.subtitle)}` : ""}`;
  });

  const messageText = [
    "Aura Daily Digest",
    `Open alerts: ${summary.openAlertsCount}`,
    `Overdue follow-up tasks: ${overdueTaskCount}`,
    `Missed check-ins: ${summary.missedCheckinsCount}`,
    `Appointments today: ${summary.todayAppointmentsCount}`,
    `Messages needing response: ${summary.messagesNeedingResponseCount}`,
    `Patients needing review: ${patientsNeedingReview}`,
    highlightLines.length > 0 ? `\nTop priorities:\n${highlightLines.join("\n")}` : "\nNo priority queue items right now.",
  ].join("\n");

  return {
    workflow: "daily_clinician_digest",
    generatedAt,
    items: [
      {
        dedupeKey,
        patientId: "system",
        title: "Daily clinician digest",
        message: messageText,
        audience: "clinician",
        linkedEntityType: "digest",
        linkedEntityId: dedupeKey,
      },
    ],
    messageText,
    summary: {
      ...summary,
      overdueTaskCount,
      patientsNeedingReview,
    },
  };
}
