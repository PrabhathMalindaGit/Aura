import type {
  DashboardCommunicationOverviewItem,
  DashboardFollowUpTaskItem,
  DashboardItemPriority,
  DashboardPriorityQueueItem,
  DashboardSafetyEvent,
  DashboardSummary,
  DashboardTodayAppointmentItem,
} from "../../types/models";
import {
  formatDashboardDateTime,
  formatDashboardRelativeTime,
  formatDashboardTimeRange,
  humanizeDashboardLabel,
} from "../../utils/dashboard";

export type DashboardSurfaceTone =
  | "critical"
  | "warning"
  | "info"
  | "success"
  | "neutral";

export interface DashboardStatusBarVm {
  title: string;
  windowLabel: string;
  modeIndicator?: {
    label: string;
    detail: string;
  } | null;
}

export interface DashboardAttentionVm {
  tone: DashboardSurfaceTone;
  title: string;
  copy: string;
  actionLabel: string;
  actionPath: string;
  note: string | null;
}

export interface DashboardSummaryMetricVm {
  key: string;
  label: string;
  value: string;
  stateLabel: string;
  context: string | null;
  path: string;
  tone: DashboardSurfaceTone;
}

export interface DashboardUrgentQueueRowVm {
  id: string;
  tone: DashboardSurfaceTone;
  title: string;
  patientLabel: string | null;
  patientId: string | null;
  contextLine: string;
  dueLabel: string | null;
  actionLabel: string;
  actionKind: "route" | "patient" | "thread";
  actionPath?: string;
}

export interface DashboardScheduleTimelineBlockVm {
  id: string;
  label: string;
  detail: string;
  statusLabel: string;
  tone: DashboardSurfaceTone;
  leftPercent: number;
  widthPercent: number;
  patientId: string;
}

export interface DashboardCapacityRailVm {
  nextOpenSlotValue: string;
  capacityStateLabel: string;
  pendingRequestCount: number;
  availableSlotsCount: number;
  visitsSummary: string;
  note: string;
  timelineBlocks: DashboardScheduleTimelineBlockVm[];
}

export interface DashboardSafetySignalVm {
  id: string;
  patientId: string;
  patientLabel: string;
  patientInitials: string;
  summary: string;
  eventLabel: string;
  eventTimeLabel: string;
  eventTimeTitle: string;
  statusLabel: string;
  statusTone: DashboardSurfaceTone;
}

export interface DashboardCommunicationChipVm {
  key: string;
  label: string;
  tone: DashboardSurfaceTone;
}

export interface DashboardCommunicationSignalVm {
  id: string;
  patientId: string;
  patientLabel: string;
  patientInitials: string;
  preview: string;
  messageAgeLabel: string;
  messageAgeTitle: string;
  chips: DashboardCommunicationChipVm[];
  contextLine: string | null;
  reviewLine: string | null;
}

export interface DashboardDataContextVm {
  metadata: Array<{
    label: string;
    value: string | null;
  }>;
  sourceNote: string;
  coverageSummary: string;
  coverageDetail: string;
  trustSummary: string;
  trustDetail: string;
}

interface DashboardAttentionInput {
  openAlertsCount: number;
  messagesNeedingResponseCount: number;
  tasksDueTodayCount: number;
  missedCheckinsCount: number;
  todayAppointmentsCount: number;
  pendingInsightsCount: number;
}

interface DashboardStatusBarInput {
  schedulingRangeLabel: string;
  demoIndicatorLabel?: string | null;
  demoScenarioLabel?: string | null;
}

interface DashboardOperationalSummaryInput {
  summary: DashboardSummary | null;
  messagesNeedingResponseCount: number | null;
  openFollowUpTasksCount: number | null;
  pendingInsightsCount: number | null;
  todayAppointmentsCount: number | null;
  assignedToMeAlertsCount: number | null;
  tasksDueTodayCount: number;
  highPriorityInsightsCount: number;
  pendingAppointmentRequestsCount: number;
  availableSlotsCount: number;
  flaggedBySafetyCount: number | null;
}

