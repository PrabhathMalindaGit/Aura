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

type DashboardAttentionSignalTone = 'risk' | 'warning' | 'primary' | 'success' | 'neutral';

type DashboardAttentionSignal = {
  key: string;
  label: string;
  value: number;
  detail: string;
  tone: DashboardAttentionSignalTone;
};

type DashboardAttentionLead = {
  title: string;
  copy: string;
  actionLabel: string;
  actionPath: string;
  support: string;
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

function isSameCalendarDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
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

function DashboardAttentionHero({
  lead,
  signals,
  onOpenLead,
}: {
  lead: DashboardAttentionLead;
  signals: DashboardAttentionSignal[];
  onOpenLead: () => void;
}): JSX.Element {
  return (
    <section className="dashboard-home-attention-hero" aria-label="Needs attention now">
      <div className="dashboard-home-attention-hero__lead">
        <p className="dashboard-home-attention-hero__eyebrow">Needs attention now</p>
        <h2 className="dashboard-home-attention-hero__title">{lead.title}</h2>
        <p className="dashboard-home-attention-hero__copy">{lead.copy}</p>
        <div className="dashboard-home-attention-hero__actions">
          <Button className="dashboard-home-attention-hero__cta" onClick={onOpenLead}>
            {lead.actionLabel}
          </Button>
          <p className="dashboard-home-attention-hero__support">{lead.support}</p>
        </div>
      </div>

      <div className="dashboard-home-attention-hero__signals" role="list" aria-label="Urgent review signals">
        {signals.map((signal) => (
          <article
            key={signal.key}
            className={`dashboard-home-attention-signal dashboard-home-attention-signal--${signal.tone}`}
            role="listitem"
          >
            <div className="dashboard-home-attention-signal__top">
              <span className="dashboard-home-attention-signal__label">{signal.label}</span>
              <strong className="dashboard-home-attention-signal__value">{signal.value}</strong>
            </div>
            <p className="dashboard-home-attention-signal__detail">{signal.detail}</p>
          </article>
        ))}
      </div>
    </section>
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

  const tasksDueTodayCount = useMemo(() => {
    const today = new Date();

    return (followUpTasksQuery.data ?? []).filter((item) => {
      if (!item.dueAt) {
        return false;
      }

      return isSameCalendarDay(new Date(item.dueAt), today);
    }).length;
  }, [followUpTasksQuery.data]);

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

  const summaryMetrics = useMemo<DashboardSummaryMetric[]>(() => {
    const openAlertsCount = summaryQuery.data?.openAlertsCount ?? 0;
    const messagesNeedingResponseCount =
      communicationQuery.data?.counts.needsResponseCount ??
      summaryQuery.data?.messagesNeedingResponseCount ??
      0;
    const todayAppointmentsCount = summaryQuery.data?.todayAppointmentsCount ?? 0;
    const pendingInsightsCount = summaryQuery.data?.pendingInsightsCount ?? 0;
    const leadMetricKey =
      openAlertsCount > 0
        ? 'open-alerts'
        : messagesNeedingResponseCount > 0
          ? 'messages-needing-response'
          : tasksDueTodayCount > 0
            ? 'tasks-due-today'
            : todayAppointmentsCount > 0
              ? 'today-appointments'
              : pendingInsightsCount > 0
                ? 'pending-insights'
                : undefined;

    return [
      {
        key: 'open-alerts',
        label: 'Open alerts',
        value: openAlertsCount,
        helper: openAlertsCount > 0 ? 'Safety leads' : 'Safety queue clear',
        tone: 'risk',
        emphasis: leadMetricKey === 'open-alerts' ? 'lead' : undefined,
        onSelect: () => navigate('/alerts'),
      },
      {
        key: 'messages-needing-response',
        label: 'Need response',
        value: messagesNeedingResponseCount,
        helper:
          messagesNeedingResponseCount > 0 ? 'Patient replies waiting' : 'Inbox steady',
        tone: 'warning',
        emphasis: leadMetricKey === 'messages-needing-response' ? 'lead' : undefined,
        onSelect: () => navigate('/communication'),
      },
      {
        key: 'tasks-due-today',
        label: 'Due today',
        value: tasksDueTodayCount,
        helper: tasksDueTodayCount > 0 ? 'Action due today' : 'No due tasks',
        tone: 'primary',
        emphasis: leadMetricKey === 'tasks-due-today' ? 'lead' : undefined,
        onSelect: () => navigate('/worklist'),
      },
      {
        key: 'today-appointments',
        label: 'Appointments today',
        value: todayAppointmentsCount,
        helper: todayAppointmentsCount > 0 ? 'Agenda in motion' : 'No visits today',
        tone: 'success',
        emphasis: leadMetricKey === 'today-appointments' ? 'lead' : undefined,
        onSelect: () => navigate('/appointments'),
      },
      {
        key: 'pending-insights',
        label: 'Pending insights',
        value: pendingInsightsCount,
        helper: pendingInsightsCount > 0 ? 'Review queued' : 'No review waiting',
        tone: 'neutral',
        emphasis: leadMetricKey === 'pending-insights' ? 'lead' : undefined,
        onSelect: () => navigate('/insights'),
      },
    ];
  }, [
    communicationQuery.data?.counts.needsResponseCount,
    navigate,
    summaryQuery.data?.openAlertsCount,
    summaryQuery.data?.messagesNeedingResponseCount,
    summaryQuery.data?.pendingInsightsCount,
    summaryQuery.data?.todayAppointmentsCount,
    tasksDueTodayCount,
  ]);

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
  }, [availableSlotsCount, closedSlotsCount]);
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

  const attentionLead = useMemo<DashboardAttentionLead>(() => {
    if ((summaryQuery.data?.openAlertsCount ?? 0) > 0) {
      return {
        title: 'Safety review leads now',
        copy: `${summaryQuery.data?.openAlertsCount ?? 0} open ${
          (summaryQuery.data?.openAlertsCount ?? 0) === 1 ? 'alert is' : 'alerts are'
        } setting the first pass. Clear urgent safety work, then move through follow-up.`,
        actionLabel: 'Open alerts',
        actionPath: '/alerts',
        support: 'Urgent safety cues stay visually dominant throughout the page.',
      };
    }

    if (communicationNeedsResponseCount > 0) {
      return {
        title: 'Communication follow-up leads now',
        copy: `${communicationNeedsResponseCount} ${
          communicationNeedsResponseCount === 1 ? 'patient message needs' : 'patient messages need'
        } clinician response. Work the inbox review next, then return to the queue.`,
        actionLabel: 'Open communication',
        actionPath: '/communication',
        support: 'Response-needed and safety-flagged communication stays operationally visible.',
      };
    }

    if (tasksDueTodayCount > 0 || (summaryQuery.data?.missedCheckinsCount ?? 0) > 0) {
      return {
        title: 'Follow-through leads now',
        copy: 'Due tasks and missed check-ins need a deliberate first pass before the day settles.',
        actionLabel: 'Open worklist',
        actionPath: '/worklist',
        support: 'Action items remain above analytics and closer to the primary queue.',
      };
    }

    if (pendingInsightsCount > 0) {
      return {
        title: 'Clinical review is waiting',
        copy: `${pendingInsightsCount} ${
          pendingInsightsCount === 1 ? 'pending insight is' : 'pending insights are'
        } ready for clinician review once immediate operational work is clear.`,
        actionLabel: 'Open insights',
        actionPath: '/insights',
        support: 'Insight review stays visible, but below immediate operational pressure.',
      };
    }

    if ((summaryQuery.data?.todayAppointmentsCount ?? 0) > 0) {
      return {
        title: 'Schedule review leads next',
        copy: `${summaryQuery.data?.todayAppointmentsCount ?? 0} ${
          (summaryQuery.data?.todayAppointmentsCount ?? 0) === 1 ? 'appointment is' : 'appointments are'
        } shaping today. Confirm the agenda, then return to steady queue work.`,
        actionLabel: 'Open appointments',
        actionPath: '/appointments',
        support: 'Appointments stay compact in the right rail so action remains left-led.',
      };
    }

    return {
      title: 'Queue is steady',
      copy: 'No urgent pressure is leading right now. Confirm the main queue first, then review support widgets and analytics.',
      actionLabel: 'Open worklist',
      actionPath: '/worklist',
      support: 'The layout still keeps action first, support second, and analytics lower.',
    };
  }, [
    communicationNeedsResponseCount,
    pendingInsightsCount,
    summaryQuery.data?.missedCheckinsCount,
    summaryQuery.data?.openAlertsCount,
    summaryQuery.data?.todayAppointmentsCount,
    tasksDueTodayCount,
  ]);

  const headerSubtitle = useMemo(() => {
    if ((summaryQuery.data?.openAlertsCount ?? 0) > 0) {
      return 'Safety review is leading today. Work the urgent queue first, then move through follow-through.';
    }

    if (communicationNeedsResponseCount > 0) {
      return 'Communication follow-up is leading today. Clear waiting replies before lower-priority review.';
    }

    if (tasksDueTodayCount > 0 || (summaryQuery.data?.missedCheckinsCount ?? 0) > 0) {
      return 'Follow-through is leading today. Clear due work and missed check-ins first.';
    }

    if (pendingInsightsCount > 0) {
      return 'Immediate operations are quieter. Pending clinician review is ready below.';
    }

    if ((summaryQuery.data?.todayAppointmentsCount ?? 0) > 0) {
      return 'Appointments are shaping the day. Confirm the agenda, then work the remaining queue.';
    }

    return 'Immediate work is steady. Use the command center below to confirm action, support, and analytics.';
  }, [
    communicationNeedsResponseCount,
    pendingInsightsCount,
    summaryQuery.data?.missedCheckinsCount,
    summaryQuery.data?.openAlertsCount,
    summaryQuery.data?.todayAppointmentsCount,
    tasksDueTodayCount,
  ]);

  const attentionSignals = useMemo<DashboardAttentionSignal[]>(
    () => [
      {
        key: 'alerts',
        label: 'Open alerts',
        value: summaryQuery.data?.openAlertsCount ?? 0,
        detail:
          (summaryQuery.data?.openAlertsCount ?? 0) > 0
            ? 'Safety triage is live'
            : 'Safety queue clear',
        tone: 'risk',
      },
      {
        key: 'communication',
        label: 'Need response',
        value: communicationNeedsResponseCount,
        detail:
          communicationNeedsResponseCount > 0
            ? 'Patient follow-up waiting'
            : 'Inbox under control',
        tone: 'warning',
      },
      {
        key: 'missed-checkins',
        label: 'Missed check-ins',
        value: summaryQuery.data?.missedCheckinsCount ?? 0,
        detail:
          (summaryQuery.data?.missedCheckinsCount ?? 0) > 0
            ? 'Outreach still needed'
            : 'No missed check-ins',
        tone: 'primary',
      },
      {
        key: 'tasks-due',
        label: 'Tasks due today',
        value: tasksDueTodayCount,
        detail: tasksDueTodayCount > 0 ? 'Clear before close' : 'No due tasks',
        tone: 'warning',
      },
      {
        key: 'insights',
        label: 'High-priority insights',
        value: highPriorityInsightsCount,
        detail:
          highPriorityInsightsCount > 0 ? 'Clinician review waiting' : 'No high-priority review',
        tone: 'neutral',
      },
    ],
    [
      communicationNeedsResponseCount,
      highPriorityInsightsCount,
      summaryQuery.data?.missedCheckinsCount,
      summaryQuery.data?.openAlertsCount,
      tasksDueTodayCount,
    ],
  );

  const reduceCommunicationOverviewAttention =
    notificationPreferences.effectiveCommunicationCueMode === 'reduced';

  return (
    <Stack
      className="page-stack dashboard-page-shell dashboard-page-shell--home dashboard-home-page dashboard-home-page--command-center"
      gap="5"
    >
      <section className="dashboard-home-command-header" aria-label="Dashboard overview">
        <Section
          className="dashboard-page-header dashboard-page-header--home dashboard-home-page__header"
          eyebrow={`Clinical command center for ${clinicianFirstName}`}
          title="Dashboard"
          subtitle={headerSubtitle}
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
      </section>

      <section className="dashboard-home-summary-shell dashboard-home-summary-shell--command" aria-label="Dashboard KPI strip">
        <div className="dashboard-home-summary-shell__header">
          <div className="dashboard-home-summary-shell__intro">
            <p className="dashboard-home-summary-shell__eyebrow">Today at a glance</p>
            <h2 className="dashboard-home-summary-shell__title">Operational snapshot</h2>
            <p className="dashboard-home-summary-shell__copy">
              Five counts that define the next move across safety, communication, schedule, tasks, and clinician review.
            </p>
          </div>
        </div>

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

      <div className="dashboard-home-command-grid">
        <section className="dashboard-home-command-grid__primary" aria-label="Primary operational workspace">
          <DashboardAttentionHero
            lead={attentionLead}
            signals={attentionSignals}
            onOpenLead={() => {
              navigate(attentionLead.actionPath);
            }}
          />

          <section className="dashboard-home-zone dashboard-home-zone--primary" aria-label="Priority queue and safety">
            <div className="dashboard-home-zone__header">
              <div className="dashboard-home-zone__intro">
                <p className="dashboard-home-zone__eyebrow">Primary operational workspace</p>
                <h2 className="dashboard-home-zone__title">Urgent work leads</h2>
                <p className="dashboard-home-zone__copy">
                  Start with the main action list, then use the safety feed to confirm recent movement.
                </p>
              </div>
            </div>

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
          </section>
        </section>

        <aside className="dashboard-home-command-grid__secondary" aria-label="Operational support widgets">
          <section className="dashboard-home-zone dashboard-home-zone--secondary" aria-label="Follow-through and support">
            <div className="dashboard-home-zone__header">
              <div className="dashboard-home-zone__intro">
                <p className="dashboard-home-zone__eyebrow">Operational support</p>
                <h2 className="dashboard-home-zone__title">Keep the day moving</h2>
                <p className="dashboard-home-zone__copy">
                  Compact schedule, task, and inbox widgets that support the main action lane.
                </p>
              </div>
            </div>

            <div className="dashboard-home-support-rail">
              <TodayAppointmentsCard
                items={appointmentsQuery.data ?? []}
                totalCount={summaryQuery.data?.todayAppointmentsCount}
                visibleItemCount={4}
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
                visibleItemCount={4}
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
                  visibleItemCount={4}
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
          </section>
        </aside>
      </div>

      <section className="dashboard-analytics-band dashboard-analytics-band--secondary glass-card" aria-label="Operational analytics">
        <div className="dashboard-analytics-band__header">
          <div className="dashboard-home-zone__intro">
            <p className="dashboard-home-zone__eyebrow">Operational analytics</p>
            <h2 className="dashboard-home-zone__title">Background workload and capacity</h2>
            <p className="dashboard-home-zone__copy">
              Visual summaries sit lower so action remains primary and analytics stays supportive.
            </p>
          </div>
        </div>

        <div className="dashboard-analytics-band__grid">
          <DashboardAnalyticsCard
            eyebrow="Safety"
            title="Safety workload"
            subtitle="Queue pressure and recent feed mix."
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
            subtitle="Follow-up state across patient-linked threads."
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
            subtitle="Pending review pressure and mix."
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
    </Stack>
  );
}
