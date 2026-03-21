import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { CommunicationOverviewCard } from '../components/dashboard/CommunicationOverviewCard';
import { DashboardSummaryCards, type DashboardSummaryMetric } from '../components/dashboard/DashboardSummaryCards';
import { FollowUpTasksCard } from '../components/dashboard/FollowUpTasksCard';
import { PriorityQueueModule } from '../components/dashboard/PriorityQueueModule';
import { RecentSafetyEventsModule } from '../components/dashboard/RecentSafetyEventsModule';
import { TodayAppointmentsCard } from '../components/dashboard/TodayAppointmentsCard';
import { Button } from '../components/ui/Button';
import { Section } from '../components/ui/Section';
import { Stack } from '../components/ui/Stack';
import { useNotificationPreferences } from '../hooks/useNotificationPreferences';
import { getClinicianName } from '../services/clinicianIdentity';
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
} from '../services/clinicianApi';
import type { DashboardFollowUpTaskItem, DashboardPriorityQueueItem } from '../types/models';
import { humanizeDashboardLabel } from '../utils/dashboard';

type DashboardAnalyticsTone = 'risk' | 'warning' | 'primary' | 'success' | 'neutral';

type DashboardAnalyticsSegment = {
  key: string;
  label: string;
  value: number;
  tone: DashboardAnalyticsTone;
};

type DashboardAnalyticsStat = {
  label: string;
  value: number | string;
};

type DashboardAnalyticsCardProps = {
  eyebrow: string;
  title: string;
  subtitle: string;
  headline: ReactNode;
  stats?: DashboardAnalyticsStat[];
  segments?: DashboardAnalyticsSegment[];
  rows?: DashboardAnalyticsSegment[];
  emptyLabel: string;
  footnote: string;
};

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

function formatAnalyticsDateRange(from: Date, to: Date): string {
  const sameMonth = from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear();
  const fromLabel = from.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  });
  const toLabel = to.toLocaleDateString([], {
    month: sameMonth ? undefined : 'short',
    day: 'numeric',
  });

  return `${fromLabel} - ${toLabel}`;
}

function safetyEventBucketLabel(itemType: string, notificationStatus?: string, alertStatus?: string): string {
  if (notificationStatus) {
    return 'Notifications';
  }

  if (alertStatus || itemType.toUpperCase().includes('ALERT')) {
    return 'Alert updates';
  }

  return 'Workflow';
}

function dashboardAnalyticsToneClass(tone: DashboardAnalyticsTone): string {
  return `dashboard-analytics__tone--${tone}`;
}

