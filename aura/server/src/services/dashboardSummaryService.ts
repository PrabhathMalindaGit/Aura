import { Types } from "mongoose";

import Alert from "../models/Alert";
import CareEvent from "../models/CareEvent";
import ChatMessage from "../models/ChatMessage";
import InsightSuggestion from "../models/InsightSuggestion";
import Patient from "../models/Patient";
import Task from "../models/Task";
import { listAppointmentWorkflowItems } from "./appointmentWorkflowService";
import {
  countCommunicationsNeedingResponse,
  getCommunicationOverviewCounts,
  listRecentCommunicationNeedingResponse,
} from "./communicationReviewService";
import { listTasks } from "./taskService";
import { listClinicianWorklist } from "./worklistService";

export type DashboardPriorityQueueItem = {
  id: string;
  itemType:
    | "alert"
    | "task"
    | "missed_checkin"
    | "communication"
    | "appointment_exception";
  patientId: string;
  title: string;
  subtitle?: string;
  priority: "low" | "medium" | "high" | "urgent";
  status: string;
  source: string;
  createdAt: string;
  dueAt?: string;
  linkedEntityId?: string;
  linkedEntityType?: string;
  meta?: Record<string, unknown>;
};

function toDate(value: unknown): Date | null {
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

function toIso(value: Date | null | undefined): string {
  return (value instanceof Date && Number.isFinite(value.getTime()) ? value : new Date(0)).toISOString();
}

function startOfUtcDay(reference = new Date()): Date {
  return new Date(
    Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate())
  );
}

