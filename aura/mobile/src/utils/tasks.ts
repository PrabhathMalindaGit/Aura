import type { Href } from "expo-router";

import type { AppointmentRequestItem } from "@/src/api/appointments";
import type { DomainIconKey } from "@/src/components/IconSet";
import type { MediaCardChip } from "@/src/components/MediaCard";
import type { StatusPillVariant } from "@/src/components/StatusPill";
import type { PatientTaskItem, PatientTaskPriority } from "@/src/types/task";
import {
  appointmentWorkflowTone,
  formatAppointmentRelativeLabel,
  formatAppointmentWorkflowLabel,
  getAppointmentWorkflowStatus,
} from "@/src/utils/appointments";

export type PatientTaskAction = {
  label: string;
  href: Href;
  icon: DomainIconKey;
};

export type HomeWorkflowPrompt = {
  id: string;
  kind: "communication" | "task" | "appointment";
  title: string;
  text: string;
  chips?: string[];
  tone: "info" | "warning" | "success" | "neutral";
  action: PatientTaskAction;
};

const PRIORITY_WEIGHT: Record<PatientTaskPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function parseDate(value?: string): Date | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function isSameDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function normalizeActionKind(value?: string): string | null {
  if (!value) {
    return null;
  }
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return normalized.length > 0 ? normalized : null;
}

function taskText(task: PatientTaskItem): string {
  return [task.title, task.description, task.sourceLabel].filter(Boolean).join(" ").toLowerCase();
}

function fallbackTaskText(task: PatientTaskItem): string {
  if (task.type === "communication" || task.linkedMessageId) {
    return "Your care team is waiting for a reply.";
  }
  if (task.type === "appointment" || task.linkedAppointmentId) {
    return "There is appointment planning to review.";
  }
  if (task.type === "adherence_review") {
    return "There is a rehab follow-up step waiting for today.";
  }
  if (task.type === "safety_review") {
    return "Please review the latest care guidance with your team.";
  }
  return "There is a follow-up step waiting for you.";
}

function buildChatAction(label = "Reply in chat"): PatientTaskAction {
  return {
    label,
    href: { pathname: "/(tabs)/chat", params: { focusComposer: "1" } },
    icon: "chat",
  };
}

function buildCheckinAction(label = "Open check-in"): PatientTaskAction {
  return {
    label,
    href: "/(tabs)/checkin",
    icon: "checkin",
  };
}

function buildAppointmentsAction(label = "Open appointments", mode?: "book" | "requests" | "upcoming"): PatientTaskAction {
  return {
    label,
    href: mode ? { pathname: "/appointments", params: { mode } } : "/appointments",
    icon: "appointments",
  };
}

function buildExercisePlanAction(label = "Open plan"): PatientTaskAction {
  return {
    label,
    href: "/exercise-plan",
    icon: "exercise",
  };
}

function buildProgressAction(label = "Open progress"): PatientTaskAction {
  return {
    label,
    href: "/(tabs)/progress",
    icon: "progress",
  };
}

export function isTaskActive(task: PatientTaskItem): boolean {
  return task.status === "open" || task.status === "in_progress";
}

export function isCommunicationTask(task: PatientTaskItem): boolean {
  const hint = normalizeActionKind(task.patientAction?.kind);
  return (
    task.type === "communication" ||
    Boolean(task.linkedMessageId) ||
    hint === "chat" ||
    hint === "message"
  );
}

