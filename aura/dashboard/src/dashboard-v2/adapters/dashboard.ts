import type {
  DashboardCommunicationOverviewItem,
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
  guidanceLine: string;
  facts: Array<{
    key: string;
    label: string;
    value: string;
  }>;
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
  detail: string;
  path: string;
  tone: DashboardSurfaceTone;
}

export interface DashboardOperationalLoadRowVm {
  key: string;
  label: string;
  value: number;
  displayValue: string;
  detail: string;
  path: string;
  tone: DashboardSurfaceTone;
  barPercent: number;
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

export interface DashboardScheduleItemVm {
  id: string;
  patientId: string;
  patientLabel: string;
  patientInitials: string;
  timeRangeLabel: string;
  statusLabel: string;
  statusTone: DashboardSurfaceTone;
  note: string;
  updatedLabel: string;
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
  priorityQueueCount: number;
  leadKindLabel: string | null;
}

interface DashboardSummaryStripInput {
  summary: DashboardSummary | null;
  messagesNeedingResponseCount: number | null;
  openFollowUpTasksCount: number | null;
  pendingInsightsCount: number | null;
  todayAppointmentsCount: number | null;
  assignedToMeAlertsCount: number | null;
  tasksDueTodayCount: number;
  highPriorityInsightsCount: number;
  pendingAppointmentRequestsCount: number;
  flaggedBySafetyCount: number | null;
}

interface DashboardOperationalLoadInput {
  summary: DashboardSummary | null;
  messagesNeedingResponseCount: number;
  openFollowUpTasksCount: number;
  pendingInsightsCount: number;
  pendingAppointmentRequestsCount: number;
  availableSlotsCount: number;
  missedCheckinsCount: number;
  tasksDueTodayCount: number;
  highPriorityInsightsCount: number;
  recentSafetyEventCount: number;
  flaggedBySafetyCount: number;
}

interface DashboardScheduleInput {
  appointments: DashboardTodayAppointmentItem[];
  patientLabels: Map<string, string>;
  nextOpenSlotLabel: string | null;
  schedulingFootnote: string;
}

interface DashboardSignalsInput {
  safetyEvents: DashboardSafetyEvent[];
  communicationItems: DashboardCommunicationOverviewItem[];
  patientLabels: Map<string, string>;
}

interface DashboardDataContextInput {
  updatedLabel: string;
  schedulingRangeLabel: string;
  priorityQueueSampleLabel: string | null;
  nextOpenSlotLabel: string | null;
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

function optionalDetail(value: string | null | undefined): string {
  return value?.trim() ? value : "";
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

function priorityKindLabel(
  itemType: DashboardPriorityQueueItem["itemType"],
): string {
  switch (itemType) {
    case "alert":
      return "Safety review";
    case "appointment_exception":
      return "Scheduling pressure";
    case "communication":
      return "Inbox follow-through";
    case "missed_checkin":
      return "Missed check-in follow-up";
    case "task":
    default:
      return "Follow-up workload";
  }
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

function appointmentSummary(item: DashboardTodayAppointmentItem): string {
  if (item.note?.trim()) {
    return item.note.trim();
  }

  if (item.status === "awaiting_confirmation") {
    return "Awaiting confirmation.";
  }

  if (item.status === "reschedule_requested") {
    return "Reschedule requested.";
  }

  if (item.status === "missed") {
    return "Missed visit needs follow-through.";
  }

  return "Visit is scheduled.";
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
      const toneDifference =
        tonePriority[right.tone] - tonePriority[left.tone];
      if (toneDifference !== 0) {
        return toneDifference;
      }

      return left.label.localeCompare(right.label);
    })
    .slice(0, 2);
}

function communicationContextLine(
  item: DashboardCommunicationOverviewItem,
): string | null {
  const parts = [
    item.patientRiskLevel === "high" ? "Higher risk" : null,
    typeof item.openAlertCount === "number"
      ? `${item.openAlertCount} open alert${item.openAlertCount === 1 ? "" : "s"}`
      : null,
    item.responseDelayed || item.responseState === "delayed"
      ? `Delayed past ${item.responseDelayHours ?? "configured"}h`
      : item.responseDueAt
        ? `Target ${formatDashboardRelativeTime(item.responseDueAt)}`
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
): string | null {
  if (!item.reviewedAfterLatestInbound) {
    return null;
  }

  const reviewedAtLabel = item.lastReviewedAt
    ? formatDashboardRelativeTime(item.lastReviewedAt)
    : "in workflow";
  const reviewerLabel = item.lastReviewedBy?.displayName?.trim() || "Unknown";

  return `Reviewed ${reviewedAtLabel} by ${reviewerLabel}`;
}

function timelineWindowPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
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

export function buildDashboardStatusBar({
  schedulingRangeLabel,
  priorityQueueCount,
  leadKindLabel,
}: DashboardStatusBarInput): DashboardStatusBarVm {
  return {
    title: "Today",
    guidanceLine: "Live operational summary",
    facts: [
      {
        key: "window",
        label: "Scheduling window",
        value: schedulingRangeLabel,
      },
      {
        key: "priority",
        label: "Urgent sample",
        value: leadKindLabel
          ? `${priorityQueueCount} in ${leadKindLabel.toLowerCase()}`
          : `${priorityQueueCount} visible`,
      },
    ],
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
    return {
      tone: "critical",
      title: "Safety review leads the shift",
      copy: `${pluralize(openAlertsCount, "open alert")} are leading the day right now.`,
      actionLabel: "Open alerts",
      actionPath: "/alerts",
      note: "Begin with the live safety lane.",
    };
  }

  if (messagesNeedingResponseCount > 0) {
    return {
      tone: "warning",
      title: "Inbox pressure is building",
      copy: `${pluralize(messagesNeedingResponseCount, "patient thread")} need a clinician response right now.`,
      actionLabel: "Open inbox",
      actionPath: "/communication",
      note: "Open inbox while response pressure is still visible.",
    };
  }

  if (tasksDueTodayCount > 0 || missedCheckinsCount > 0) {
    return {
      tone: "info",
      title: "Follow-through is setting the pace",
      copy: "Due work and missed check-ins need an early pass.",
      actionLabel: "Open queue",
      actionPath: "/worklist",
      note: "Move into queue review once live lanes settle.",
    };
  }

  if (todayAppointmentsCount > 0) {
    return {
      tone: "neutral",
      title: "The agenda deserves an early check",
      copy: `${pluralize(todayAppointmentsCount, "visit")} are active today and worth confirming early.`,
      actionLabel: "Open schedule",
      actionPath: "/appointments",
      note: "Schedule holds visible capacity and request pressure.",
    };
  }

  if (pendingInsightsCount > 0) {
    return {
      tone: "neutral",
      title: "Immediate pressure is steady",
      copy: `${pluralize(pendingInsightsCount, "review item")} are waiting after live operational work is clear.`,
      actionLabel: "Open insights",
      actionPath: "/insights",
      note: null,
    };
  }

  return {
    tone: "success",
    title: "The shift is steady",
    copy: "No urgent lane is leading right now. Confirm the overview and keep the day moving.",
    actionLabel: "Open queue",
    actionPath: "/worklist",
    note: null,
  };
}

export function buildDashboardSummaryStrip({
  summary,
  messagesNeedingResponseCount,
  openFollowUpTasksCount,
  pendingInsightsCount,
  todayAppointmentsCount,
  assignedToMeAlertsCount,
  tasksDueTodayCount,
  highPriorityInsightsCount,
  pendingAppointmentRequestsCount,
  flaggedBySafetyCount,
}: DashboardSummaryStripInput): DashboardSummaryMetricVm[] {
  const openAlertsCount = summary?.openAlertsCount ?? null;

  return [
    {
      key: "alerts",
      label: "Open alerts",
      value: formatCountValue(openAlertsCount),
      detail: optionalDetail(
        typeof assignedToMeAlertsCount === "number" &&
          assignedToMeAlertsCount > 0
          ? compactCountLabel(assignedToMeAlertsCount, "assigned", "assigned")
          : null,
      ),
      path: "/alerts",
      tone: toneFromCount(openAlertsCount ?? 0, {
        criticalAt: 1,
        successWhenZero: true,
      }),
    },
    {
      key: "communication",
      label: "Messages needing response",
      value: formatCountValue(messagesNeedingResponseCount),
      detail: optionalDetail(
        typeof flaggedBySafetyCount === "number" &&
          flaggedBySafetyCount > 0
          ? compactCountLabel(
              flaggedBySafetyCount,
              "flagged",
              "flagged",
            )
          : null,
      ),
      path: "/communication",
      tone: toneFromCount(messagesNeedingResponseCount ?? 0, {
        criticalAt: 3,
        warningAt: 1,
        successWhenZero: true,
      }),
    },
    {
      key: "tasks",
      label: "Open follow-up tasks",
      value: formatCountValue(openFollowUpTasksCount),
      detail: optionalDetail(
        tasksDueTodayCount > 0
          ? compactCountLabel(tasksDueTodayCount, "due today", "due today")
          : null,
      ),
      path: "/worklist",
      tone: toneFromCount(openFollowUpTasksCount ?? 0, {
        criticalAt: 4,
        warningAt: 1,
        successWhenZero: true,
      }),
    },
    {
      key: "insights",
      label: "Pending insights",
      value: formatCountValue(pendingInsightsCount),
      detail: optionalDetail(
        highPriorityInsightsCount > 0
          ? compactCountLabel(
              highPriorityInsightsCount,
              "high-priority",
              "high-priority",
            )
          : null,
      ),
      path: "/insights",
      tone: toneFromCount(pendingInsightsCount ?? 0, {
        warningAt: 1,
        criticalAt: 4,
        successWhenZero: true,
      }),
    },
    {
      key: "appointments",
      label: "Today’s appointments",
      value: formatCountValue(todayAppointmentsCount),
      detail: optionalDetail(
        typeof pendingAppointmentRequestsCount === "number"
          ? pendingAppointmentRequestsCount > 0
            ? compactCountLabel(
                pendingAppointmentRequestsCount,
                "request pending",
                "requests pending",
              )
            : null
          : null,
      ),
      path: "/appointments",
      tone: toneFromCount(todayAppointmentsCount ?? 0, {
        warningAt: 1,
        criticalAt: 4,
        successWhenZero: true,
      }),
    },
  ];
}

export function buildDashboardOperationalLoad({
  summary,
  messagesNeedingResponseCount,
  openFollowUpTasksCount,
  pendingInsightsCount,
  pendingAppointmentRequestsCount,
  availableSlotsCount,
  missedCheckinsCount,
  tasksDueTodayCount,
  highPriorityInsightsCount,
  recentSafetyEventCount,
  flaggedBySafetyCount,
}: DashboardOperationalLoadInput): DashboardOperationalLoadRowVm[] {
  const rows = [
    {
      key: "alerts",
      label: "Alerts",
      value: summary?.openAlertsCount ?? 0,
      detail: [
        (summary?.assignedToMeAlertsCount ?? 0) > 0
          ? compactCountLabel(
              summary?.assignedToMeAlertsCount ?? 0,
              "assigned",
              "assigned",
            )
          : null,
        recentSafetyEventCount > 0
          ? compactCountLabel(recentSafetyEventCount, "recent event")
          : null,
      ]
        .filter(Boolean)
        .join(" · "),
      path: "/alerts",
      tone: toneFromCount(summary?.openAlertsCount ?? 0, {
        criticalAt: 1,
        successWhenZero: true,
      }),
    },
    {
      key: "communication",
      label: "Communication",
      value: messagesNeedingResponseCount,
      detail:
        flaggedBySafetyCount > 0
          ? compactCountLabel(
              flaggedBySafetyCount,
              "flagged",
              "flagged",
            )
          : "",
      path: "/communication",
      tone: toneFromCount(messagesNeedingResponseCount, {
        criticalAt: 3,
        warningAt: 1,
        successWhenZero: true,
      }),
    },
    {
      key: "worklist",
      label: "Follow-up queue",
      value: openFollowUpTasksCount,
      detail: [
        tasksDueTodayCount > 0
          ? compactCountLabel(tasksDueTodayCount, "due today", "due today")
          : null,
        missedCheckinsCount > 0
          ? compactCountLabel(missedCheckinsCount, "missed check-in")
          : null,
      ]
        .filter(Boolean)
        .join(" · "),
      path: "/worklist",
      tone: toneFromCount(openFollowUpTasksCount, {
        criticalAt: 4,
        warningAt: 1,
        successWhenZero: true,
      }),
    },
    {
      key: "insights",
      label: "Insights",
      value: pendingInsightsCount,
      detail:
        pendingInsightsCount > 0
          ? `${compactCountLabel(highPriorityInsightsCount, "high-priority")} visible`
          : "",
      path: "/insights",
      tone: toneFromCount(pendingInsightsCount, {
        criticalAt: 4,
        warningAt: 1,
        successWhenZero: true,
      }),
    },
    {
      key: "appointments",
      label: "Scheduling",
      value: pendingAppointmentRequestsCount,
      detail:
        pendingAppointmentRequestsCount > 0
          ? `${compactCountLabel(pendingAppointmentRequestsCount, "request")} · ${compactCountLabel(availableSlotsCount, "open slot")}`
          : availableSlotsCount > 0
            ? `${compactCountLabel(availableSlotsCount, "open slot")} visible`
            : "",
      path: "/appointments",
      tone:
        pendingAppointmentRequestsCount > availableSlotsCount
          ? "warning"
          : toneFromCount(pendingAppointmentRequestsCount, {
              warningAt: 1,
              successWhenZero: true,
            }),
    },
  ];

  const maxValue = Math.max(...rows.map((row) => row.value), 1);

  return rows.map((row) => ({
    ...row,
    displayValue: formatCountValue(row.value),
    barPercent: Math.max(8, Math.round((row.value / maxValue) * 100)),
  }));
}

export function buildDashboardSchedule({
  appointments,
  patientLabels,
  nextOpenSlotLabel,
  schedulingFootnote,
}: DashboardScheduleInput): {
  timelineBlocks: DashboardScheduleTimelineBlockVm[];
  scheduleItems: DashboardScheduleItemVm[];
  nextOpenSlotValue: string;
  schedulingFootnote: string;
} {
  const timelineBlocks = [...appointments]
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

  const scheduleItems = appointments.slice(0, 4).map((item) => ({
    id: item.id,
    patientId: item.patientId,
    patientLabel: patientLabels.get(item.patientId) ?? item.patientId,
    patientInitials: buildPatientInitials(
      patientLabels.get(item.patientId) ?? item.patientId,
    ),
    timeRangeLabel: formatDashboardTimeRange(item.startsAt, item.endsAt),
    statusLabel: humanizeDashboardLabel(item.status),
    statusTone: appointmentStatusTone(item.status),
    note: appointmentSummary(item),
    updatedLabel: `Updated ${formatDashboardRelativeTime(item.updatedAt)}`,
  }));

  return {
    timelineBlocks,
    scheduleItems,
    nextOpenSlotValue: nextOpenSlotLabel ?? "No visible open capacity",
    schedulingFootnote,
  };
}

export function buildDashboardSignals({
  safetyEvents,
  communicationItems,
  patientLabels,
}: DashboardSignalsInput): {
  safetyItems: DashboardSafetySignalVm[];
  communicationItems: DashboardCommunicationSignalVm[];
} {
  return {
    safetyItems: safetyEvents.slice(0, 3).map((item) => {
      const status = safetyStatusVm(item);

      return {
        id: item.id,
        patientId: item.patientId,
        patientLabel: patientLabels.get(item.patientId) ?? item.patientId,
        patientInitials: buildPatientInitials(
          patientLabels.get(item.patientId) ?? item.patientId,
        ),
        summary: item.summary,
        eventLabel: humanizeDashboardLabel(item.type),
        eventTimeLabel: formatDashboardRelativeTime(item.createdAt),
        eventTimeTitle: formatDashboardDateTime(item.createdAt),
        statusLabel: status.label,
        statusTone: status.tone,
      };
    }),
    communicationItems: communicationItems.slice(0, 3).map((item) => ({
      id: item.id,
      patientId: item.patientId,
      patientLabel: item.patientName?.trim() || item.patientId,
      patientInitials: buildPatientInitials(
        item.patientName?.trim() || item.patientId,
      ),
      preview:
        item.messagePreview?.trim() || "Conversation preview unavailable.",
      messageAgeLabel: formatDashboardRelativeTime(item.messageCreatedAt),
      messageAgeTitle: formatDashboardDateTime(item.messageCreatedAt),
      chips: communicationChips(item),
      contextLine: communicationContextLine(item),
      reviewLine: communicationReviewLine(item),
    })),
  };
}

export function buildDashboardDataContext({
  updatedLabel,
  schedulingRangeLabel,
  priorityQueueSampleLabel,
  nextOpenSlotLabel,
}: DashboardDataContextInput): DashboardDataContextVm {
  return {
    metadata: [
      { label: "Updated", value: updatedLabel },
      { label: "Window", value: schedulingRangeLabel },
      {
        label: "Urgent sample",
        value: priorityQueueSampleLabel ?? "Unknown",
      },
      {
        label: "Open slot",
        value: nextOpenSlotLabel ?? "No visible open capacity",
      },
    ],
    coverageSummary: "Live feeds and the next 7 days of visible scheduling.",
    coverageDetail:
      "This page reflects the dashboard summary, live safety and inbox feeds, and the next 7 days of visible scheduling.",
    trustSummary: "Overview only. Detailed review stays in destination routes.",
    trustDetail:
      "This overview does not claim confirmed ownership, AI authorship, or unsupported historical certainty. Detailed review stays in destination routes.",
  };
}

export function formatDashboardUpdatedLabel(
  updatedAtMs: number | null,
): string {
  if (!updatedAtMs || updatedAtMs <= 0) {
    return "Unknown";
  }

  return formatDashboardRelativeTime(new Date(updatedAtMs).toISOString());
}

export function buildPriorityQueueSampleLabel(
  items: DashboardPriorityQueueItem[],
  patientLabels: Map<string, string>,
): string | null {
  const sample = items[0];
  if (!sample) {
    return null;
  }

  return `${priorityKindLabel(sample.itemType)} for ${patientLabels.get(sample.patientId) ?? sample.patientId}`;
}

export function buildLeadKindLabel(
  items: DashboardPriorityQueueItem[],
): string | null {
  const sample = items[0];
  return sample ? priorityKindLabel(sample.itemType) : null;
}

export function buildPriorityQueuePressureNote(
  items: DashboardPriorityQueueItem[],
): string {
  if (items.length === 0) {
    return "No urgent sample is surfacing right now.";
  }

  const highPriorityCount = items.filter(
    (item) => priorityTone(item.priority) === "critical",
  ).length;
  if (highPriorityCount > 0) {
    return `${pluralize(highPriorityCount, "urgent item")} are surfacing in the current sample.`;
  }

  return `${pluralize(items.length, "routed item")} are surfacing in the current sample.`;
}
