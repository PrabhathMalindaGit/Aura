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
import {
  formatPatientCardTimestamp,
  formatPatientDueLabel,
  formatPatientDueTimestamp,
} from "@/src/utils/date";

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

const RAW_ISO_TIMESTAMP =
  /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{3})?)?Z\b/g;

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

function normalizeComparableText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function taskText(task: PatientTaskItem): string {
  return [task.title, task.description, task.sourceLabel].filter(Boolean).join(" ").toLowerCase();
}

function fallbackTaskText(task: PatientTaskItem): string {
  if (task.type === "communication" || task.linkedMessageId) {
    return "Your care team is waiting for a reply.";
  }
  if (task.type === "appointment" || task.linkedAppointmentId) {
    return "Review your appointment details when you are ready.";
  }
  if (task.type === "adherence_review") {
    return "There is a recovery step waiting for today.";
  }
  if (task.type === "safety_review") {
    return "Please review the latest safety guidance with your care team.";
  }
  return "There is a care step waiting for you.";
}

function replaceIsoTimestamps(value: string): string {
  return value.replace(RAW_ISO_TIMESTAMP, (match) => formatPatientCardTimestamp(match) ?? "recently");
}

function sanitizePatientText(value?: string): string {
  if (!value) {
    return "";
  }

  return replaceIsoTimestamps(value)
    .replace(/\bcommunication no[- ]response escalation\b/gi, "care-team message")
    .replace(/\bno[- ]response escalation\b/gi, "care-team follow-up")
    .replace(/\burgent message follow-up\b/gi, "reply reminder")
    .replace(/\bmessage follow-up\b/gi, "reply reminder")
    .replace(/\bfollow-through\b/gi, "next step")
    .replace(/\bescalation\b/gi, "priority follow-up")
    .replace(/\bautomation[- ]status\b/gi, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?:;])/g, "$1")
    .trim();
}

function sentenceCase(value: string): string {
  if (!value) {
    return value;
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
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

export function formatPatientTaskSourceLabel(task: PatientTaskItem): string | undefined {
  const raw = sanitizePatientText(task.sourceLabel);
  if (!raw) {
    return undefined;
  }

  const normalized = raw.toLowerCase();
  if (
    isCommunicationTask(task) ||
    normalized.includes("message") ||
    normalized.includes("communication")
  ) {
    return "Care team message";
  }
  if (normalized.includes("appointment")) {
    return "Appointment";
  }
  if (
    normalized.includes("questionnaire") ||
    normalized.includes("prom") ||
    normalized.includes("survey")
  ) {
    return "Questionnaire";
  }
  if (normalized.includes("check-in") || normalized.includes("check in")) {
    return "Check-in";
  }
  if (
    normalized.includes("rehab") ||
    normalized.includes("recovery") ||
    normalized.includes("exercise")
  ) {
    return "Recovery plan";
  }
  if (normalized.includes("safety")) {
    return "Safety support";
  }
  return "Care update";
}

export function formatTaskTitle(task: PatientTaskItem): string {
  const rawTitle = sanitizePatientText(task.title);
  const normalized = rawTitle.toLowerCase();

  if (isCommunicationTask(task)) {
    if (task.priority === "urgent" || normalized.includes("urgent")) {
      return "Please reply to your care team";
    }
    return "Care team reply needed";
  }

  if (task.type === "appointment" || task.linkedAppointmentId) {
    if (normalized.includes("resched")) {
      return "Choose a new appointment time";
    }
    if (normalized.includes("missed")) {
      return "Review your missed appointment";
    }
    return "Review your appointment";
  }

  if (task.type === "safety_review") {
    return "Review your safety support plan";
  }

  if (task.type === "adherence_review") {
    return "Complete your next recovery step";
  }

  if (rawTitle) {
    return sentenceCase(rawTitle);
  }

  if (task.type === "follow_up") {
    return "Review your next care step";
  }

  return "Review your care update";
}

export function formatTaskPatientIntentKey(task: PatientTaskItem): string {
  if (isCommunicationTask(task)) {
    if (task.linkedMessageId) {
      return `communication:${task.linkedMessageId}`;
    }

    const messageKey = normalizeComparableText(
      [formatTaskTitle(task), formatPatientTaskSourceLabel(task)].filter(Boolean).join(" "),
    );
    return `communication:${messageKey || task.id}`;
  }

  if (task.linkedAppointmentId) {
    return `appointment:${task.linkedAppointmentId}`;
  }

  const actionKind = normalizeActionKind(task.patientAction?.kind) ?? task.type;
  const textKey = normalizeComparableText(
    [
      formatTaskTitle(task),
      formatTaskSupportText(task),
      formatPatientTaskSourceLabel(task),
    ]
      .filter(Boolean)
      .join(" "),
  );

  return `${actionKind}:${textKey || task.id}`;
}

export function groupTasksByPatientIntent(tasks: PatientTaskItem[]): PatientTaskItem[] {
  const grouped = new Map<string, PatientTaskItem>();

  for (const task of tasks) {
    const key = formatTaskPatientIntentKey(task);
    const current = grouped.get(key);
    if (!current || compareActiveTasks(task, current) < 0) {
      grouped.set(key, task);
    }
  }

  return [...grouped.values()].sort(compareActiveTasks);
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
  return formatPatientDueLabel(task.dueAt, now);
}

export function formatTaskDueDetail(task: PatientTaskItem, now = new Date()): string | undefined {
  return formatPatientDueTimestamp(task.dueAt, now);
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

  const sourceLabel = formatPatientTaskSourceLabel(task);
  if (sourceLabel) {
    chips.push({ text: sourceLabel, tone: "muted" });
  }

  if (task.status === "completed" && task.completedAt) {
    chips.push({ text: "Completed", tone: "success" });
  }

  return chips;
}

export function formatTaskSupportText(task: PatientTaskItem): string {
  if (isCommunicationTask(task)) {
    if (task.priority === "urgent") {
      return "Your care team is waiting for a reply. Open chat when you can.";
    }
    return "Open chat to review the latest message and send your reply.";
  }

  if (task.type === "appointment" || task.linkedAppointmentId) {
    return "Review your appointment details and choose the next step.";
  }

  if (task.type === "adherence_review") {
    return "Keep your recovery plan moving with the next step.";
  }

  if (task.type === "safety_review") {
    return "Open your safety support plan for guided next steps.";
  }

  const description = sanitizePatientText(task.description);
  if (description) {
    return sentenceCase(description);
  }

  return fallbackTaskText(task);
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

  const activeTasks = groupTasksByPatientIntent(
    tasks.filter((task) => isTaskActive(task)).sort(compareActiveTasks),
  );
  const communicationTask = activeTasks.find((task) => isCommunicationTask(task));
  if (communicationTask) {
    const action = derivePatientTaskAction(communicationTask);
    prompts.push({
      id: `communication-${communicationTask.id}`,
      kind: "communication",
      title: formatTaskTitle(communicationTask),
      text: formatTaskSupportText(communicationTask),
      chips: [formatTaskDueLabel(communicationTask), formatPatientTaskSourceLabel(communicationTask)].filter(
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
      title: formatTaskTitle(nextTask),
      text: formatTaskSupportText(nextTask),
      chips: [formatTaskDueLabel(nextTask), formatPatientTaskSourceLabel(nextTask)].filter(
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
