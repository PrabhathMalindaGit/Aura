import type { Href } from "expo-router";

import type { AppointmentRequestItem } from "@/src/api/appointments";
import type { PatientTaskItem } from "@/src/types/task";
import type {
  ReminderGroup,
  ReminderItem,
  ReminderReadState,
  ReminderSourceType,
  ReminderStatus,
  ReminderTone,
} from "@/src/types/reminder";
import { formatRelativeFromNow } from "@/src/utils/date";
import {
  appointmentWorkflowTone,
  formatAppointmentRelativeLabel,
  formatAppointmentWorkflowLabel,
  formatAppointmentTimeRange,
  getAppointmentWorkflowStatus,
} from "@/src/utils/appointments";
import {
  derivePatientTaskAction,
  formatTaskDueDetail,
  formatTaskDueLabel,
  formatTaskSupportText,
  isCommunicationTask,
  isTaskActive,
} from "@/src/utils/tasks";

function parseDate(value?: string): Date | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function hoursFromNow(value?: string, now = new Date()): number | null {
  const parsed = parseDate(value);
  if (!parsed) {
    return null;
  }
  return (parsed.getTime() - now.getTime()) / (60 * 60 * 1000);
}

function isRecentPast(value?: string, now = new Date(), hours = 72): boolean {
  const parsed = parseDate(value);
  if (!parsed) {
    return false;
  }
  const deltaHours = (now.getTime() - parsed.getTime()) / (60 * 60 * 1000);
  return deltaHours >= 0 && deltaHours <= hours;
}

function statusWeight(status: ReminderStatus): number {
  if (status === "overdue") {
    return 0;
  }
  if (status === "due") {
    return 1;
  }
  if (status === "unread") {
    return 2;
  }
  if (status === "informational") {
    return 3;
  }
  if (status === "read") {
    return 4;
  }
  return 5;
}

function groupWeight(group: ReminderGroup): number {
  if (group === "attention") {
    return 0;
  }
  if (group === "soon") {
    return 1;
  }
  return 2;
}

function taskGroupAndStatus(
  task: PatientTaskItem,
  now: Date,
): {
  group: ReminderGroup;
  status: ReminderStatus;
  tone: ReminderTone;
} | null {
  if (task.status === "completed") {
    if (!isRecentPast(task.completedAt ?? task.updatedAt, now)) {
      return null;
    }
    return {
      group: "recent",
      status: "completed",
      tone: "success",
    };
  }

  if (task.status === "cancelled") {
    if (!isRecentPast(task.cancelledAt ?? task.updatedAt, now)) {
      return null;
    }
    return {
      group: "recent",
      status: "informational",
      tone: "neutral",
    };
  }

  const dueLabel = formatTaskDueLabel(task, now);
  if (dueLabel === "Overdue") {
    return {
      group: "attention",
      status: "overdue",
      tone: "warning",
    };
  }

  if (
    dueLabel === "Due today" ||
    task.priority === "urgent" ||
    isCommunicationTask(task)
  ) {
    return {
      group: "attention",
      status: "due",
      tone: "warning",
    };
  }

  return {
    group: "soon",
    status: "unread",
    tone: "info",
  };
}

function appointmentGroupAndStatus(
  item: AppointmentRequestItem,
  now: Date,
): {
  group: ReminderGroup;
  status: ReminderStatus;
  tone: ReminderTone;
} | null {
  const workflowStatus = getAppointmentWorkflowStatus(item);

  if (workflowStatus === "missed" || workflowStatus === "reschedule_requested") {
    return {
      group: "attention",
      status: workflowStatus === "missed" ? "overdue" : "due",
      tone: "warning",
    };
  }

  if (workflowStatus === "awaiting_confirmation") {
    return {
      group: "soon",
      status: "informational",
      tone: "info",
    };
  }

  if (workflowStatus === "upcoming") {
    const hoursUntil = hoursFromNow(item.startsAt, now);
    if (hoursUntil !== null && hoursUntil <= 48) {
      return {
        group: "soon",
        status: "due",
        tone: "info",
      };
    }
    return {
      group: "soon",
      status: "informational",
      tone: "info",
    };
  }

  if (workflowStatus === "completed") {
    if (!isRecentPast(item.startsAt, now)) {
      return null;
    }
    return {
      group: "recent",
      status: "completed",
      tone: "success",
    };
  }

  if (item.status === "rejected" || item.status === "canceled") {
    if (!isRecentPast(item.reviewedAt ?? item.createdAt, now)) {
      return null;
    }
    return {
      group: "recent",
      status: "informational",
      tone: "neutral",
    };
  }

  return null;
}