export function derivePatientTaskAction(task: PatientTaskItem): PatientTaskAction {
  const explicitKind = normalizeActionKind(task.patientAction?.kind);
  const explicitLabel = task.patientAction?.label;
  if (explicitKind === "chat" || explicitKind === "message") {
    return buildChatAction(explicitLabel ?? "Reply in chat");
  }
  if (explicitKind === "checkin" || explicitKind === "check_in" || explicitKind === "pain_check") {
    return buildCheckinAction(explicitLabel ?? "Open check-in");
  }
  if (explicitKind === "appointments" || explicitKind === "appointment") {
    return buildAppointmentsAction(explicitLabel ?? "Open appointments", "requests");
  }
  if (explicitKind === "exercise_plan" || explicitKind === "rehab_plan") {
    return buildExercisePlanAction(explicitLabel ?? "Open plan");
  }
  if (explicitKind === "progress") {
    return buildProgressAction(explicitLabel ?? "Open progress");
  }

  const text = taskText(task);
  if (isCommunicationTask(task)) {
    return buildChatAction(task.patientAction?.label ?? "Reply in chat");
  }
  if (task.linkedAppointmentId || task.type === "appointment" || text.includes("appointment")) {
    return buildAppointmentsAction(task.patientAction?.label ?? "Open appointments", "requests");
  }
  if (text.includes("check-in") || text.includes("check in") || text.includes("pain check")) {
    return buildCheckinAction(task.patientAction?.label ?? "Open check-in");
  }
  if (
    text.includes("exercise") ||
    text.includes("rehab") ||
    text.includes("plan") ||
    text.includes("session")
  ) {
    return buildExercisePlanAction(task.patientAction?.label ?? "Open plan");
  }
  if (text.includes("progress") || text.includes("report")) {
    return buildProgressAction(task.patientAction?.label ?? "Open progress");
  }

  return buildChatAction(task.patientAction?.label ?? "Message care team");
}

export function getTaskIcon(task: PatientTaskItem): DomainIconKey {
  return derivePatientTaskAction(task).icon;
}

export function formatTaskDueLabel(task: PatientTaskItem, now = new Date()): string | undefined {
  const dueAt = parseDate(task.dueAt);
  if (!dueAt) {
    return undefined;
  }

  if (dueAt.getTime() < now.getTime()) {
    return "Overdue";
  }

  if (isSameDay(dueAt, now)) {
    return "Due today";
  }

  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (isSameDay(dueAt, tomorrow)) {
    return "Due tomorrow";
  }

  return `Due ${dueAt.toLocaleDateString([], {
    month: "short",
    day: "numeric",
  })}`;
}