interface DashboardUrgentQueueInput {
  priorityItems: DashboardPriorityQueueItem[];
  followUpTasks: DashboardFollowUpTaskItem[];
  communicationItems: DashboardCommunicationOverviewItem[];
  patientLabels: Map<string, string>;
  nowMs?: number;
}

interface DashboardCapacityRailInput {
  appointments: DashboardTodayAppointmentItem[];
  patientLabels: Map<string, string>;
  nextOpenSlotLabel: string | null;
  schedulingFootnote: string;
  pendingRequestCount: number;
  availableSlotsCount: number;
  nowMs?: number;
}

interface DashboardSignalsInput {
  safetyEvents: DashboardSafetyEvent[];
  communicationItems: DashboardCommunicationOverviewItem[];
  patientLabels: Map<string, string>;
  nowMs?: number;
}

interface DashboardDataContextInput {
  updatedLabel: string;
  schedulingRangeLabel: string;
  nextOpenSlotLabel: string | null;
  demoSourceLabel?: string | null;
}

function formatCountValue(value: number | null | undefined): string {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "Unknown";
  }

  return String(value);
}

function pluralize(
  value: number,
  singular: string,
  plural: string = `${singular}s`,
): string {
  return `${value} ${value === 1 ? singular : plural}`;
}

function compactCountLabel(
  value: number | null | undefined,
  singular: string,
  plural: string = `${singular}s`,
): string {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "Unknown";
  }

  return `${value} ${value === 1 ? singular : plural}`;
}