function endOfUtcDay(reference = new Date()): Date {
  const start = startOfUtcDay(reference);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

function priorityRank(priority: DashboardPriorityQueueItem["priority"]): number {
  if (priority === "urgent") {
    return 0;
  }
  if (priority === "high") {
    return 1;
  }
  if (priority === "medium") {
    return 2;
  }
  return 3;
}

function cleanString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export async function getDashboardSummary(clinicianId?: string) {
  const [openAlertsCount, pendingInsightsCount, openFollowUpTasksCount, messagesNeedingResponseCount, worklist, todaysAppointments] =
    await Promise.all([
      Alert.countDocuments({ status: "open" }),
      InsightSuggestion.countDocuments({ status: "pending" }),
      Task.countDocuments({ status: { $in: ["open", "in_progress"] } }),
      countCommunicationsNeedingResponse(),
      listClinicianWorklist({}, clinicianId),
      listAppointmentWorkflowItems({
        clinicianId,
        from: startOfUtcDay(),
        to: endOfUtcDay(),
      }),
    ]);

  const assignedToMeAlertsCount = clinicianId
    ? await Alert.countDocuments({ status: "open", assignedTo: clinicianId })
    : 0;

  return {
    openAlertsCount,
    assignedToMeAlertsCount,
    pendingInsightsCount,
    todayAppointmentsCount: todaysAppointments.length,
    missedCheckinsCount: worklist.filter((item) => item.missedCheckins.flag).length,
    openFollowUpTasksCount,
    messagesNeedingResponseCount,
  };
}

export async function getTodayAppointments(clinicianId?: string) {
  const items = await listAppointmentWorkflowItems({
    clinicianId,
    from: startOfUtcDay(),
    to: endOfUtcDay(),
  });

  return items.map((item) => ({
    id: item.requestId,
    patientId: item.patientId,
    clinicianId: item.clinicianId,
    startsAt: item.startsAt.toISOString(),
    endsAt: item.endsAt.toISOString(),
    status: item.workflowStatus,
    requestStatus: item.requestStatus,
    modality: item.modality,
    meetingLink: item.meetingLink,
    note: item.note,
    updatedAt: toIso(item.updatedAt),
  }));
}

export async function getDashboardFollowUpTasks(clinicianId?: string, limit = 10) {
  const tasks = await listTasks({
    status: ["open", "in_progress"],
    assignedTo: clinicianId,
    sortBy: "priority",
  });

  return tasks.slice(0, limit).map((task) => ({
    id: task.id,
    patientId: task.patientId,
    title: task.title,
    priority: task.priority,
    status: task.status,
    dueAt: task.dueAt,
    type: task.type,
    linkedAlertId: task.linkedAlertId,
    linkedAppointmentId: task.linkedAppointmentId,
    linkedMessageId: task.linkedMessageId,
    updatedAt: task.updatedAt,
  }));
}

export async function getCommunicationOverview(limit = 10) {
  const [counts, reviews] = await Promise.all([
    getCommunicationOverviewCounts(),
    listRecentCommunicationNeedingResponse(limit),
  ]);

  const patientIds = [...new Set(reviews.map((review) => review.patientId).filter(Boolean))];
  const messageIds = reviews
    .map((review) => cleanString(review.messageId))
    .filter((value): value is string => Boolean(value));

  const [patients, messages] = await Promise.all([
    Patient.find({ patientId: { $in: patientIds } })
      .select({ patientId: 1, displayName: 1 })
      .lean(),
    ChatMessage.find({ _id: { $in: messageIds.filter((value) => Types.ObjectId.isValid(value)) } })
      .select({ text: 1 })
      .lean(),
  ]);

  const patientNameMap = new Map(
    patients.map((row) => [row.patientId, cleanString(row.displayName)])
  );
  const messagePreviewMap = new Map(
    messages.map((row) => [String(row._id), cleanString(row.text)])
  );

  return {
    counts,
    items: reviews.map((review) => ({
      id: String(review._id),
      patientId: review.patientId,
      patientName: patientNameMap.get(review.patientId) ?? review.patientId,
      messageId: review.messageId,
      needsResponse: review.needsResponse === true,
      flaggedBySafety: review.flaggedBySafety === true,
      followUpRequested: review.followUpRequested === true,
      linkedTaskId: cleanString(review.linkedTaskId),
      messageCreatedAt: toIso(toDate(review.messageCreatedAt)),
      messagePreview:
        cleanString(review.messagePreview) ??
        messagePreviewMap.get(cleanString(review.messageId) ?? "") ??
        undefined,
    })),
  };
}

export async function getRecentSafetyEvents(limit = 20) {
  const events = await CareEvent.find({
    type: {
      $in: [
        "ALERT_CREATED",
        "NOTIFICATION_ATTEMPTED",
        "NOTIFICATION_SENT",
        "NOTIFICATION_FAILED",
        "NOTIFICATION_SKIPPED",
      ],
    },
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  const alertIds = events
    .map((event) => cleanString(event.alertId))
    .filter((value): value is string => Boolean(value) && Types.ObjectId.isValid(value));
  const alerts = alertIds.length
    ? await Alert.find({ _id: { $in: alertIds } })
        .select({ reason: 1, status: 1, notification: 1 })
        .lean()
    : [];
  const alertMap = new Map(alerts.map((alert) => [String(alert._id), alert]));

  return events.map((event) => {
    const alert = cleanString(event.alertId) ? alertMap.get(event.alertId) : undefined;
    return {
      id: String(event._id),
      type: event.type,
      patientId: event.patientId,
      alertId: cleanString(event.alertId),
      createdAt: toIso(toDate(event.createdAt)),
      summary:
        cleanString(
          event.payload && typeof event.payload === "object"
            ? (event.payload as Record<string, unknown>).error
            : undefined
        ) ??
        cleanString(alert?.reason) ??
        event.type,
      alertStatus: cleanString(alert?.status),
      notificationStatus:
        alert?.notification &&
        typeof alert.notification === "object" &&
        !Array.isArray(alert.notification)
          ? cleanString((alert.notification as Record<string, unknown>).status)
          : undefined,
      meta:
        event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
          ? (event.payload as Record<string, unknown>)
          : undefined,
    };
  });
}

async function buildAlertPriorityItems(limit: number): Promise<DashboardPriorityQueueItem[]> {
  const alerts = await Alert.find({ status: "open" })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return alerts.map((alert) => ({
    id: String(alert._id),
    itemType: "alert",
    patientId: alert.patientId,
    title: alert.assignedTo ? "Assigned high-risk alert" : "Unassigned high-risk alert",
    subtitle: cleanString(alert.reason),
    priority: alert.assignedTo ? "high" : "urgent",
    status: alert.status,
    source: cleanString(alert.source?.type) ?? "alert",
    createdAt: toIso(toDate(alert.createdAt)),
    linkedEntityId: String(alert._id),
    linkedEntityType: "alert",
    meta: {
      assignedTo: cleanString(alert.assignedTo),
      notificationStatus:
        alert.notification && typeof alert.notification === "object"
          ? cleanString((alert.notification as Record<string, unknown>).status)
          : undefined,
    },
  }));
}

async function buildTaskPriorityItems(limit: number): Promise<DashboardPriorityQueueItem[]> {
  const tasks = await listTasks({
    status: ["open", "in_progress"],
    sortBy: "priority",
  });

  const dueSoonCutoff = Date.now() + 24 * 60 * 60 * 1000;

  return tasks
    .filter((task) => {
      const dueAtMs = task.dueAt ? Date.parse(task.dueAt) : Number.NaN;
      const isDueSoon = Number.isFinite(dueAtMs) && dueAtMs <= dueSoonCutoff;
      return task.priority === "urgent" || task.priority === "high" || !task.dueAt || isDueSoon;
    })
    .slice(0, limit)
    .map((task) => ({
      id: task.id,
      itemType: "task",
      patientId: task.patientId,
      title: task.title,
      subtitle: task.description,
      priority:
        task.priority === "urgent" || task.priority === "high"
          ? task.priority
          : "medium",
      status: task.status,
      source: cleanString(task.source?.type) ?? "task",
      createdAt: task.createdAt,
      dueAt: task.dueAt,
      linkedEntityId: task.id,
      linkedEntityType: "task",
      meta: {
        type: task.type,
        assignedTo: task.assignedTo,
      },
    }));
}

async function buildMissedCheckinPriorityItems(limit: number): Promise<DashboardPriorityQueueItem[]> {
  const worklist = await listClinicianWorklist({
    missedCheckins: true,
    sort: "priority",
  });

  return worklist.slice(0, limit).map((item) => ({
    id: `missed-checkin:${item.patientId}`,
    itemType: "missed_checkin",
    patientId: item.patientId,
    title: `${item.patientName} missed check-ins`,
    subtitle: `${item.missedCheckins.count} missed beyond the expected cadence`,
    priority: item.openAlertsCount > 0 || item.latestRiskLevel === "high" ? "high" : "medium",
    status: "pending_review",
    source: "checkin",
    createdAt: item.updatedAt,
    linkedEntityId: item.patientId,
    linkedEntityType: "patient",
    meta: {
      missedCheckins: item.missedCheckins.count,
    },
  }));
}

async function buildCommunicationPriorityItems(
  limit: number
): Promise<DashboardPriorityQueueItem[]> {
  const overview = await getCommunicationOverview(limit);

  return overview.items.map((item) => ({
    id: item.id,
    itemType: "communication",
    patientId: item.patientId,
    title: `${item.patientName} message needs review`,
    subtitle: item.messagePreview,
    priority: item.flaggedBySafety ? "high" : "medium",
    status: item.needsResponse ? "needs_response" : "tracked",
    source: "chat",
    createdAt: item.messageCreatedAt,
    linkedEntityId: item.messageId,
    linkedEntityType: "chat_message",
    meta: {
      flaggedBySafety: item.flaggedBySafety,
      linkedTaskId: item.linkedTaskId,
    },
  }));
}

async function buildAppointmentPriorityItems(
  clinicianId: string | undefined,
  limit: number
): Promise<DashboardPriorityQueueItem[]> {
  const items = await listAppointmentWorkflowItems({
    clinicianId,
    workflowStatuses: ["missed", "reschedule_requested", "awaiting_confirmation"],
    limit,
  });

  return items.slice(0, limit).map((item) => ({
    id: item.requestId,
    itemType: "appointment_exception",
    patientId: item.patientId,
    title: `Appointment ${item.workflowStatus.replace(/_/g, " ")}`,
    subtitle: cleanString(item.note) ?? `${item.startsAt.toISOString()} appointment workflow`,
    priority:
      item.workflowStatus === "missed"
        ? "high"
        : item.workflowStatus === "reschedule_requested"
          ? "high"
          : "medium",
    status: item.workflowStatus,
    source: "appointments",
    createdAt: toIso(item.createdAt),
    dueAt: item.startsAt.toISOString(),
    linkedEntityId: item.requestId,
    linkedEntityType: "appointment_request",
    meta: {
      slotId: item.slotId,
      clinicianId: item.clinicianId,
    },
  }));
}

export async function getPriorityQueue(
  clinicianId?: string,
  limit = 25
): Promise<DashboardPriorityQueueItem[]> {
  const results = await Promise.allSettled([
    buildAlertPriorityItems(limit),
    buildTaskPriorityItems(limit),
    buildMissedCheckinPriorityItems(limit),
    buildCommunicationPriorityItems(limit),
    buildAppointmentPriorityItems(clinicianId, limit),
  ]);

  const items = results.flatMap((result) =>
    result.status === "fulfilled" ? result.value : []
  );

  return items
    .sort((left, right) => {
      const priorityDelta = priorityRank(left.priority) - priorityRank(right.priority);
      if (priorityDelta !== 0) {
        return priorityDelta;
      }
      return Date.parse(right.createdAt) - Date.parse(left.createdAt);
    })
    .slice(0, limit);
}