function buildTaskReminder(
  task: PatientTaskItem,
  readState: ReminderReadState,
  now: Date,
): ReminderItem | null {
  const meta = taskGroupAndStatus(task, now);
  if (!meta) {
    return null;
  }

  const reminderId = `task:${task.id}:${task.status}:${meta.group}:${meta.status}:${task.dueAt ?? "none"}:${task.updatedAt}`;
  const action = derivePatientTaskAction(task);
  const unread = !readState.readById[reminderId];
  const dueLabel = formatTaskDueLabel(task, now);
  const detailLabel = formatTaskDueDetail(task);
  const sourceType: ReminderSourceType = isCommunicationTask(task)
    ? "communication"
    : action.icon === "checkin"
      ? "checkin_followup"
      : "task";

  return {
    id: reminderId,
    sourceType,
    title: task.title,
    message: formatTaskSupportText(task),
    status:
      task.status === "completed"
        ? "completed"
        : meta.status === "overdue"
          ? "overdue"
          : meta.status === "due"
            ? "due"
            : unread
              ? "unread"
              : "read",
    tone: meta.tone,
    group: meta.group,
    unread,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    dueAt: task.dueAt,
    linkedEntityId: task.id,
    linkedRoute: action.href,
    primaryActionLabel: action.label,
    primaryActionIcon: action.icon,
    timingLabel:
      task.status === "completed" && task.completedAt
        ? `Completed ${formatRelativeFromNow(Date.parse(task.completedAt))}`
        : detailLabel ?? dueLabel,
    statusLabel:
      task.status === "completed"
        ? "Completed"
        : meta.status === "overdue"
          ? "Overdue"
          : meta.group === "attention"
            ? "Needs attention"
            : meta.group === "soon"
              ? "Coming up"
              : "Update",
    chips: [dueLabel, task.sourceLabel].filter((value): value is string => Boolean(value)),
    completableTaskId:
      task.patientCompletable && isTaskActive(task) ? task.id : undefined,
  };
}