function buildPatientInitials(label: string): string {
  const parts = label
    .trim()
    .split(/\s+/)
    .map((part) => part.replace(/[^A-Za-z0-9]/g, ""))
    .filter(Boolean);

  if (parts.length === 0) {
    return "PT";
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

function toneFromCount(
  value: number,
  options: {
    criticalAt?: number;
    warningAt?: number;
    successWhenZero?: boolean;
  } = {},
): DashboardSurfaceTone {
  if (value <= 0) {
    return options.successWhenZero ? "success" : "neutral";
  }

  if (typeof options.criticalAt === "number" && value >= options.criticalAt) {
    return "critical";
  }

  if (typeof options.warningAt === "number" && value >= options.warningAt) {
    return "warning";
  }

  return "info";
}

function priorityTone(priority: DashboardItemPriority): DashboardSurfaceTone {
  if (priority === "urgent" || priority === "high") {
    return "critical";
  }

  if (priority === "medium") {
    return "warning";
  }

  return "neutral";
}

function appointmentStatusTone(
  status: DashboardTodayAppointmentItem["status"],
): DashboardSurfaceTone {
  if (status === "missed") {
    return "critical";
  }

  if (status === "awaiting_confirmation" || status === "reschedule_requested") {
    return "warning";
  }

  if (status === "completed") {
    return "success";
  }

  return "neutral";
}

function safetyStatusVm(item: DashboardSafetyEvent): {
  label: string;
  tone: DashboardSurfaceTone;
} {
  if (item.notificationStatus === "failed") {
    return { label: "Delivery failed", tone: "critical" };
  }

  if (item.notificationStatus === "sent") {
    return { label: "Notification sent", tone: "success" };
  }

  if (item.notificationStatus) {
    return {
      label: humanizeDashboardLabel(item.notificationStatus),
      tone: "neutral",
    };
  }

  if (item.alertStatus === "open") {
    return { label: "Open alert", tone: "critical" };
  }

  if (item.alertStatus === "acknowledged" || item.alertStatus === "in_review") {
    return { label: "Acknowledged", tone: "warning" };
  }

  if (item.alertStatus === "resolved" || item.alertStatus === "closed") {
    return { label: "Resolved", tone: "success" };
  }

  return { label: "Unknown", tone: "neutral" };
}

function communicationChips(
  item: DashboardCommunicationOverviewItem,
): DashboardCommunicationChipVm[] {
  const chips: DashboardCommunicationChipVm[] = [];

  if (item.flaggedBySafety) {
    chips.push({ key: "safety", label: "Safety flagged", tone: "critical" });
  }

  if (item.responseDelayed || item.responseState === "delayed") {
    chips.push({ key: "delay", label: "Response delayed", tone: "warning" });
  } else if (item.reviewedAfterLatestInbound) {
    chips.push({ key: "reviewed", label: "Reviewed", tone: "info" });
  } else if (item.needsResponse) {
    chips.push({
      key: "needs-response",
      label: "Needs response",
      tone: "warning",
    });
  }

  if ((item.openAlertCount ?? 0) > 0) {
    chips.push({
      key: "open-alerts",
      label: pluralize(item.openAlertCount ?? 0, "open alert"),
      tone: "critical",
    });
  }

  const tonePriority: Record<DashboardSurfaceTone, number> = {
    critical: 4,
    warning: 3,
    info: 2,
    success: 1,
    neutral: 0,
  };

  return [...chips]
    .sort((left, right) => {
      const toneDifference = tonePriority[right.tone] - tonePriority[left.tone];
      if (toneDifference !== 0) {
        return toneDifference;
      }

      return left.label.localeCompare(right.label);
    })
    .slice(0, 2);
}

function communicationContextLine(
  item: DashboardCommunicationOverviewItem,
  nowMs: number = Date.now(),
): string | null {
  const parts = [
    item.patientRiskLevel === "high" ? "Higher risk" : null,
    typeof item.openAlertCount === "number"
      ? `${item.openAlertCount} open alert${item.openAlertCount === 1 ? "" : "s"}`
      : null,
    item.responseDelayed || item.responseState === "delayed"
      ? `Delayed past ${item.responseDelayHours ?? "configured"}h`
      : item.responseDueAt
        ? `Target ${formatDashboardRelativeTime(item.responseDueAt, nowMs)}`
        : item.responseDelayHours
          ? `Target ${item.responseDelayHours}h`
          : null,
    item.followUpRequested && !item.reviewedAfterLatestInbound
      ? "Follow-up requested"
      : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" · ") : null;
}

function communicationReviewLine(
  item: DashboardCommunicationOverviewItem,
  nowMs: number = Date.now(),
): string | null {
  if (!item.reviewedAfterLatestInbound) {
    return null;
  }

  const reviewedAtLabel = item.lastReviewedAt
    ? formatDashboardRelativeTime(item.lastReviewedAt, nowMs)
    : "in workflow";
  const reviewerLabel = item.lastReviewedBy?.displayName?.trim() || "Unknown";

  return `Reviewed ${reviewedAtLabel} by ${reviewerLabel}`;
}

function timelineWindowPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function taskTypeLabel(type: DashboardFollowUpTaskItem["type"]): string {
  switch (type) {
    case "safety_review":
      return "Safety review";
    case "adherence_review":
      return "Adherence review";
    case "communication":
      return "Communication follow-up";
    case "appointment":
      return "Scheduling follow-up";
    case "follow_up":
      return "Clinical follow-up";
    default:
      return humanizeDashboardLabel(type);
  }
}

function priorityQueueTitle(item: DashboardPriorityQueueItem): string {
  if (item.title?.trim()) {
    return item.title.trim();
  }

  switch (item.itemType) {
    case "communication":
      return "Delayed patient response";
    case "missed_checkin":
      return "Missed check-in";
    case "appointment_exception":
      return "Scheduling exception";
    case "task":
      return "Follow-up task";
    case "alert":
    default:
      return "Safety review";
  }
}

function priorityQueueContext(item: DashboardPriorityQueueItem): string {
  if (item.subtitle?.trim()) {
    return item.subtitle.trim();
  }

  switch (item.itemType) {
    case "communication":
      return "Patient thread needs a response.";
    case "missed_checkin":
      return "Check-in follow-through is due.";
    case "appointment_exception":
      return "Scheduling needs manual review.";
    case "task":
      return "Follow-up work is waiting.";
    case "alert":
    default:
      return "Safety review is waiting.";
  }
}

function priorityQueueDueLabel(
  item: DashboardPriorityQueueItem,
  nowMs: number,
): string {
  if (item.dueAt) {
    return `Due ${formatDashboardRelativeTime(item.dueAt, nowMs)}`;
  }

  return `Queued ${formatDashboardRelativeTime(item.createdAt, nowMs)}`;
}

function priorityQueueAction(
  item: DashboardPriorityQueueItem,
): Pick<
  DashboardUrgentQueueRowVm,
  "actionKind" | "actionLabel" | "actionPath"
> {
  switch (item.itemType) {
    case "alert":
      return {
        actionKind: "route",
        actionLabel: "Open alerts",
        actionPath: "/alerts",
      };
    case "communication":
      return {
        actionKind: "thread",
        actionLabel: "Open thread",
      };
    case "appointment_exception":
      return {
        actionKind: "route",
        actionLabel: "Open schedule",
        actionPath: "/appointments",
      };
    case "missed_checkin":
      return {
        actionKind: "patient",
        actionLabel: "Open patient",
      };
    case "task":
    default:
      if (item.linkedEntityType === "alert") {
        return {
          actionKind: "route",
          actionLabel: "Open alerts",
          actionPath: "/alerts",
        };
      }

      if (item.linkedEntityType === "appointment") {
        return {
          actionKind: "route",
          actionLabel: "Open schedule",
          actionPath: "/appointments",
        };
      }

      return {
        actionKind: "patient",
        actionLabel: "Open patient",
      };
  }
}

function followUpTaskAction(
  item: DashboardFollowUpTaskItem,
): Pick<
  DashboardUrgentQueueRowVm,
  "actionKind" | "actionLabel" | "actionPath"
> {
  if (item.linkedAlertId) {
    return {
      actionKind: "route",
      actionLabel: "Open alerts",
      actionPath: "/alerts",
    };
  }

  if (item.linkedAppointmentId) {
    return {
      actionKind: "route",
      actionLabel: "Open schedule",
      actionPath: "/appointments",
    };
  }

  if (item.linkedMessageId) {
    return {
      actionKind: "thread",
      actionLabel: "Open thread",
    };
  }

  return {
    actionKind: "patient",
    actionLabel: "Open patient",
  };
}

function overdueLabel(iso: string, nowMs: number): string {
  return `Due ${formatDashboardRelativeTime(iso, nowMs)}`;
}

function buildTimelineBlocks(
  appointments: DashboardTodayAppointmentItem[],
  patientLabels: Map<string, string>,
): DashboardScheduleTimelineBlockVm[] {
  return [...appointments]
    .sort(
      (left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt),
    )
    .slice(0, 6)
    .map((item) => {
      const startsAt = new Date(item.startsAt);
      const endsAt = new Date(item.endsAt);
      const startMinutes = startsAt.getHours() * 60 + startsAt.getMinutes();
      const endMinutes = endsAt.getHours() * 60 + endsAt.getMinutes();
      const durationMinutes = Math.max(15, endMinutes - startMinutes);

      return {
        id: item.id,
        label: patientLabels.get(item.patientId) ?? item.patientId,
        detail: formatDashboardTimeRange(item.startsAt, item.endsAt),
        statusLabel: humanizeDashboardLabel(item.status),
        tone: appointmentStatusTone(item.status),
        leftPercent: timelineWindowPercent((startMinutes / (24 * 60)) * 100),
        widthPercent: Math.max(
          8,
          timelineWindowPercent((durationMinutes / (24 * 60)) * 100),
        ),
        patientId: item.patientId,
      };
    });
}

function summaryMetricToneToState(
  tone: DashboardSurfaceTone,
  defaultState: string,
): string {
  if (tone === "critical") {
    return "Active";
  }

  if (tone === "warning") {
    return defaultState;
  }

  if (tone === "success") {
    return "Clear";
  }

  return defaultState;
}

export function buildDashboardStatusBar({
  schedulingRangeLabel,
  demoIndicatorLabel,
  demoScenarioLabel,
}: DashboardStatusBarInput): DashboardStatusBarVm {
  return {
    title: "Today",
    windowLabel: schedulingRangeLabel,
    modeIndicator:
      demoIndicatorLabel && demoScenarioLabel
        ? {
            label: demoIndicatorLabel,
            detail: `Synthetic data · ${demoScenarioLabel}`,
          }
        : null,
  };
}

export function buildDashboardAttention({
  openAlertsCount,
  messagesNeedingResponseCount,
  tasksDueTodayCount,
  missedCheckinsCount,
  todayAppointmentsCount,
  pendingInsightsCount,
}: DashboardAttentionInput): DashboardAttentionVm {
  if (openAlertsCount > 0) {
    const countLabel = pluralize(openAlertsCount, "open alert");
    return {
      tone: "critical",
      title: "Start in safety review",
      copy:
        openAlertsCount === 1
          ? `${countLabel} is the clearest live pressure.`
          : `${countLabel} are the clearest live pressure.`,
      actionLabel: "Open alerts",
      actionPath: "/alerts",
      note: "Review the active safety lane first.",
    };
  }

  if (messagesNeedingResponseCount > 0) {
    const countLabel = pluralize(
      messagesNeedingResponseCount,
      "patient thread",
    );
    return {
      tone: "warning",
      title: "Inbox response comes next",
      copy:
        messagesNeedingResponseCount === 1
          ? `${countLabel} is still waiting on a clinician response.`
          : `${countLabel} are still waiting on a clinician response.`,
      actionLabel: "Open inbox",
      actionPath: "/communication",
      note: "Clear the riskiest delayed thread first.",
    };
  }

  if (tasksDueTodayCount > 0 || missedCheckinsCount > 0) {
    const dueFragment =
      tasksDueTodayCount > 0
        ? compactCountLabel(tasksDueTodayCount, "task due today", "tasks due today")
        : null;
    const missedFragment =
      missedCheckinsCount > 0
        ? compactCountLabel(missedCheckinsCount, "missed check-in")
        : null;

    return {
      tone: "info",
      title: "Due follow-through is next",
      copy: [dueFragment, missedFragment].filter(Boolean).join(" · "),
      actionLabel: "Open queue",
      actionPath: "/worklist",
      note: "Move through due work before it slips.",
    };
  }

  if (todayAppointmentsCount > 0) {
    const countLabel = pluralize(todayAppointmentsCount, "visible visit");
    return {
      tone: "neutral",
      title: "Schedule visibility needs a check",
      copy:
        todayAppointmentsCount === 1
          ? `${countLabel} is visible today and worth confirming early.`
          : `${countLabel} are visible today and worth confirming early.`,
      actionLabel: "Open schedule",
      actionPath: "/appointments",
      note: "Confirm the visible schedule before demand tightens.",
    };
  }

  if (pendingInsightsCount > 0) {
    return {
      tone: "neutral",
      title: "Operational lanes are clear",
      copy: `${pluralize(pendingInsightsCount, "review item")} are waiting once the live lanes are clear.`,
      actionLabel: "Open insights",
      actionPath: "/insights",
      note: null,
    };
  }

  return {
    tone: "success",
    title: "No urgent lane is leading",
    copy: "The overview is steady right now. Confirm the queue and move into the next clinical task.",
    actionLabel: "Open queue",
    actionPath: "/worklist",
    note: null,
  };
}

export function buildDashboardOperationalSummary({
  summary,
  messagesNeedingResponseCount,
  openFollowUpTasksCount,
  pendingInsightsCount,
  todayAppointmentsCount,
  assignedToMeAlertsCount,
  tasksDueTodayCount,
  highPriorityInsightsCount,
  pendingAppointmentRequestsCount,
  availableSlotsCount,
  flaggedBySafetyCount,
}: DashboardOperationalSummaryInput): DashboardSummaryMetricVm[] {
  const openAlertsCount = summary?.openAlertsCount ?? null;
  const alertsTone = toneFromCount(openAlertsCount ?? 0, {
    criticalAt: 1,
    successWhenZero: true,
  });
  const communicationTone = toneFromCount(messagesNeedingResponseCount ?? 0, {
    criticalAt: 3,
    warningAt: 1,
    successWhenZero: true,
  });
  const followUpTone = toneFromCount(openFollowUpTasksCount ?? 0, {
    criticalAt: 4,
    warningAt: 1,
    successWhenZero: true,
  });
  const insightsTone = toneFromCount(pendingInsightsCount ?? 0, {
    criticalAt: 4,
    warningAt: 1,
    successWhenZero: true,
  });
  const schedulingTone =
    pendingAppointmentRequestsCount > 0 &&
    pendingAppointmentRequestsCount > availableSlotsCount
      ? "warning"
      : toneFromCount(pendingAppointmentRequestsCount, {
          warningAt: 1,
          successWhenZero: true,
        });

  return [
    {
      key: "alerts",
      label: "Alerts",
      value: formatCountValue(openAlertsCount),
      stateLabel:
        openAlertsCount && openAlertsCount > 0
          ? summaryMetricToneToState(alertsTone, "Open")
          : "Clear",
      context:
        typeof assignedToMeAlertsCount === "number" &&
        assignedToMeAlertsCount > 0
          ? compactCountLabel(assignedToMeAlertsCount, "assigned", "assigned")
          : null,
      path: "/alerts",
      tone: alertsTone,
    },
    {
      key: "communication",
      label: "Inbox",
      value: formatCountValue(messagesNeedingResponseCount),
      stateLabel:
        typeof flaggedBySafetyCount === "number" && flaggedBySafetyCount > 0
          ? "Flagged"
          : (messagesNeedingResponseCount ?? 0) > 0
            ? "Waiting"
            : "Clear",
      context:
        typeof flaggedBySafetyCount === "number" && flaggedBySafetyCount > 0
          ? compactCountLabel(flaggedBySafetyCount, "safety flag", "safety flags")
          : null,
      path: "/communication",
      tone: communicationTone,
    },
    {
      key: "tasks",
      label: "Follow-up",
      value: formatCountValue(openFollowUpTasksCount),
      stateLabel:
        tasksDueTodayCount > 0
          ? "Due today"
          : (openFollowUpTasksCount ?? 0) > 0
            ? "Open"
            : "Clear",
      context:
        tasksDueTodayCount > 0
          ? compactCountLabel(tasksDueTodayCount, "due today", "due today")
          : null,
      path: "/worklist",
      tone: followUpTone,
    },
    {
      key: "insights",
      label: "Insights",
      value: formatCountValue(pendingInsightsCount),
      stateLabel:
        highPriorityInsightsCount > 0
          ? "Priority"
          : (pendingInsightsCount ?? 0) > 0
            ? "Pending"
            : "Clear",
      context:
        highPriorityInsightsCount > 0
          ? compactCountLabel(
              highPriorityInsightsCount,
              "high-priority item",
              "high-priority items",
            )
          : null,
      path: "/insights",
      tone: insightsTone,
    },
    {
      key: "appointments",
      label: "Scheduling",
      value: formatCountValue(todayAppointmentsCount),
      stateLabel:
        pendingAppointmentRequestsCount > availableSlotsCount &&
        pendingAppointmentRequestsCount > 0
          ? "Tight"
          : pendingAppointmentRequestsCount > 0
            ? "Queued"
            : availableSlotsCount > 0
              ? "Capacity open"
              : "Clear",
      context:
        pendingAppointmentRequestsCount > 0 || availableSlotsCount > 0
          ? `${compactCountLabel(pendingAppointmentRequestsCount, "request")} · ${compactCountLabel(availableSlotsCount, "open slot")}`
          : null,
      path: "/appointments",
      tone: schedulingTone,
    },
  ];
}

export function buildDashboardUrgentQueue({
  priorityItems,
  followUpTasks,
  communicationItems,
  patientLabels,
  nowMs = Date.now(),
}: DashboardUrgentQueueInput): DashboardUrgentQueueRowVm[] {
  const rows: DashboardUrgentQueueRowVm[] = [];
  const seen = new Set<string>();

  const addRow = (row: DashboardUrgentQueueRowVm): void => {
    const dedupeKey = [
      row.actionKind,
      row.actionPath ?? row.patientId ?? "none",
      row.title,
      row.dueLabel ?? "none",
    ].join(":");

    if (seen.has(dedupeKey)) {
      return;
    }

    seen.add(dedupeKey);
    rows.push(row);
  };

  priorityItems.slice(0, 4).forEach((item) => {
    const patientLabel = patientLabels.get(item.patientId) ?? item.patientId;
    const action = priorityQueueAction(item);

    addRow({
      id: `priority-${item.id}`,
      tone: priorityTone(item.priority),
      title: priorityQueueTitle(item),
      patientLabel,
      patientId: item.patientId,
      contextLine: priorityQueueContext(item),
      dueLabel: priorityQueueDueLabel(item, nowMs),
      actionLabel: action.actionLabel,
      actionKind: action.actionKind,
      actionPath: action.actionPath,
    });
  });

  communicationItems
    .filter(
      (item) =>
        item.flaggedBySafety ||
        item.responseDelayed ||
        item.responseState === "delayed" ||
        item.needsResponse,
    )
    .slice(0, 4)
    .forEach((item) => {
      const title =
        item.responseDelayed || item.responseState === "delayed"
          ? "Delayed patient response"
          : item.flaggedBySafety
            ? "Safety flagged thread"
            : "Message needs response";

      addRow({
        id: `communication-${item.id}`,
        tone:
          item.flaggedBySafety
            ? "critical"
            : item.responseDelayed || item.responseState === "delayed"
              ? "warning"
              : "info",
        title,
        patientLabel: item.patientName?.trim() || item.patientId,
        patientId: item.patientId,
        contextLine:
          item.messagePreview?.trim() ||
          communicationContextLine(item, nowMs) ||
          "Conversation preview unavailable.",
        dueLabel:
          communicationContextLine(item, nowMs) ||
          `Latest message ${formatDashboardRelativeTime(item.messageCreatedAt, nowMs)}`,
        actionLabel: "Open thread",
        actionKind: "thread",
      });
    });

  followUpTasks
    .filter(
      (item) =>
        item.priority === "urgent" ||
        item.priority === "high" ||
        Boolean(item.dueAt),
    )
    .slice(0, 4)
    .forEach((item) => {
      const patientLabel = patientLabels.get(item.patientId) ?? item.patientId;
      const action = followUpTaskAction(item);

      addRow({
        id: `task-${item.id}`,
        tone:
          item.priority === "urgent" || item.priority === "high"
            ? "warning"
            : "info",
        title: item.title?.trim() || taskTypeLabel(item.type),
        patientLabel,
        patientId: item.patientId,
        contextLine: taskTypeLabel(item.type),
        dueLabel: item.dueAt
          ? overdueLabel(item.dueAt, nowMs)
          : `Updated ${formatDashboardRelativeTime(item.updatedAt, nowMs)}`,
        actionLabel: action.actionLabel,
        actionKind: action.actionKind,
        actionPath: action.actionPath,
      });
    });

  return rows.slice(0, 4);
}

export function buildDashboardCapacityRail({
  appointments,
  patientLabels,
  nextOpenSlotLabel,
  schedulingFootnote,
  pendingRequestCount,
  availableSlotsCount,
}: DashboardCapacityRailInput): DashboardCapacityRailVm {
  const capacityStateLabel =
    pendingRequestCount === 0 && availableSlotsCount === 0
      ? "No active scheduling pressure"
      : pendingRequestCount > availableSlotsCount
        ? "Requests are ahead of visible capacity"
        : availableSlotsCount > 0
          ? "Visible capacity is covering demand"
          : "Published capacity has not opened yet";

  return {
    nextOpenSlotValue: nextOpenSlotLabel ?? "No visible open capacity",
    capacityStateLabel,
    pendingRequestCount,
    availableSlotsCount,
    visitsSummary:
      appointments.length > 0
        ? `${pluralize(appointments.length, "visible visit")} on today’s agenda.`
        : "No visits are visible on today’s agenda.",
    note: schedulingFootnote,
    timelineBlocks: buildTimelineBlocks(appointments, patientLabels),
  };
}

export function buildDashboardSignals({
  safetyEvents,
  communicationItems,
  patientLabels,
  nowMs = Date.now(),
}: DashboardSignalsInput): {
  safetyItems: DashboardSafetySignalVm[];
  communicationItems: DashboardCommunicationSignalVm[];
} {
  return {
    safetyItems: safetyEvents.slice(0, 4).map((item) => {
      const status = safetyStatusVm(item);
      const patientLabel = patientLabels.get(item.patientId) ?? item.patientId;

      return {
        id: item.id,
        patientId: item.patientId,
        patientLabel,
        patientInitials: buildPatientInitials(patientLabel),
        summary: item.summary,
        eventLabel: humanizeDashboardLabel(item.type),
        eventTimeLabel: formatDashboardRelativeTime(item.createdAt, nowMs),
        eventTimeTitle: formatDashboardDateTime(item.createdAt),
        statusLabel: status.label,
        statusTone: status.tone,
      };
    }),
    communicationItems: communicationItems.slice(0, 4).map((item) => {
      const patientLabel = item.patientName?.trim() || item.patientId;

      return {
        id: item.id,
        patientId: item.patientId,
        patientLabel,
        patientInitials: buildPatientInitials(patientLabel),
        preview:
          item.messagePreview?.trim() || "Conversation preview unavailable.",
        messageAgeLabel: formatDashboardRelativeTime(item.messageCreatedAt, nowMs),
        messageAgeTitle: formatDashboardDateTime(item.messageCreatedAt),
        chips: communicationChips(item),
        contextLine: communicationContextLine(item, nowMs),
        reviewLine: communicationReviewLine(item, nowMs),
      };
    }),
  };
}

export function buildDashboardDataContext({
  updatedLabel,
  schedulingRangeLabel,
  demoSourceLabel,
}: DashboardDataContextInput): DashboardDataContextVm {
  return {
    metadata: [
      { label: "Updated", value: updatedLabel },
      { label: "Review window", value: schedulingRangeLabel },
      ...(demoSourceLabel
        ? [{ label: "Data source", value: demoSourceLabel }]
        : []),
    ],
    sourceNote: demoSourceLabel
      ? "Synthetic presentation data is active. Real mode remains the source of truth for live work."
      : "Includes dashboard summary, live safety, inbox, and visible scheduling.",
    coverageSummary:
      "Dashboard summary, live safety and inbox feeds, and the next 7 days of visible scheduling.",
    coverageDetail:
      "This route is an operational overview, not a full review workspace. Use the destination routes for detailed triage, inbox handling, patient review, scheduling, and insight decisions.",
    trustSummary: "State labels reflect current pressure only.",
    trustDetail:
      "This page does not infer historical direction, confirmed ownership, or AI authorship when the underlying dashboard data does not support those claims.",
  };
}

export function formatDashboardUpdatedLabel(
  updatedAtMs: number | null,
  nowMs: number = Date.now(),
): string {
  if (!updatedAtMs || updatedAtMs <= 0) {
    return "Unknown";
  }

  return formatDashboardRelativeTime(new Date(updatedAtMs).toISOString(), nowMs);
}
