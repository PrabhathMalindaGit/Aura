import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
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
  isDashboardDemoCapabilityEnabled,
  resolveDashboardDemoMode,
} from "./demo/dashboardDemoMode";
import {
  DASHBOARD_DEMO_SCENARIO_IDS,
  getDashboardDemoScenario,
  type DashboardDemoScenarioId,
} from "./demo/dashboardDemoScenarios";
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
import {
  buildPatientEntryReturnTo,
  createPatientEntryState,
} from "../../../utils/patientEntryContext";

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
  schedulePendingRequestCount: number;
  scheduleAvailableSlotsCount: number;
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
  guardPatientActions: boolean;
  guardThreadActions: boolean;
  demoTools: {
    visible: boolean;
    selectedScenarioId: DashboardDemoScenarioId | null;
    scenarios: Array<{
      id: DashboardDemoScenarioId;
      label: string;
    }>;
    selectScenario: (scenarioId: DashboardDemoScenarioId) => void;
    selectRealMode: () => void;
  };
}

export function useDashboardViewModel(): UseDashboardViewModelResult {
  const navigate = useNavigate();
  const location = useLocation();
  const demoCapabilityEnabled = isDashboardDemoCapabilityEnabled();
  const demoMode = useMemo(
    () => resolveDashboardDemoMode(location.search),
    [location.search],
  );
  const isDemoMode = demoMode.enabled && Boolean(demoMode.scenarioId);
  const demoScenario = useMemo(
    () =>
      demoMode.scenarioId ? getDashboardDemoScenario(demoMode.scenarioId) : null,
    [demoMode.scenarioId],
  );
  const demoNowMs = demoMode.anchorIso ? Date.parse(demoMode.anchorIso) : null;

  const summaryQuery = useDashboardSummary({ enabled: !isDemoMode });
  const priorityQueueQuery = useDashboardPriorityQueue(7, {
    enabled: !isDemoMode,
  });
  const safetyEventsQuery = useDashboardRecentSafetyEvents(6, {
    enabled: !isDemoMode,
  });
  const appointmentsQuery = useDashboardTodayAppointments({
    enabled: !isDemoMode,
  });
  const followUpTasksQuery = useDashboardFollowUpTasks({
    limit: 12,
    enabled: !isDemoMode,
  });
  const communicationQuery = useDashboardCommunicationOverview(6, {
    enabled: !isDemoMode,
  });
  const patientsQuery = usePatients({ enabled: !isDemoMode });

  const schedulingRange = useMemo(() => {
    const baseDate = demoMode.anchorIso ? new Date(demoMode.anchorIso) : new Date();
    const fromDate = startOfDay(baseDate);
    const toDate = endOfDay(addDays(fromDate, 6));

    return {
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      label: formatAnalyticsDateRange(fromDate, toDate),
    };
  }, [demoMode.anchorIso]);

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
    enabled: !isDemoMode,
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
    enabled: !isDemoMode,
  });

  const pendingInsightsQuery = useQuery({
    queryKey: ["dashboard-home", "analytics", "insights", "pending"],
    queryFn: () => listInsightsQueue("pending", 200),
    enabled: !isDemoMode,
  });

  const summaryData = isDemoMode
    ? demoScenario?.dataset.summary ?? null
    : summaryQuery.data ?? null;
  const priorityQueueData = isDemoMode
    ? demoScenario?.dataset.priorityQueue ?? []
    : priorityQueueQuery.data ?? [];
  const safetyEventsData = isDemoMode
    ? demoScenario?.dataset.safetyEvents ?? []
    : safetyEventsQuery.data ?? [];
  const appointmentsData = isDemoMode
    ? demoScenario?.dataset.todayAppointments ?? []
    : appointmentsQuery.data ?? [];
  const followUpTasksData = isDemoMode
    ? demoScenario?.dataset.followUpTasks ?? []
    : followUpTasksQuery.data ?? [];
  const communicationOverviewData = isDemoMode
    ? demoScenario?.dataset.communicationOverview ?? null
    : communicationQuery.data ?? null;
  const appointmentRequestsData = isDemoMode
    ? demoScenario?.dataset.appointmentRequests ?? []
    : pendingAppointmentRequestsQuery.data ?? [];
  const availableSlotsData = isDemoMode
    ? demoScenario?.dataset.availableSlots ?? []
    : upcomingAvailableSlotsQuery.data ?? [];
  const pendingInsightsData = isDemoMode
    ? demoScenario?.dataset.insights ?? []
    : pendingInsightsQuery.data ?? [];
  const updatedAtMs = isDemoMode
    ? Date.parse(demoScenario?.dataset.updatedAtIso ?? "")
    : Math.max(
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
      ) || null;

  const patientLabelMap = useMemo(
    () =>
      new Map(
        ((isDemoMode
          ? demoScenario?.dataset.patients
          : patientsQuery.data) ?? []
        ).map((patient) => [
          patient.id,
          patient.displayName?.trim() || patient.id,
        ]),
      ),
    [demoScenario?.dataset.patients, isDemoMode, patientsQuery.data],
  );

  const openPatient = useCallback(
    (patientId: string) => {
      if (isDemoMode) {
        return;
      }

      const normalizedPatientId = patientId.trim();
      if (!normalizedPatientId) {
        return;
      }

      navigate(`/patients/${encodeURIComponent(normalizedPatientId)}`, {
        state: createPatientEntryState({
          patientId: normalizedPatientId,
          source: "dashboard",
          focus: "workflow",
          returnTo: buildPatientEntryReturnTo(location.pathname, location.search),
        }),
      });
    },
    [isDemoMode, location.pathname, location.search, navigate],
  );

  const openThread = useCallback(
    (patientId?: string) => {
      if (isDemoMode) {
        return;
      }

      if (typeof patientId === "string" && patientId.trim()) {
        navigate(
          `/communication?patientId=${encodeURIComponent(patientId.trim())}`,
        );
        return;
      }

      navigate("/communication");
    },
    [isDemoMode, navigate],
  );

  const navigateTo = useCallback(
    (path: string) => {
      navigate(path);
    },
    [navigate],
  );

  const updateDashboardDemoScenario = useCallback(
    (scenarioId: DashboardDemoScenarioId | null) => {
      const params = new URLSearchParams(location.search);

      if (scenarioId) {
        params.set("dashboardDemo", scenarioId);
      } else {
        params.delete("dashboardDemo");
      }

      const nextSearch = params.toString();
      navigate(
        {
          pathname: location.pathname,
          search: nextSearch ? `?${nextSearch}` : "",
        },
        { replace: true },
      );
    },
    [location.pathname, location.search, navigate],
  );

  const onRefresh = useCallback(() => {
    if (isDemoMode) {
      return;
    }

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
    isDemoMode,
    pendingAppointmentRequestsQuery,
    pendingInsightsQuery,
    patientsQuery,
    priorityQueueQuery,
    safetyEventsQuery,
    summaryQuery,
    upcomingAvailableSlotsQuery,
  ]);

  const tasksDueTodayCount = useMemo(() => {
    const today = demoMode.anchorIso ? new Date(demoMode.anchorIso) : new Date();
    const followUpTasks = (
      isDemoMode ? demoScenario?.dataset.followUpTasks : followUpTasksQuery.data
    ) ?? [];

    return followUpTasks.filter((item) => {
      if (!item.dueAt) {
        return false;
      }

      return isSameCalendarDay(new Date(item.dueAt), today);
    }).length;
  }, [
    demoMode.anchorIso,
    demoScenario?.dataset.followUpTasks,
    followUpTasksQuery.data,
    isDemoMode,
  ]);

  const communicationNeedsResponseCount =
    communicationOverviewData?.counts.needsResponseCount ??
    summaryData?.messagesNeedingResponseCount ??
    null;
  const flaggedBySafetyCount =
    communicationOverviewData?.counts.flaggedBySafetyCount ?? null;
  const pendingInsightsCount =
    summaryData?.pendingInsightsCount ??
    pendingInsightsData?.length ??
    null;
  const highPriorityInsightsCount =
    pendingInsightsData?.filter((item) => item.priority >= 3).length ?? 0;
  const pendingAppointmentRequestsCount = appointmentRequestsData.length ?? 0;
  const availableSlotsCount = availableSlotsData.length ?? 0;
  const recentSafetyEventCount = safetyEventsData.length ?? 0;
  const nextOpenSlot = getNextAvailableSlot(availableSlotsData);
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
    updatedAtMs,
    demoNowMs ?? undefined,
  );

  const statusBar = buildDashboardStatusBar({
    schedulingRangeLabel: schedulingRange.label,
    priorityQueueCount: priorityQueueData.length,
    leadKindLabel: buildLeadKindLabel(priorityQueueData),
    demoIndicatorLabel: demoMode.indicatorLabel,
    demoScenarioLabel: demoMode.scenarioLabel,
  });

  const attention = buildDashboardAttention({
    openAlertsCount: summaryData?.openAlertsCount ?? 0,
    messagesNeedingResponseCount: communicationNeedsResponseCount ?? 0,
    tasksDueTodayCount,
    missedCheckinsCount: summaryData?.missedCheckinsCount ?? 0,
    todayAppointmentsCount:
      summaryData?.todayAppointmentsCount ??
      appointmentsData.length ??
      0,
    pendingInsightsCount: pendingInsightsCount ?? 0,
  });

  const summaryMetrics = buildDashboardSummaryStrip({
    summary: summaryData,
    messagesNeedingResponseCount: communicationNeedsResponseCount,
    openFollowUpTasksCount:
      summaryData?.openFollowUpTasksCount ??
      followUpTasksData.length ??
      null,
    pendingInsightsCount,
    todayAppointmentsCount:
      summaryData?.todayAppointmentsCount ??
      appointmentsData.length ??
      null,
    assignedToMeAlertsCount: summaryData?.assignedToMeAlertsCount ?? null,
    tasksDueTodayCount,
    highPriorityInsightsCount,
    pendingAppointmentRequestsCount,
    flaggedBySafetyCount,
  });

  const operationalLoadRows = buildDashboardOperationalLoad({
    summary: summaryData,
    messagesNeedingResponseCount: communicationNeedsResponseCount ?? 0,
    openFollowUpTasksCount:
      summaryData?.openFollowUpTasksCount ??
      followUpTasksData.length ??
      0,
    pendingInsightsCount: pendingInsightsCount ?? 0,
    pendingAppointmentRequestsCount,
    availableSlotsCount,
    missedCheckinsCount: summaryData?.missedCheckinsCount ?? 0,
    tasksDueTodayCount,
    highPriorityInsightsCount,
    recentSafetyEventCount,
    flaggedBySafetyCount: flaggedBySafetyCount ?? 0,
  });

  const scheduleVm = buildDashboardSchedule({
    appointments: appointmentsData,
    patientLabels: patientLabelMap,
    nextOpenSlotLabel,
    schedulingFootnote,
    nowMs: demoNowMs ?? undefined,
  });

  const signalsVm = buildDashboardSignals({
    safetyEvents: safetyEventsData,
    communicationItems: communicationOverviewData?.items ?? [],
    patientLabels: patientLabelMap,
    nowMs: demoNowMs ?? undefined,
  });

  const dataContext = buildDashboardDataContext({
    updatedLabel: updatedAtLabel,
    schedulingRangeLabel: schedulingRange.label,
    priorityQueueSampleLabel: buildPriorityQueueSampleLabel(
      priorityQueueData,
      patientLabelMap,
    ),
    nextOpenSlotLabel,
    demoSourceLabel:
      isDemoMode && demoMode.scenarioLabel
        ? `Synthetic presentation dataset · ${demoMode.scenarioLabel}`
        : null,
  });

  const priorityQueuePressureNote = buildPriorityQueuePressureNote(
    priorityQueueData,
  );

  const isRefreshing = isDemoMode
    ? false
    : summaryQuery.isFetching ||
      priorityQueueQuery.isFetching ||
      safetyEventsQuery.isFetching ||
      appointmentsQuery.isFetching ||
      followUpTasksQuery.isFetching ||
      communicationQuery.isFetching ||
      upcomingAvailableSlotsQuery.isFetching ||
      pendingAppointmentRequestsQuery.isFetching ||
      pendingInsightsQuery.isFetching ||
      patientsQuery.isFetching;

  const summaryLoading = isDemoMode
    ? false
    : summaryQuery.isLoading && !summaryQuery.data;
  const summaryError = isDemoMode
    ? false
    : Boolean(summaryQuery.error) && !summaryQuery.data;
  const operationalLoading = isDemoMode
    ? false
    : (summaryQuery.isLoading && !summaryQuery.data) ||
      (communicationQuery.isLoading && !communicationQuery.data) ||
      (followUpTasksQuery.isLoading && !followUpTasksQuery.data);
  const operationalError = isDemoMode
    ? false
    : Boolean(summaryQuery.error) &&
      !summaryQuery.data &&
      Boolean(communicationQuery.error) &&
      !communicationQuery.data;
  const scheduleLoading = isDemoMode
    ? false
    : (appointmentsQuery.isLoading && !appointmentsQuery.data) ||
      (pendingAppointmentRequestsQuery.isLoading &&
        !pendingAppointmentRequestsQuery.data) ||
      (upcomingAvailableSlotsQuery.isLoading &&
        !upcomingAvailableSlotsQuery.data);
  const scheduleError = isDemoMode
    ? false
    : Boolean(appointmentsQuery.error) &&
      !appointmentsQuery.data &&
      Boolean(pendingAppointmentRequestsQuery.error) &&
      !pendingAppointmentRequestsQuery.data &&
      Boolean(upcomingAvailableSlotsQuery.error) &&
      !upcomingAvailableSlotsQuery.data;
  const signalsLoading = isDemoMode
    ? false
    : (safetyEventsQuery.isLoading && !safetyEventsQuery.data) ||
      (communicationQuery.isLoading && !communicationQuery.data);
  const signalsError = isDemoMode
    ? false
    : Boolean(safetyEventsQuery.error) &&
      !safetyEventsQuery.data &&
      Boolean(communicationQuery.error) &&
      !communicationQuery.data;
  const demoToolsScenarios = useMemo(
    () =>
      DASHBOARD_DEMO_SCENARIO_IDS.map((scenarioId) => ({
        id: scenarioId,
        label: getDashboardDemoScenario(scenarioId).label,
      })),
    [],
  );

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
    schedulePendingRequestCount: pendingAppointmentRequestsCount,
    scheduleAvailableSlotsCount: availableSlotsCount,
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
    guardPatientActions: isDemoMode,
    guardThreadActions: isDemoMode,
    demoTools: {
      visible: demoCapabilityEnabled,
      selectedScenarioId: demoMode.scenarioId,
      scenarios: demoToolsScenarios,
      selectScenario: updateDashboardDemoScenario,
      selectRealMode: () => updateDashboardDemoScenario(null),
    },
  };
}