function buildAppointmentReminder(
  item: AppointmentRequestItem,
  readState: ReminderReadState,
  now: Date,
): ReminderItem | null {
  const meta = appointmentGroupAndStatus(item, now);
  if (!meta) {
    return null;
  }

  const workflowStatus = getAppointmentWorkflowStatus(item);
  const reminderId = `appointment:${item.requestId}:${workflowStatus}:${meta.group}:${meta.status}:${item.reviewedAt ?? item.createdAt}`;
  const unread = !readState.readById[reminderId];
  const relativeLabel = formatAppointmentRelativeLabel(item, now);
  const linkedRoute: Href =
    workflowStatus === "upcoming"
      ? { pathname: "/appointments", params: { mode: "upcoming" } }
      : { pathname: "/appointments", params: { mode: "requests" } };

  const title =
    workflowStatus === "missed"
      ? "Missed appointment follow-up"
      : workflowStatus === "reschedule_requested"
        ? "Appointment needs a new time"
        : workflowStatus === "awaiting_confirmation"
          ? "Appointment request update"
          : workflowStatus === "completed"
            ? "Appointment completed"
            : item.status === "rejected"
              ? "Appointment request update"
              : item.status === "canceled"
                ? "Appointment canceled"
                : "Upcoming appointment";

  const message =
    workflowStatus === "missed"
      ? "Open your appointments to review the missed session and choose the next step."
      : workflowStatus === "reschedule_requested"
        ? "Your care team needs a new appointment time from you."
        : workflowStatus === "awaiting_confirmation"
          ? "Your care team is reviewing the time you requested."
          : workflowStatus === "completed"
            ? "Your latest session was marked complete."
            : item.status === "rejected"
              ? "Your previous appointment request was not approved."
              : item.status === "canceled"
                ? "This appointment is no longer scheduled."
                : relativeLabel
                  ? `Your next session is ${relativeLabel.toLowerCase()}.`
                  : "Review your upcoming appointment details.";

  return {
    id: reminderId,
    sourceType: "appointment",
    title,
    message,
    status:
      meta.status === "overdue"
        ? "overdue"
        : meta.status === "due"
          ? "due"
          : workflowStatus === "completed"
            ? "completed"
            : unread
              ? "unread"
              : "read",
    tone:
      workflowStatus === "completed"
        ? "success"
        : appointmentWorkflowTone(workflowStatus) === "warning" ||
            appointmentWorkflowTone(workflowStatus) === "danger"
          ? "warning"
          : meta.tone,
    group: meta.group,
    unread,
    createdAt: item.createdAt,
    updatedAt: item.reviewedAt ?? item.createdAt,
    dueAt: item.startsAt,
    linkedEntityId: item.requestId,
    linkedRoute,
    primaryActionLabel:
      workflowStatus === "upcoming" ? "Open appointment" : "Review appointment",
    primaryActionIcon: "appointments",
    timingLabel:
      workflowStatus === "completed"
        ? `Completed ${formatRelativeFromNow(Date.parse(item.startsAt))}`
        : relativeLabel ?? formatAppointmentTimeRange(item),
    statusLabel:
      workflowStatus === "missed"
        ? "Needs attention"
        : workflowStatus === "reschedule_requested"
          ? "Reschedule"
          : workflowStatus === "completed"
            ? "Completed"
            : workflowStatus === "awaiting_confirmation"
              ? "Under review"
              : "Coming up",
    chips: [
      formatAppointmentWorkflowLabel(workflowStatus),
      relativeLabel,
    ].filter((value): value is string => Boolean(value)),
  };
}

export function buildReminderItems(
  tasks: PatientTaskItem[],
  requests: AppointmentRequestItem[],
  readState: ReminderReadState,
  now = new Date(),
): ReminderItem[] {
  const reminders = [
    ...tasks
      .map((task) => buildTaskReminder(task, readState, now))
      .filter((item): item is ReminderItem => Boolean(item)),
    ...requests
      .map((item) => buildAppointmentReminder(item, readState, now))
      .filter((item): item is ReminderItem => Boolean(item)),
  ];

  return reminders.sort((left, right) => {
    const groupDelta = groupWeight(left.group) - groupWeight(right.group);
    if (groupDelta !== 0) {
      return groupDelta;
    }

    if (left.unread !== right.unread) {
      return left.unread ? -1 : 1;
    }

    const statusDelta = statusWeight(left.status) - statusWeight(right.status);
    if (statusDelta !== 0) {
      return statusDelta;
    }

    const leftDue = parseDate(left.dueAt)?.getTime() ?? Number.POSITIVE_INFINITY;
    const rightDue = parseDate(right.dueAt)?.getTime() ?? Number.POSITIVE_INFINITY;
    if (leftDue !== rightDue) {
      return leftDue - rightDue;
    }

    return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
  });
}

export function splitReminderGroups(reminders: ReminderItem[]): Record<ReminderGroup, ReminderItem[]> {
  return {
    attention: reminders.filter((item) => item.group === "attention"),
    soon: reminders.filter((item) => item.group === "soon"),
    recent: reminders.filter((item) => item.group === "recent"),
  };
}

export function countUnreadReminders(reminders: ReminderItem[]): number {
  return reminders.filter((item) => item.unread).length;
}

export function buildReminderPreview(reminders: ReminderItem[], limit = 3): ReminderItem[] {
  return reminders.slice(0, Math.max(1, limit));
}