export function formatTaskDueDetail(task: PatientTaskItem): string | undefined {
  const dueAt = parseDate(task.dueAt);
  if (!dueAt) {
    return undefined;
  }

  return dueAt.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatTaskStatusLabel(task: PatientTaskItem): string {
  if (task.status === "completed") {
    return "Done";
  }
  if (task.status === "cancelled") {
    return "No longer needed";
  }
  if (task.status === "in_progress") {
    return "In progress";
  }

  const dueLabel = formatTaskDueLabel(task);
  return dueLabel ?? "Open";
}

export function taskStatusVariant(task: PatientTaskItem): StatusPillVariant {
  if (task.status === "completed") {
    return "success";
  }
  if (task.status === "cancelled") {
    return "neutral";
  }

  const dueLabel = formatTaskDueLabel(task);
  if (dueLabel === "Overdue") {
    return "danger";
  }
  if (dueLabel === "Due today" || task.priority === "urgent") {
    return "warning";
  }
  if (task.status === "in_progress") {
    return "info";
  }
  return "neutral";
}

export function taskPriorityChip(task: PatientTaskItem): MediaCardChip | null {
  if (task.priority === "medium") {
    return null;
  }

  return {
    text: task.priority === "urgent" ? "Urgent" : task.priority === "high" ? "High priority" : "Low priority",
    tone:
      task.priority === "urgent"
        ? "danger"
        : task.priority === "high"
          ? "warning"
          : "muted",
  };
}

export function buildTaskChips(task: PatientTaskItem): MediaCardChip[] {
  const chips: MediaCardChip[] = [];
  const dueLabel = formatTaskDueLabel(task);
  if (dueLabel && task.status !== "completed") {
    chips.push({
      text: dueLabel,
      tone: dueLabel === "Overdue" ? "danger" : dueLabel === "Due today" ? "warning" : "muted",
    });
  }

  const priorityChip = taskPriorityChip(task);
  if (priorityChip) {
    chips.push(priorityChip);
  }

  if (task.sourceLabel) {
    chips.push({ text: task.sourceLabel, tone: "muted" });
  }

  if (task.status === "completed" && task.completedAt) {
    chips.push({ text: "Completed", tone: "success" });
  }

  return chips;
}

export function formatTaskSupportText(task: PatientTaskItem): string {
  return task.description?.trim() || fallbackTaskText(task);
}

export function compareActiveTasks(left: PatientTaskItem, right: PatientTaskItem): number {
  const leftDue = parseDate(left.dueAt)?.getTime() ?? Number.POSITIVE_INFINITY;
  const rightDue = parseDate(right.dueAt)?.getTime() ?? Number.POSITIVE_INFINITY;
  if (leftDue !== rightDue) {
    return leftDue - rightDue;
  }

  const priorityDelta = PRIORITY_WEIGHT[left.priority] - PRIORITY_WEIGHT[right.priority];
  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
}

export function compareCompletedTasks(left: PatientTaskItem, right: PatientTaskItem): number {
  const leftTs = parseDate(left.completedAt)?.getTime() ?? Date.parse(left.updatedAt);
  const rightTs = parseDate(right.completedAt)?.getTime() ?? Date.parse(right.updatedAt);
  return rightTs - leftTs;
}

export function buildHomeWorkflowPrompts(
  tasks: PatientTaskItem[],
  requests: AppointmentRequestItem[],
): HomeWorkflowPrompt[] {
  const prompts: HomeWorkflowPrompt[] = [];

  const activeTasks = tasks.filter((task) => isTaskActive(task)).sort(compareActiveTasks);
  const communicationTask = activeTasks.find((task) => isCommunicationTask(task));
  if (communicationTask) {
    const action = derivePatientTaskAction(communicationTask);
    prompts.push({
      id: `communication-${communicationTask.id}`,
      kind: "communication",
      title: communicationTask.title,
      text: formatTaskSupportText(communicationTask),
      chips: [formatTaskDueLabel(communicationTask), communicationTask.sourceLabel].filter(
        (value): value is string => Boolean(value),
      ),
      tone: taskStatusVariant(communicationTask) === "danger" ? "warning" : "info",
      action,
    });
  }

  const nextTask = activeTasks.find((task) => !isCommunicationTask(task));
  if (nextTask) {
    prompts.push({
      id: `task-${nextTask.id}`,
      kind: "task",
      title: nextTask.title,
      text: formatTaskSupportText(nextTask),
      chips: [formatTaskDueLabel(nextTask), nextTask.sourceLabel].filter(
        (value): value is string => Boolean(value),
      ),
      tone:
        taskStatusVariant(nextTask) === "danger"
          ? "warning"
          : taskStatusVariant(nextTask) === "warning"
            ? "warning"
            : "neutral",
      action: derivePatientTaskAction(nextTask),
    });
  }

  const activeRequests = [...requests].sort(
    (left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt),
  );
  const appointmentItem =
    activeRequests.find((item) => {
      const status = getAppointmentWorkflowStatus(item);
      return status === "missed" || status === "reschedule_requested";
    }) ??
    activeRequests.find((item) => getAppointmentWorkflowStatus(item) === "awaiting_confirmation") ??
    activeRequests.find((item) => getAppointmentWorkflowStatus(item) === "upcoming") ??
    null;

  if (appointmentItem) {
    const workflowStatus = getAppointmentWorkflowStatus(appointmentItem);
    const relativeLabel = formatAppointmentRelativeLabel(appointmentItem);
    prompts.push({
      id: `appointment-${appointmentItem.requestId}`,
      kind: "appointment",
      title:
        workflowStatus === "awaiting_confirmation"
          ? "Appointment request pending"
          : workflowStatus === "reschedule_requested"
            ? "Appointment needs reschedule"
            : workflowStatus === "missed"
              ? "Appointment follow-up"
              : "Next appointment",
      text:
        workflowStatus === "awaiting_confirmation"
          ? "Your care team is reviewing the time you requested."
          : workflowStatus === "reschedule_requested"
            ? "Choose another time when you are ready."
            : workflowStatus === "missed"
              ? "Open your appointment details to request a new time."
              : relativeLabel ?? "Review your upcoming appointment details.",
      chips: [
        formatAppointmentWorkflowLabel(workflowStatus),
        relativeLabel,
      ].filter((value): value is string => Boolean(value)),
      tone:
        appointmentWorkflowTone(workflowStatus) === "danger"
          ? "warning"
          : appointmentWorkflowTone(workflowStatus) === "success"
            ? "success"
            : appointmentWorkflowTone(workflowStatus) === "warning"
              ? "warning"
              : "info",
      action: buildAppointmentsAction(
        workflowStatus === "upcoming" ? "Open appointment" : "Review appointment",
        workflowStatus === "upcoming" ? "upcoming" : "requests",
      ),
    });
  }

  return prompts.slice(0, 3);
}