function DashboardAnalyticsComposition({
  segments,
  emptyLabel,
}: {
  segments: DashboardAnalyticsSegment[];
  emptyLabel: string;
}): JSX.Element {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);

  if (total === 0) {
    return <p className="dashboard-analytics-card__empty">{emptyLabel}</p>;
  }

  return (
    <div className="dashboard-analytics-card__visual">
      <div className="dashboard-analytics-card__composition-bar" aria-hidden="true">
        {segments.map((segment) => (
          <span
            key={segment.key}
            className={`dashboard-analytics-card__composition-segment ${dashboardAnalyticsToneClass(segment.tone)}`}
            style={{ flexGrow: segment.value }}
          />
        ))}
      </div>
      <div className="dashboard-analytics-card__legend" role="list" aria-label="Current composition">
        {segments.map((segment) => (
          <span key={segment.key} className="dashboard-analytics-card__legend-item" role="listitem">
            <span
              className={`dashboard-analytics-card__legend-swatch ${dashboardAnalyticsToneClass(segment.tone)}`}
              aria-hidden="true"
            />
            <span className="dashboard-analytics-card__legend-label">{segment.label}</span>
            <strong className="dashboard-analytics-card__legend-value">{segment.value}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

function DashboardAnalyticsRows({
  rows,
  emptyLabel,
}: {
  rows: DashboardAnalyticsSegment[];
  emptyLabel: string;
}): JSX.Element {
  const highestValue = rows.reduce((max, row) => Math.max(max, row.value), 0);

  if (highestValue === 0) {
    return <p className="dashboard-analytics-card__empty">{emptyLabel}</p>;
  }

  return (
    <div className="dashboard-analytics-card__rows" role="list" aria-label="Current workload breakdown">
      {rows.map((row) => {
        const width = highestValue === 0 ? 0 : (row.value / highestValue) * 100;

        return (
          <div key={row.key} className="dashboard-analytics-card__row" role="listitem">
            <div className="dashboard-analytics-card__row-header">
              <span className="dashboard-analytics-card__row-label">{row.label}</span>
              <strong className="dashboard-analytics-card__row-value">{row.value}</strong>
            </div>
            <div className="dashboard-analytics-card__row-track" aria-hidden="true">
              <span
                className={`dashboard-analytics-card__row-fill ${dashboardAnalyticsToneClass(row.tone)}`}
                style={{ width: `${Math.max(width, row.value > 0 ? 10 : 0)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DashboardAnalyticsCard({
  eyebrow,
  title,
  subtitle,
  headline,
  stats = [],
  segments,
  rows,
  emptyLabel,
  footnote,
}: DashboardAnalyticsCardProps): JSX.Element {
  return (
    <article className="dashboard-analytics-card">
      <div className="dashboard-analytics-card__header">
        <p className="dashboard-analytics-card__eyebrow">{eyebrow}</p>
        <h3 className="dashboard-analytics-card__title">{title}</h3>
        <p className="dashboard-analytics-card__subtitle">{subtitle}</p>
      </div>

      <div className="dashboard-analytics-card__headline">{headline}</div>

      {stats.length > 0 ? (
        <dl className="dashboard-analytics-card__stats">
          {stats.map((stat) => (
            <div key={stat.label} className="dashboard-analytics-card__stat">
              <dt>{stat.label}</dt>
              <dd>{stat.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {segments ? (
        <DashboardAnalyticsComposition segments={segments} emptyLabel={emptyLabel} />
      ) : rows ? (
        <DashboardAnalyticsRows rows={rows} emptyLabel={emptyLabel} />
      ) : (
        <p className="dashboard-analytics-card__empty">{emptyLabel}</p>
      )}

      <p className="dashboard-analytics-card__footnote">{footnote}</p>
    </article>
  );
}

export function DashboardHomePage(): JSX.Element {
  const navigate = useNavigate();
  const notificationPreferences = useNotificationPreferences();
  const clinicianName = useMemo(() => getClinicianName(), []);
  const clinicianFirstName = useMemo(() => clinicianName.split(' ')[0] ?? clinicianName, [clinicianName]);
  const summaryQuery = useDashboardSummary();
  const priorityQueueQuery = useDashboardPriorityQueue(7);
  const safetyEventsQuery = useDashboardRecentSafetyEvents(6);
  const appointmentsQuery = useDashboardTodayAppointments();
  const followUpTasksQuery = useDashboardFollowUpTasks({ limit: 5 });
  const communicationQuery = useDashboardCommunicationOverview(4);
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
    queryKey: ['dashboard-home', 'analytics', 'appointment-slots', 'available', schedulingRange.from, schedulingRange.to],
    queryFn: () =>
      listAppointmentSlots({
        from: schedulingRange.from,
        to: schedulingRange.to,
        status: 'available',
        limit: 200,
      }),
  });
  const upcomingClosedSlotsQuery = useQuery({
    queryKey: ['dashboard-home', 'analytics', 'appointment-slots', 'closed', schedulingRange.from, schedulingRange.to],
    queryFn: () =>
      listAppointmentSlots({
        from: schedulingRange.from,
        to: schedulingRange.to,
        status: 'closed',
        limit: 200,
      }),
  });
  const pendingAppointmentRequestsQuery = useQuery({
    queryKey: ['dashboard-home', 'analytics', 'appointment-requests', schedulingRange.from, schedulingRange.to],
    queryFn: () =>
      listAppointmentRequests({
        status: 'pending',
        from: schedulingRange.from,
        to: schedulingRange.to,
        limit: 200,
      }),
  });
  const pendingInsightsQuery = useQuery({
    queryKey: ['dashboard-home', 'analytics', 'insights', 'pending'],
    queryFn: () => listInsightsQueue('pending', 200),
  });

  const patientLabelMap = useMemo(() => {
    return new Map(
      (patientsQuery.data ?? []).map((patient) => [
        patient.id,
        patient.displayName?.trim() || patient.id,
      ]),
    );
  }, [patientsQuery.data]);

  const resolvePatientLabel = useCallback(
    (patientId: string): string => patientLabelMap.get(patientId) ?? patientId,
    [patientLabelMap],
  );

  const openPatient = useCallback(
    (patientId: string) => {
      navigate(`/patients/${encodeURIComponent(patientId)}`);
    },
    [navigate],
  );

  const openCommunication = useCallback(
    (patientId?: string) => {
      if (typeof patientId === 'string' && patientId.trim()) {
        navigate(`/communication?patientId=${encodeURIComponent(patientId.trim())}`);
        return;
      }

      navigate('/communication');
    },
    [navigate],
  );

  const openTaskItem = useCallback(
    (item: DashboardFollowUpTaskItem) => {
      if (item.linkedAlertId) {
        navigate('/alerts');
        return;
      }

      if (item.linkedAppointmentId) {
        navigate('/appointments');
        return;
      }

      openPatient(item.patientId);
    },
    [navigate, openPatient],
  );

  const openPriorityItem = useCallback(
    (item: DashboardPriorityQueueItem) => {
      if (item.itemType === 'alert') {
        navigate('/alerts');
        return;
      }

      if (item.itemType === 'appointment_exception') {
        navigate('/appointments');
        return;
      }

      openPatient(item.patientId);
    },
    [navigate, openPatient],
  );

  const refreshAll = useCallback(() => {
    void Promise.allSettled([
      summaryQuery.refetch(),
      priorityQueueQuery.refetch(),
      safetyEventsQuery.refetch(),
      appointmentsQuery.refetch(),
      followUpTasksQuery.refetch(),
      communicationQuery.refetch(),
      upcomingAvailableSlotsQuery.refetch(),
      upcomingClosedSlotsQuery.refetch(),
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
    upcomingClosedSlotsQuery,
  ]);

  const summaryMetrics = useMemo<DashboardSummaryMetric[]>(() => {
    if (!summaryQuery.data) {
      return [];
    }

    const leadMetricKey =
      summaryQuery.data.openAlertsCount > 0
        ? 'open-alerts'
        : summaryQuery.data.openFollowUpTasksCount > 0
          ? 'follow-up-tasks'
          : summaryQuery.data.todayAppointmentsCount > 0
            ? 'today-appointments'
            : undefined;

    return [
      {
        key: 'open-alerts',
        label: 'Open alerts',
        value: summaryQuery.data.openAlertsCount,
        helper:
          summaryQuery.data.openAlertsCount > 0 ? 'First review' : 'Safety queue clear',
        tone: 'risk',
        emphasis: leadMetricKey === 'open-alerts' ? 'lead' : undefined,
        onSelect: () => navigate('/alerts'),
      },
      {
        key: 'follow-up-tasks',
        label: 'Follow-up tasks',
        value: summaryQuery.data.openFollowUpTasksCount,
        helper:
          summaryQuery.data.openFollowUpTasksCount > 0 ? 'Move next' : 'No follow-up waiting',
        tone: 'primary',
        emphasis: leadMetricKey === 'follow-up-tasks' ? 'lead' : undefined,
        onSelect: () => navigate('/worklist'),
      },
      {
        key: 'today-appointments',
        label: 'Today’s appointments',
        value: summaryQuery.data.todayAppointmentsCount,
        helper:
          summaryQuery.data.todayAppointmentsCount > 0 ? 'Confirm today' : 'No visits today',
        tone: 'success',
        emphasis: leadMetricKey === 'today-appointments' ? 'lead' : undefined,
        onSelect: () => navigate('/appointments'),
      },
      {
        key: 'assigned-to-me',
        label: 'Assigned to me',
        value: summaryQuery.data.assignedToMeAlertsCount,
        helper:
          summaryQuery.data.assignedToMeAlertsCount > 0
            ? 'Owned now'
            : 'No owned alerts',
        tone: 'neutral',
        onSelect: () => navigate('/alerts'),
      },
      {
        key: 'missed-checkins',
        label: 'Missed check-ins',
        value: summaryQuery.data.missedCheckinsCount,
        helper:
          summaryQuery.data.missedCheckinsCount > 0 ? 'Outreach needed' : 'No missed check-ins',
        tone: 'warning',
        onSelect: () => navigate('/worklist'),
      },
      {
        key: 'pending-insights',
        label: 'Pending insights',
        value: summaryQuery.data.pendingInsightsCount,
        helper:
          summaryQuery.data.pendingInsightsCount > 0 ? 'Review queue' : 'No review waiting',
        tone: 'neutral',
        onSelect: () => navigate('/insights'),
      },
    ];
  }, [navigate, summaryQuery.data]);

  const followUpInFlightCount = useMemo(() => {
    if (!summaryQuery.data) {
      return null;
    }

    return (
      summaryQuery.data.openFollowUpTasksCount + summaryQuery.data.messagesNeedingResponseCount
    );
  }, [summaryQuery.data]);

  const messagesReviewLabel = useMemo(() => {
    if (!summaryQuery.data) {
      return 'Messages updating';
    }

    const count = summaryQuery.data.messagesNeedingResponseCount;
    return count === 0
      ? 'No messages waiting'
      : `${count} ${count === 1 ? 'message needs' : 'messages need'} response`;
  }, [summaryQuery.data]);

  const ownershipLabel = useMemo(() => {
    if (!summaryQuery.data) {
      return 'Ownership updating';
    }

    const count = summaryQuery.data.assignedToMeAlertsCount;
    return count === 0
      ? 'No owned alerts'
      : `${count} ${count === 1 ? 'alert assigned' : 'alerts assigned'}`;
  }, [summaryQuery.data]);

  const headerMeta = useMemo(
    () => (
      <span className="dashboard-home-page__meta" aria-live="polite">
        <span className="dashboard-home-page__meta-pill dashboard-home-page__meta-pill--attention">
          {messagesReviewLabel}
        </span>
        <span className="dashboard-home-page__meta-pill dashboard-home-page__meta-pill--quiet">
          {ownershipLabel}
        </span>
      </span>
    ),
    [messagesReviewLabel, ownershipLabel],
  );

  const isRefreshing =
    summaryQuery.isFetching ||
    priorityQueueQuery.isFetching ||
    safetyEventsQuery.isFetching ||
    appointmentsQuery.isFetching ||
    followUpTasksQuery.isFetching ||
    communicationQuery.isFetching ||
    upcomingAvailableSlotsQuery.isFetching ||
    upcomingClosedSlotsQuery.isFetching ||
    pendingAppointmentRequestsQuery.isFetching ||
    pendingInsightsQuery.isFetching;

  const safetyActivitySegments = useMemo<DashboardAnalyticsSegment[]>(() => {
    const bucketCounts = new Map<string, number>();

    for (const item of safetyEventsQuery.data ?? []) {
      const bucket = safetyEventBucketLabel(item.type, item.notificationStatus, item.alertStatus);
      bucketCounts.set(bucket, (bucketCounts.get(bucket) ?? 0) + 1);
    }

    const toneMap: Record<string, DashboardAnalyticsTone> = {
      Notifications: 'primary',
      'Alert updates': 'risk',
      Workflow: 'neutral',
    };

    return Array.from(bucketCounts.entries()).map(([label, value]) => ({
      key: label.toLowerCase().replace(/\s+/g, '-'),
      label,
      value,
      tone: toneMap[label] ?? 'neutral',
    }));
  }, [safetyEventsQuery.data]);

  const communicationRows = useMemo<DashboardAnalyticsSegment[]>(() => {
    const counts = communicationQuery.data?.counts;

    return [
      {
        key: 'needs-response',
        label: 'Needs response',
        value: counts?.needsResponseCount ?? 0,
        tone: 'warning',
      },
      {
        key: 'safety-flagged',
        label: 'Safety flagged',
        value: counts?.flaggedBySafetyCount ?? 0,
        tone: 'risk',
      },
      {
        key: 'follow-up-requested',
        label: 'Follow-up requested',
        value: counts?.followUpRequestedCount ?? 0,
        tone: 'primary',
      },
    ];
  }, [communicationQuery.data?.counts]);

  const pendingInsightCategorySegments = useMemo<DashboardAnalyticsSegment[]>(() => {
    const categoryCounts = new Map<string, number>();

    for (const item of pendingInsightsQuery.data ?? []) {
      categoryCounts.set(item.category, (categoryCounts.get(item.category) ?? 0) + 1);
    }

    const toneMap: Record<string, DashboardAnalyticsTone> = {
      safety: 'risk',
      adherence: 'primary',
      symptoms: 'warning',
      recovery: 'success',
      habits: 'neutral',
      questionnaires: 'neutral',
    };

    return Array.from(categoryCounts.entries())
      .sort((left, right) => right[1] - left[1])
      .map(([label, value]) => ({
        key: label,
        label: humanizeDashboardLabel(label),
        value,
        tone: toneMap[label] ?? 'neutral',
      }));
  }, [pendingInsightsQuery.data]);

  const schedulingCapacitySegments = useMemo<DashboardAnalyticsSegment[]>(() => {
    const availableSlotsCount = upcomingAvailableSlotsQuery.data?.length ?? 0;
    const closedSlotsCount = upcomingClosedSlotsQuery.data?.length ?? 0;

    return [
      {
        key: 'available',
        label: 'Open slots',
        value: availableSlotsCount,
        tone: 'success',
      },
      {
        key: 'closed',
        label: 'Closed slots',
        value: closedSlotsCount,
        tone: 'neutral',
      },
    ];
  }, [upcomingAvailableSlotsQuery.data, upcomingClosedSlotsQuery.data]);

  const safetyHeadlineCount = summaryQuery.data?.openAlertsCount;
  const safetyAssignedCount = summaryQuery.data?.assignedToMeAlertsCount;
  const recentSafetyEventCount = safetyEventsQuery.data?.length ?? 0;
  const communicationNeedsResponseCount =
    communicationQuery.data?.counts.needsResponseCount ??
    summaryQuery.data?.messagesNeedingResponseCount ??
    0;
  const communicationSafetyFlaggedCount = communicationQuery.data?.counts.flaggedBySafetyCount ?? 0;
  const communicationFollowUpRequestedCount = communicationQuery.data?.counts.followUpRequestedCount ?? 0;
  const pendingInsightsCount = summaryQuery.data?.pendingInsightsCount ?? pendingInsightsQuery.data?.length ?? 0;
  const highPriorityInsightsCount =
    pendingInsightsQuery.data?.filter((item) => item.priority >= 3).length ?? 0;
  const safetyCategoryInsightsCount =
    pendingInsightsQuery.data?.filter((item) => item.category === 'safety').length ?? 0;
  const pendingAppointmentRequestsCount = pendingAppointmentRequestsQuery.data?.length ?? 0;
  const availableSlotsCount = upcomingAvailableSlotsQuery.data?.length ?? 0;
  const closedSlotsCount = upcomingClosedSlotsQuery.data?.length ?? 0;
  const insightsMixFootnote = useMemo(() => {
    if (pendingInsightsCount === 0) {
      return 'No pending insight review is waiting.';
    }

    return 'Pending queue mix from the currently loaded review queue.';
  }, [pendingInsightsCount]);
  const schedulingFootnote = useMemo(() => {
    if (
      pendingAppointmentRequestsCount === 0 &&
      availableSlotsCount === 0 &&
      closedSlotsCount === 0
    ) {
      return 'No visible scheduling pressure in the next 7 days.';
    }

    if (pendingAppointmentRequestsCount > availableSlotsCount) {
      return 'Pending requests exceed visible open capacity in the next 7 days.';
    }

    if (availableSlotsCount > 0) {
      return 'Visible open capacity currently covers pending request demand in the next 7 days.';
    }

    return 'No visible open capacity is currently published in the next 7 days.';
  }, [availableSlotsCount, closedSlotsCount, pendingAppointmentRequestsCount]);

  const heroFacts = useMemo(
    () => [
      {
        key: 'alerts',
        label: 'Needs attention now',
        note:
          summaryQuery.data?.openAlertsCount && summaryQuery.data.openAlertsCount > 0
            ? 'Open safety queue first'
            : 'Safety queue clear',
        value: summaryQuery.data?.openAlertsCount ?? '—',
      },
      {
        key: 'tasks',
        label: 'Follow-up waiting',
        note:
          followUpInFlightCount && followUpInFlightCount > 0
            ? 'Tasks and messages waiting'
            : 'No task or message backlog',
        value: followUpInFlightCount ?? '—',
      },
      {
        key: 'appointments',
        label: 'Matters today',
        note:
          summaryQuery.data?.todayAppointmentsCount && summaryQuery.data.todayAppointmentsCount > 0
            ? 'Confirm today’s schedule'
            : 'No appointments scheduled',
        value: summaryQuery.data?.todayAppointmentsCount ?? '—',
      },
    ],
    [
      followUpInFlightCount,
      summaryQuery.data?.openAlertsCount,
      summaryQuery.data?.todayAppointmentsCount,
    ],
  );

  const heroLeadKey = useMemo(() => {
    if (!summaryQuery.data) {
      return null;
    }

    if (summaryQuery.data.openAlertsCount > 0) {
      return 'alerts';
    }

    if ((followUpInFlightCount ?? 0) > 0) {
      return 'tasks';
    }

    if (summaryQuery.data.todayAppointmentsCount > 0) {
      return 'appointments';
    }

    return null;
  }, [followUpInFlightCount, summaryQuery.data]);

  const heroSubtitle = useMemo(() => {
    if (!summaryQuery.data) {
      return 'Confirm the live snapshot, then move into queue review, safety activity, and today’s follow-through.';
    }

    if (summaryQuery.data.openAlertsCount > 0) {
      return `${summaryQuery.data.openAlertsCount} ${
        summaryQuery.data.openAlertsCount === 1 ? 'open alert is' : 'open alerts are'
      } leading today. Confirm safety pressure first, then work the queue below.`;
    }

    if ((followUpInFlightCount ?? 0) > 0) {
      return `${followUpInFlightCount} ${
        followUpInFlightCount === 1 ? 'follow-up item is' : 'follow-up items are'
      } setting the pace today. Clear the waiting work, then confirm today’s schedule.`;
    }

    if (summaryQuery.data.todayAppointmentsCount > 0) {
      return `${summaryQuery.data.todayAppointmentsCount} ${
        summaryQuery.data.todayAppointmentsCount === 1 ? 'appointment shapes' : 'appointments shape'
      } today’s coordination. Confirm the schedule first, then move through follow-up.`;
    }

    return 'No urgent pressure is leading. Use the snapshot below to confirm a steady start.';
  }, [followUpInFlightCount, summaryQuery.data]);

  const focusTitle = useMemo(() => {
    if (!summaryQuery.data) {
      return 'Building today’s operating view';
    }

    if (summaryQuery.data.openAlertsCount > 0) {
      return 'Safety review leads now';
    }

    if ((followUpInFlightCount ?? 0) > 0) {
      return 'Follow-up leads now';
    }

    if (summaryQuery.data.todayAppointmentsCount > 0) {
      return 'Schedule review leads now';
    }

    return 'Queue is steady';
  }, [followUpInFlightCount, summaryQuery.data]);

  const focusCopy = useMemo(() => {
    if (!summaryQuery.data) {
      return 'Live counts are still updating.';
    }

    if (summaryQuery.data.openAlertsCount > 0) {
      return 'Start in the priority queue, then confirm the waiting tasks and visits.';
    }

    if ((followUpInFlightCount ?? 0) > 0) {
      return 'Clear the waiting follow-up next and keep schedule risk in view.';
    }

    if (summaryQuery.data.todayAppointmentsCount > 0) {
      return 'Confirm today’s visits first, then move through the remaining work.';
    }

    return 'No urgent item is leading. Confirm the snapshot and start with the queue below.';
  }, [followUpInFlightCount, summaryQuery.data]);

  const primaryZoneCopy = 'Priority queue and recent safety activity for the first review pass.';

  const secondaryZoneCopy = 'Appointments, tasks, and communication that keep the rest of the day moving.';
  const reduceCommunicationOverviewAttention =
    notificationPreferences.effectiveCommunicationCueMode === 'reduced';

  return (
    <Stack className="page-stack dashboard-home-page" gap="4">
      <section className="dashboard-home-hero glass-card" aria-label="Dashboard overview">
        <div className="dashboard-home-hero__main">
          <Section
            className="dashboard-page-header dashboard-home-page__header"
            eyebrow={`Command center for ${clinicianFirstName}`}
            title="Dashboard"
            subtitle={heroSubtitle}
            meta={headerMeta}
            actions={
              <Button
                className="dashboard-home-page__refresh"
                variant="secondary"
                size="sm"
                onClick={refreshAll}
                disabled={isRefreshing}
              >
                {isRefreshing ? 'Refreshing...' : 'Refresh'}
              </Button>
            }
          />
        </div>

        <aside className="dashboard-home-hero__aside" aria-label="Today in focus">
          <div className="dashboard-home-hero__aside-card">
            <p className="dashboard-home-hero__aside-eyebrow">Today in focus</p>
            <h3 className="dashboard-home-hero__aside-title">{focusTitle}</h3>
            <p className="dashboard-home-hero__aside-copy">{focusCopy}</p>
            <div className="dashboard-home-hero__facts" role="list" aria-label="Dashboard focus facts">
              {heroFacts.map((fact) => (
                <div
                  key={fact.key}
                  className={`dashboard-home-hero__fact${
                    heroLeadKey === fact.key ? ' dashboard-home-hero__fact--primary' : ''
                  }`}
                  role="listitem"
                >
                  <div className="dashboard-home-hero__fact-copy">
                    <span className="dashboard-home-hero__fact-label">{fact.label}</span>
                    <span className="dashboard-home-hero__fact-note">{fact.note}</span>
                  </div>
                  <strong className="dashboard-home-hero__fact-value">{fact.value}</strong>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </section>

      <section className="dashboard-home-summary-shell" aria-label="Clinical snapshot">
        <DashboardSummaryCards
          metrics={summaryMetrics}
          loading={summaryQuery.isLoading}
          hasError={Boolean(summaryQuery.error)}
          onRetry={() => {
            void summaryQuery.refetch();
          }}
          retrying={summaryQuery.isFetching}
        />
      </section>

      <section className="dashboard-analytics-band glass-card" aria-label="Operational analytics">
        <div className="dashboard-analytics-band__header">
          <div className="dashboard-home-zone__intro">
            <p className="dashboard-home-zone__eyebrow">Operational analytics</p>
            <h2 className="dashboard-home-zone__title">Current workload and visible capacity</h2>
            <p className="dashboard-home-zone__copy">
              Current-state workload mix from live safety, communication, insight, and scheduling data.
            </p>
          </div>
        </div>

        <div className="dashboard-analytics-band__grid">
          <DashboardAnalyticsCard
            eyebrow="Safety"
            title="Safety workload"
            subtitle="Current queue pressure and recent feed mix."
            headline={
              <div className="dashboard-analytics-card__headline-stack">
                <strong>{typeof safetyHeadlineCount === 'number' ? safetyHeadlineCount : '—'}</strong>
                <span>
                  {typeof safetyHeadlineCount === 'number'
                    ? `${safetyHeadlineCount} ${safetyHeadlineCount === 1 ? 'open alert' : 'open alerts'}`
                    : 'Safety queue loading'}
                </span>
              </div>
            }
            stats={[
              { label: 'Assigned to me', value: typeof safetyAssignedCount === 'number' ? safetyAssignedCount : '—' },
              { label: 'Recent feed', value: recentSafetyEventCount },
            ]}
            segments={safetyActivitySegments}
            emptyLabel="No recent safety activity in the current feed."
            footnote={
              recentSafetyEventCount > 0
                ? 'Recent event mix from the current dashboard safety feed.'
                : 'Safety pressure is currently driven only by the live queue count.'
            }
          />

          <DashboardAnalyticsCard
            eyebrow="Communication"
            title="Communication burden"
            subtitle="Current follow-up state across patient-linked threads."
            headline={
              <div className="dashboard-analytics-card__headline-stack">
                <strong>{communicationNeedsResponseCount}</strong>
                <span>
                  {communicationNeedsResponseCount === 1
                    ? 'thread needs response'
                    : 'threads need response'}
                </span>
              </div>
            }
            stats={[
              { label: 'Safety flagged', value: communicationSafetyFlaggedCount },
              { label: 'Follow-up requested', value: communicationFollowUpRequestedCount },
            ]}
            rows={communicationRows}
            emptyLabel="No communication follow-up is waiting right now."
            footnote={
              communicationSafetyFlaggedCount > 0
                ? `${communicationSafetyFlaggedCount} ${
                    communicationSafetyFlaggedCount === 1
                      ? 'thread carries safety-sensitive language.'
                      : 'threads carry safety-sensitive language.'
                  }`
                : 'Routine message follow-through currently leads this queue.'
            }
          />

          <DashboardAnalyticsCard
            eyebrow="Insights"
            title="Insights backlog"
            subtitle="Pending review pressure and category mix."
            headline={
              <div className="dashboard-analytics-card__headline-stack">
                <strong>{pendingInsightsCount}</strong>
                <span>
                  {pendingInsightsCount === 1 ? 'pending insight' : 'pending insights'}
                </span>
              </div>
            }
            stats={[
              { label: 'High priority', value: highPriorityInsightsCount },
              { label: 'Safety category', value: safetyCategoryInsightsCount },
            ]}
            segments={pendingInsightCategorySegments}
            emptyLabel="No pending insight mix is visible in the current queue."
            footnote={insightsMixFootnote}
          />

          <DashboardAnalyticsCard
            eyebrow="Scheduling"
            title="Scheduling balance"
            subtitle={`Visible demand and capacity for ${schedulingRange.label}.`}
            headline={
              <div className="dashboard-analytics-card__headline-split">
                <div className="dashboard-analytics-card__headline-stack">
                  <strong>{pendingAppointmentRequestsCount}</strong>
                  <span>pending requests</span>
                </div>
                <div className="dashboard-analytics-card__headline-stack">
                  <strong>{availableSlotsCount}</strong>
                  <span>open slots</span>
                </div>
              </div>
            }
            stats={[{ label: 'Closed slots', value: closedSlotsCount }]}
            segments={schedulingCapacitySegments}
            emptyLabel={`No visible slot data is loaded for ${schedulingRange.label}.`}
            footnote={schedulingFootnote}
          />
        </div>
      </section>

      <div className="dashboard-home-layout">
        <section className="dashboard-home-zone dashboard-home-zone--primary" aria-label="Attention and safety">
          <div className="dashboard-home-zone__header">
            <div className="dashboard-home-zone__intro">
              <p className="dashboard-home-zone__eyebrow">Attention now</p>
              <h2 className="dashboard-home-zone__title">Needs review now</h2>
              <p className="dashboard-home-zone__copy">{primaryZoneCopy}</p>
            </div>
          </div>

          <div className="dashboard-home-layout__primary">
            <PriorityQueueModule
              items={priorityQueueQuery.data ?? []}
              visibleItemCount={5}
              loading={priorityQueueQuery.isLoading}
              hasError={Boolean(priorityQueueQuery.error)}
              onRetry={() => {
                void priorityQueueQuery.refetch();
              }}
              retrying={priorityQueueQuery.isFetching}
              resolvePatientLabel={resolvePatientLabel}
              onOpenItem={openPriorityItem}
              onOpenAlerts={() => navigate('/alerts')}
            />

            <RecentSafetyEventsModule
              items={safetyEventsQuery.data ?? []}
              visibleItemCount={4}
              loading={safetyEventsQuery.isLoading}
              hasError={Boolean(safetyEventsQuery.error)}
              onRetry={() => {
                void safetyEventsQuery.refetch();
              }}
              retrying={safetyEventsQuery.isFetching}
              resolvePatientLabel={resolvePatientLabel}
              onOpenAlerts={() => navigate('/alerts')}
            />
          </div>
        </section>

        <aside className="dashboard-home-zone dashboard-home-zone--secondary" aria-label="Follow-through and schedule">
          <div className="dashboard-home-zone__header">
            <div className="dashboard-home-zone__intro">
              <p className="dashboard-home-zone__eyebrow">Follow-through today</p>
              <h2 className="dashboard-home-zone__title">Keep the day moving</h2>
              <p className="dashboard-home-zone__copy">{secondaryZoneCopy}</p>
            </div>
          </div>

          <div className="dashboard-home-layout__secondary dashboard-home-support-rail">
            <TodayAppointmentsCard
              items={appointmentsQuery.data ?? []}
              totalCount={summaryQuery.data?.todayAppointmentsCount}
              visibleItemCount={3}
              loading={appointmentsQuery.isLoading}
              hasError={Boolean(appointmentsQuery.error)}
              onRetry={() => {
                void appointmentsQuery.refetch();
              }}
              retrying={appointmentsQuery.isFetching}
              resolvePatientLabel={resolvePatientLabel}
              onOpenPatient={openPatient}
              onOpenAppointments={() => navigate('/appointments')}
            />

            <FollowUpTasksCard
              items={followUpTasksQuery.data ?? []}
              totalCount={summaryQuery.data?.openFollowUpTasksCount}
              visibleItemCount={3}
              loading={followUpTasksQuery.isLoading}
              hasError={Boolean(followUpTasksQuery.error)}
              onRetry={() => {
                void followUpTasksQuery.refetch();
              }}
              retrying={followUpTasksQuery.isFetching}
              resolvePatientLabel={resolvePatientLabel}
              onOpenTaskItem={openTaskItem}
              onOpenPatients={() => navigate('/worklist')}
            />

            <div
              className={`dashboard-home-communication-overview${
                reduceCommunicationOverviewAttention
                  ? ' dashboard-home-communication-overview--reduced'
                  : ''
              }`}
              data-testid="dashboard-home-communication-overview"
            >
              <CommunicationOverviewCard
                overview={communicationQuery.data}
                visibleItemCount={3}
                loading={communicationQuery.isLoading}
                hasError={Boolean(communicationQuery.error)}
                onRetry={() => {
                  void communicationQuery.refetch();
                }}
                retrying={communicationQuery.isFetching}
                onOpenThread={openCommunication}
                onOpenCommunication={() => openCommunication()}
              />
            </div>
          </div>
        </aside>
      </div>
    </Stack>
  );
}
