import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  buildDashboardAttention,
  buildDashboardDataContext,
  buildDashboardOperationalLoad,
  buildDashboardSchedule,
  buildDashboardSignals,
  buildDashboardStatusBar,
  buildDashboardSummaryStrip,
  buildLeadKindLabel,
  buildPriorityQueuePressureNote,
  buildPriorityQueueSampleLabel,
  formatDashboardUpdatedLabel,
  type DashboardAttentionVm,
  type DashboardCommunicationSignalVm,
  type DashboardDataContextVm,
  type DashboardOperationalLoadRowVm,
  type DashboardSafetySignalVm,
  type DashboardScheduleItemVm,
  type DashboardScheduleTimelineBlockVm,
  type DashboardStatusBarVm,
  type DashboardSummaryMetricVm,
} from "../../adapters/dashboard";
import {
  listAppointmentRequests,
  listAppointmentSlots,
  listInsightsQueue,
  useDashboardCommunicationOverview,
  useDashboardFollowUpTasks,
  useDashboardPriorityQueue,
  useDashboardRecentSafetyEvents,
  useDashboardSummary,
  useDashboardTodayAppointments,
  usePatients,
} from "../../../services/clinicianApi";
import type { AppointmentSlot } from "../../../types/models";
import { formatDashboardTimeRange } from "../../../utils/dashboard";

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfDay(date: Date): Date {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function endOfDay(date: Date): Date {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

function isSameCalendarDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function formatAnalyticsDateRange(from: Date, to: Date): string {
  const sameMonth =
    from.getMonth() === to.getMonth() &&
    from.getFullYear() === to.getFullYear();
  const fromLabel = from.toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
  const toLabel = to.toLocaleDateString([], {
    month: sameMonth ? undefined : "short",
    day: "numeric",
  });

  return `${fromLabel} - ${toLabel}`;
}

function getNextAvailableSlot(
  slots: AppointmentSlot[] | undefined,
): AppointmentSlot | null {
  if (!slots?.length) {
    return null;
  }

  return (
    [...slots].sort(
      (left, right) =>
        new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime(),
    )[0] ?? null
  );
}

export interface UseDashboardViewModelResult {
  statusBar: DashboardStatusBarVm;
  attention: DashboardAttentionVm;
  summaryMetrics: DashboardSummaryMetricVm[];
  operationalLoadRows: DashboardOperationalLoadRowVm[];
  scheduleTimeline: DashboardScheduleTimelineBlockVm[];
  scheduleItems: DashboardScheduleItemVm[];
  safetySignals: DashboardSafetySignalVm[];
  communicationSignals: DashboardCommunicationSignalVm[];
  dataContext: DashboardDataContextVm;
  priorityQueuePressureNote: string;
  schedulingFootnote: string;
  nextOpenSlotValue: string;
  summaryLoading: boolean;
  summaryError: boolean;
  operationalLoading: boolean;
  operationalError: boolean;
  scheduleLoading: boolean;
  scheduleError: boolean;
  signalsLoading: boolean;
  signalsError: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
  navigateTo: (path: string) => void;
  openPatient: (patientId: string) => void;
  openThread: (patientId?: string) => void;
}

export function useDashboardViewModel(): UseDashboardViewModelResult {
  const navigate = useNavigate();
  const summaryQuery = useDashboardSummary();
  const priorityQueueQuery = useDashboardPriorityQueue(7);
  const safetyEventsQuery = useDashboardRecentSafetyEvents(6);
  const appointmentsQuery = useDashboardTodayAppointments();
  const followUpTasksQuery = useDashboardFollowUpTasks({ limit: 12 });
  const communicationQuery = useDashboardCommunicationOverview(6);
  const patientsQuery = usePatients();

  const schedulingRange = useMemo(() => {
    const fromDate = startOfDay(new Date());
    const toDate = endOfDay(addDays(fromDate, 6));

    return {
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      label: formatAnalyticsDateRange(fromDate, toDate),
    };
  }, []);

  const upcomingAvailableSlotsQuery = useQuery({
    queryKey: [
      "dashboard-home",
      "analytics",
      "appointment-slots",
      "available",
      schedulingRange.from,
      schedulingRange.to,
    ],
    queryFn: () =>
      listAppointmentSlots({
        from: schedulingRange.from,
        to: schedulingRange.to,
        status: "available",
        limit: 200,
      }),
  });

  const pendingAppointmentRequestsQuery = useQuery({
    queryKey: [
      "dashboard-home",
      "analytics",
      "appointment-requests",
      schedulingRange.from,
      schedulingRange.to,
    ],
    queryFn: () =>
      listAppointmentRequests({
        status: "pending",
        from: schedulingRange.from,
        to: schedulingRange.to,
        limit: 200,
      }),
  });

  const pendingInsightsQuery = useQuery({
    queryKey: ["dashboard-home", "analytics", "insights", "pending"],
    queryFn: () => listInsightsQueue("pending", 200),
  });

  const patientLabelMap = useMemo(
    () =>
      new Map(
        (patientsQuery.data ?? []).map((patient) => [
          patient.id,
          patient.displayName?.trim() || patient.id,
        ]),
      ),
    [patientsQuery.data],
  );

  const openPatient = useCallback(
    (patientId: string) => {
      navigate(`/patients/${encodeURIComponent(patientId)}`);
    },
    [navigate],
  );

  const openThread = useCallback(
    (patientId?: string) => {
      if (typeof patientId === "string" && patientId.trim()) {
        navigate(
          `/communication?patientId=${encodeURIComponent(patientId.trim())}`,
        );
        return;
      }

      navigate("/communication");
    },
    [navigate],
  );

  const navigateTo = useCallback(
    (path: string) => {
      navigate(path);
    },
    [navigate],
  );

  const onRefresh = useCallback(() => {
    void Promise.allSettled([
      summaryQuery.refetch(),
      priorityQueueQuery.refetch(),
      safetyEventsQuery.refetch(),
      appointmentsQuery.refetch(),
      followUpTasksQuery.refetch(),
      communicationQuery.refetch(),
      upcomingAvailableSlotsQuery.refetch(),
      pendingAppointmentRequestsQuery.refetch(),
      pendingInsightsQuery.refetch(),
      patientsQuery.refetch(),
    ]);
  }, [
    appointmentsQuery,
    communicationQuery,
    followUpTasksQuery,
    pendingAppointmentRequestsQuery,
    pendingInsightsQuery,
    patientsQuery,
    priorityQueueQuery,
    safetyEventsQuery,
    summaryQuery,
    upcomingAvailableSlotsQuery,
  ]);

  const tasksDueTodayCount = useMemo(() => {
    const today = new Date();

    return (followUpTasksQuery.data ?? []).filter((item) => {
      if (!item.dueAt) {
        return false;
      }

      return isSameCalendarDay(new Date(item.dueAt), today);
    }).length;
  }, [followUpTasksQuery.data]);

  const communicationNeedsResponseCount =
    communicationQuery.data?.counts.needsResponseCount ??
    summaryQuery.data?.messagesNeedingResponseCount ??
    null;
  const flaggedBySafetyCount =
    communicationQuery.data?.counts.flaggedBySafetyCount ?? null;
  const pendingInsightsCount =
    summaryQuery.data?.pendingInsightsCount ??
    pendingInsightsQuery.data?.length ??
    null;
  const highPriorityInsightsCount =
    pendingInsightsQuery.data?.filter((item) => item.priority >= 3).length ?? 0;
  const pendingAppointmentRequestsCount =
    pendingAppointmentRequestsQuery.data?.length ?? 0;
  const availableSlotsCount = upcomingAvailableSlotsQuery.data?.length ?? 0;
  const recentSafetyEventCount = safetyEventsQuery.data?.length ?? 0;
  const nextOpenSlot = getNextAvailableSlot(upcomingAvailableSlotsQuery.data);
  const nextOpenSlotLabel = nextOpenSlot
    ? formatDashboardTimeRange(nextOpenSlot.startsAt, nextOpenSlot.endsAt)
    : null;

  const schedulingFootnote = useMemo(() => {
    if (pendingAppointmentRequestsCount === 0 && availableSlotsCount === 0) {
      return "No visible scheduling pressure in the next 7 days.";
    }

    if (pendingAppointmentRequestsCount > availableSlotsCount) {
      return "Pending requests exceed visible open capacity in the next 7 days.";
    }

    if (availableSlotsCount > 0) {
      return "Visible open capacity currently covers pending request demand in the next 7 days.";
    }

    return "No visible open capacity is currently published in the next 7 days.";
  }, [availableSlotsCount, pendingAppointmentRequestsCount]);

  const updatedAtLabel = formatDashboardUpdatedLabel(
    Math.max(
      summaryQuery.dataUpdatedAt,
      priorityQueueQuery.dataUpdatedAt,
      safetyEventsQuery.dataUpdatedAt,
      appointmentsQuery.dataUpdatedAt,
      followUpTasksQuery.dataUpdatedAt,
      communicationQuery.dataUpdatedAt,
      upcomingAvailableSlotsQuery.dataUpdatedAt,
      pendingAppointmentRequestsQuery.dataUpdatedAt,
      pendingInsightsQuery.dataUpdatedAt,
      patientsQuery.dataUpdatedAt,
    ) || null,
  );

  const statusBar = buildDashboardStatusBar({
    updatedLabel: updatedAtLabel,
    schedulingRangeLabel: schedulingRange.label,
    priorityQueueCount: priorityQueueQuery.data?.length ?? 0,
    leadKindLabel: buildLeadKindLabel(priorityQueueQuery.data ?? []),
  });

  const attention = buildDashboardAttention({
    openAlertsCount: summaryQuery.data?.openAlertsCount ?? 0,
    messagesNeedingResponseCount: communicationNeedsResponseCount ?? 0,
    tasksDueTodayCount,
    missedCheckinsCount: summaryQuery.data?.missedCheckinsCount ?? 0,
    todayAppointmentsCount:
      summaryQuery.data?.todayAppointmentsCount ??
      appointmentsQuery.data?.length ??
      0,
    pendingInsightsCount: pendingInsightsCount ?? 0,
  });

  const summaryMetrics = buildDashboardSummaryStrip({
    summary: summaryQuery.data ?? null,
    messagesNeedingResponseCount: communicationNeedsResponseCount,
    openFollowUpTasksCount:
      summaryQuery.data?.openFollowUpTasksCount ??
      followUpTasksQuery.data?.length ??
      null,
    pendingInsightsCount,
    todayAppointmentsCount:
      summaryQuery.data?.todayAppointmentsCount ??
      appointmentsQuery.data?.length ??
      null,
    assignedToMeAlertsCount: summaryQuery.data?.assignedToMeAlertsCount ?? null,
    tasksDueTodayCount,
    highPriorityInsightsCount,
    pendingAppointmentRequestsCount,
    flaggedBySafetyCount,
  });

  const operationalLoadRows = buildDashboardOperationalLoad({
    summary: summaryQuery.data ?? null,
    messagesNeedingResponseCount: communicationNeedsResponseCount ?? 0,
    openFollowUpTasksCount:
      summaryQuery.data?.openFollowUpTasksCount ??
      followUpTasksQuery.data?.length ??
      0,
    pendingInsightsCount: pendingInsightsCount ?? 0,
    pendingAppointmentRequestsCount,
    availableSlotsCount,
    missedCheckinsCount: summaryQuery.data?.missedCheckinsCount ?? 0,
    tasksDueTodayCount,
    highPriorityInsightsCount,
    recentSafetyEventCount,
    flaggedBySafetyCount: flaggedBySafetyCount ?? 0,
  });

  const scheduleVm = buildDashboardSchedule({
    appointments: appointmentsQuery.data ?? [],
    patientLabels: patientLabelMap,
    nextOpenSlotLabel,
    schedulingFootnote,
  });

  const signalsVm = buildDashboardSignals({
    safetyEvents: safetyEventsQuery.data ?? [],
    communicationItems: communicationQuery.data?.items ?? [],
    patientLabels: patientLabelMap,
  });

  const dataContext = buildDashboardDataContext({
    updatedLabel: updatedAtLabel,
    schedulingRangeLabel: schedulingRange.label,
    priorityQueueSampleLabel: buildPriorityQueueSampleLabel(
      priorityQueueQuery.data ?? [],
      patientLabelMap,
    ),
    nextOpenSlotLabel,
  });

  const priorityQueuePressureNote = buildPriorityQueuePressureNote(
    priorityQueueQuery.data ?? [],
  );

  const isRefreshing =
    summaryQuery.isFetching ||
    priorityQueueQuery.isFetching ||
    safetyEventsQuery.isFetching ||
    appointmentsQuery.isFetching ||
    followUpTasksQuery.isFetching ||
    communicationQuery.isFetching ||
    upcomingAvailableSlotsQuery.isFetching ||
    pendingAppointmentRequestsQuery.isFetching ||
    pendingInsightsQuery.isFetching ||
    patientsQuery.isFetching;

  const summaryLoading = summaryQuery.isLoading && !summaryQuery.data;
  const summaryError = Boolean(summaryQuery.error) && !summaryQuery.data;
  const operationalLoading =
    (summaryQuery.isLoading && !summaryQuery.data) ||
    (communicationQuery.isLoading && !communicationQuery.data) ||
    (followUpTasksQuery.isLoading && !followUpTasksQuery.data);
  const operationalError =
    Boolean(summaryQuery.error) &&
    !summaryQuery.data &&
    Boolean(communicationQuery.error) &&
    !communicationQuery.data;
  const scheduleLoading =
    (appointmentsQuery.isLoading && !appointmentsQuery.data) ||
    (pendingAppointmentRequestsQuery.isLoading &&
      !pendingAppointmentRequestsQuery.data) ||
    (upcomingAvailableSlotsQuery.isLoading &&
      !upcomingAvailableSlotsQuery.data);
  const scheduleError =
    Boolean(appointmentsQuery.error) &&
    !appointmentsQuery.data &&
    Boolean(pendingAppointmentRequestsQuery.error) &&
    !pendingAppointmentRequestsQuery.data &&
    Boolean(upcomingAvailableSlotsQuery.error) &&
    !upcomingAvailableSlotsQuery.data;
  const signalsLoading =
    (safetyEventsQuery.isLoading && !safetyEventsQuery.data) ||
    (communicationQuery.isLoading && !communicationQuery.data);
  const signalsError =
    Boolean(safetyEventsQuery.error) &&
    !safetyEventsQuery.data &&
    Boolean(communicationQuery.error) &&
    !communicationQuery.data;

  return {
    statusBar,
    attention,
    summaryMetrics,
    operationalLoadRows,
    scheduleTimeline: scheduleVm.timelineBlocks,
    scheduleItems: scheduleVm.scheduleItems,
    safetySignals: signalsVm.safetyItems,
    communicationSignals: signalsVm.communicationItems,
    dataContext,
    priorityQueuePressureNote,
    schedulingFootnote: scheduleVm.schedulingFootnote,
    nextOpenSlotValue: scheduleVm.nextOpenSlotValue,
    summaryLoading,
    summaryError,
    operationalLoading,
    operationalError,
    scheduleLoading,
    scheduleError,
    signalsLoading,
    signalsError,
    isRefreshing,
    onRefresh,
    navigateTo,
    openPatient,
    openThread,
  };
}
