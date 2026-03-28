import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardModuleState } from '../components/dashboard/DashboardModuleState';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Section } from '../components/ui/Section';
import { Skeleton } from '../components/ui/Skeleton';
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
import type {
  DashboardCommunicationOverviewItem,
  DashboardFollowUpTaskItem,
  DashboardPriorityQueueItem,
  DashboardSafetyEvent,
  DashboardTodayAppointmentItem,
} from '../types/models';
import {
  formatDashboardDateTime,
  formatDashboardRelativeTime,
  formatDashboardTimeRange,
  humanizeDashboardLabel,
} from '../utils/dashboard';

type TodayBriefTone = 'risk' | 'warning' | 'primary' | 'neutral';

type TodayBriefFact = {
  key: string;
  label: string;
  value: number;
  detail: string;
  tone: TodayBriefTone;
  onSelect: () => void;
};

type TodayLeadAction = {
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

function priorityBadgeVariant(
  priority: DashboardPriorityQueueItem['priority'],
): 'neutral' | 'warning' | 'risk-high' {
  if (priority === 'urgent' || priority === 'high') {
    return 'risk-high';
  }

  if (priority === 'medium') {
    return 'warning';
  }

  return 'neutral';
}

function priorityActionLabel(item: DashboardPriorityQueueItem): string {
  if (item.itemType === 'alert') {
    return 'Open alerts';
  }

  if (item.itemType === 'appointment_exception') {
    return 'Open schedule';
  }

  return 'Open patient';
}

function priorityKindLabel(itemType: DashboardPriorityQueueItem['itemType']): string {
  switch (itemType) {
    case 'alert':
      return 'Safety review';
    case 'appointment_exception':
      return 'Schedule pressure';
    case 'communication':
      return 'Inbox follow-through';
    case 'missed_checkin':
      return 'Missed check-in';
    case 'task':
    default:
      return 'Follow-through';
  }
}

function priorityFreshnessLabel(item: DashboardPriorityQueueItem): string {
  if (item.dueAt) {
    return `Due ${formatDashboardRelativeTime(item.dueAt)}`;
  }

  return formatDashboardRelativeTime(item.createdAt);
}

function safetyBadge(item: DashboardSafetyEvent): JSX.Element | null {
  if (item.notificationStatus === 'failed') {
    return <Badge variant="danger">Delivery failed</Badge>;
  }

  if (item.notificationStatus === 'sent') {
    return <Badge variant="success">Notification sent</Badge>;
  }

  if (item.alertStatus === 'open') {
    return <Badge variant="danger">Open alert</Badge>;
  }

  if (item.alertStatus === 'acknowledged' || item.alertStatus === 'in_review') {
    return <Badge variant="status-ack">Acknowledged</Badge>;
  }

  if (item.alertStatus === 'resolved' || item.alertStatus === 'closed') {
    return <Badge variant="status-resolved">Resolved</Badge>;
  }

  return null;
}

function appointmentBadgeVariant(
  status: DashboardTodayAppointmentItem['status'],
): 'warning' | 'success' | 'neutral' | 'danger' {
  if (status === 'missed') {
    return 'danger';
  }

  if (status === 'completed') {
    return 'success';
  }

  if (status === 'awaiting_confirmation' || status === 'reschedule_requested') {
    return 'warning';
  }

  return 'neutral';
}

function appointmentSummary(item: DashboardTodayAppointmentItem): string {
  if (item.note?.trim()) {
    return item.note.trim();
  }

  if (item.status === 'awaiting_confirmation') {
    return 'Waiting for patient confirmation.';
  }

  if (item.status === 'reschedule_requested') {
    return 'Reschedule review is waiting.';
  }

  if (item.status === 'missed') {
    return 'Missed visit needs follow-through.';
  }

  return 'Visit is currently scheduled.';
}

function taskPriorityVariant(
  priority: DashboardFollowUpTaskItem['priority'],
): 'neutral' | 'warning' | 'risk-high' {
  if (priority === 'urgent' || priority === 'high') {
    return 'risk-high';
  }

  if (priority === 'medium') {
    return 'warning';
  }

  return 'neutral';
}

function taskActionLabel(item: DashboardFollowUpTaskItem): string {
  if (item.linkedAlertId) {
    return 'Open alerts';
  }

  if (item.linkedAppointmentId) {
    return 'Open schedule';
  }

  return 'Open patient';
}

function threadDominantBadge(
  item: DashboardCommunicationOverviewItem,
): JSX.Element | null {
  if (item.flaggedBySafety) {
    return <Badge variant="danger">Safety flagged</Badge>;
  }

  if (item.needsResponse) {
    return <Badge variant="warning">Needs response</Badge>;
  }

  if (item.followUpRequested) {
    return <Badge variant="neutral">Follow-up requested</Badge>;
  }

  return null;
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

  const patientLabelMap = useMemo(
    () =>
      new Map(
        (patientsQuery.data ?? []).map((patient) => [patient.id, patient.displayName?.trim() || patient.id]),
      ),
    [patientsQuery.data],
  );

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
    0;
  const pendingInsightsCount = summaryQuery.data?.pendingInsightsCount ?? pendingInsightsQuery.data?.length ?? 0;
  const highPriorityInsightsCount =
    pendingInsightsQuery.data?.filter((item) => item.priority >= 3).length ?? 0;
  const safetyCategoryInsightsCount =
    pendingInsightsQuery.data?.filter((item) => item.category === 'safety').length ?? 0;
  const pendingAppointmentRequestsCount = pendingAppointmentRequestsQuery.data?.length ?? 0;
  const availableSlotsCount = upcomingAvailableSlotsQuery.data?.length ?? 0;
  const recentSafetyEventCount = safetyEventsQuery.data?.length ?? 0;
  const nextOpenSlot = useMemo(() => {
    return [...(upcomingAvailableSlotsQuery.data ?? [])]
      .sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime())[0] ?? null;
  }, [upcomingAvailableSlotsQuery.data]);

  const attentionLead = useMemo<TodayLeadAction>(() => {
    if ((summaryQuery.data?.openAlertsCount ?? 0) > 0) {
      return {
        title: 'Safety review leads the shift',
        copy: `${summaryQuery.data?.openAlertsCount ?? 0} open ${
          (summaryQuery.data?.openAlertsCount ?? 0) === 1 ? 'alert is' : 'alerts are'
        } setting the first pass. Clear urgent safety work, then move through follow-through.`,
        actionLabel: 'Open alerts',
        actionPath: '/alerts',
        support: 'Start with live triage, then move into the queue and patient follow-through.',
      };
    }

    if (communicationNeedsResponseCount > 0) {
      return {
        title: 'Response pressure leads the shift',
        copy: `${communicationNeedsResponseCount} ${
          communicationNeedsResponseCount === 1 ? 'patient thread needs' : 'patient threads need'
        } clinician response. Clear waiting replies before lower-priority review.`,
        actionLabel: 'Open inbox',
        actionPath: '/communication',
        support: 'Keep message follow-up close to the main action lane until the inbox settles.',
      };
    }

    if (tasksDueTodayCount > 0 || (summaryQuery.data?.missedCheckinsCount ?? 0) > 0) {
      return {
        title: 'Follow-through leads the shift',
        copy: 'Due work and missed check-ins need a deliberate first pass before the day settles.',
        actionLabel: 'Open queue',
        actionPath: '/worklist',
        support: 'Work the main queue first, then return here for support context.',
      };
    }

    if ((summaryQuery.data?.todayAppointmentsCount ?? 0) > 0) {
      return {
        title: 'The agenda is shaping today',
        copy: `${summaryQuery.data?.todayAppointmentsCount ?? 0} ${
          (summaryQuery.data?.todayAppointmentsCount ?? 0) === 1 ? 'visit is' : 'visits are'
        } active today. Confirm the schedule, then return to the queue.`,
        actionLabel: 'Open schedule',
        actionPath: '/appointments',
        support: 'Use Today as a brief, not a report. Confirm the next move and continue into the workspace that owns it.',
      };
    }

    if (pendingInsightsCount > 0) {
      return {
        title: 'Immediate pressure is steady',
        copy: `${pendingInsightsCount} ${
          pendingInsightsCount === 1 ? 'review item is' : 'review items are'
        } waiting once live operational work is clear.`,
        actionLabel: 'Open queue',
        actionPath: '/worklist',
        support: 'The review backlog stays visible below, but the queue still owns the first move.',
      };
    }

    return {
      title: 'The shift is steady',
      copy: 'No urgent pressure is leading right now. Confirm the queue, then use the rail and context band to keep the day moving.',
      actionLabel: 'Open queue',
      actionPath: '/worklist',
      support: 'Action stays primary, support stays close, and background context stays quiet.',
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
      return 'Safety review is leading today. Clear urgent triage first, then move into follow-through.';
    }

    if (communicationNeedsResponseCount > 0) {
      return 'Response-needed communication is leading today. Clear waiting replies before background review.';
    }

    if (tasksDueTodayCount > 0 || (summaryQuery.data?.missedCheckinsCount ?? 0) > 0) {
      return 'Due work and missed check-ins are shaping the day. Start in the queue.';
    }

    if ((summaryQuery.data?.todayAppointmentsCount ?? 0) > 0) {
      return 'The agenda is active. Confirm the day, then return to the queue.';
    }

    return 'A fast shift brief for queue pressure, schedule load, inbox follow-through, and quiet background context.';
  }, [
    communicationNeedsResponseCount,
    summaryQuery.data?.missedCheckinsCount,
    summaryQuery.data?.openAlertsCount,
    summaryQuery.data?.todayAppointmentsCount,
    tasksDueTodayCount,
  ]);

  const shiftFacts = useMemo<TodayBriefFact[]>(
    () => [
      {
        key: 'alerts',
        label: 'Needs attention now',
        value: summaryQuery.data?.openAlertsCount ?? 0,
        detail:
          (summaryQuery.data?.openAlertsCount ?? 0) > 0 ? 'Safety review is live' : 'Safety queue clear',
        tone: 'risk',
        onSelect: () => navigate('/alerts'),
      },
      {
        key: 'responses',
        label: 'Message pressure',
        value: communicationNeedsResponseCount,
        detail:
          communicationNeedsResponseCount > 0 ? 'Inbox follow-up is waiting' : 'Inbox is steady',
        tone: 'warning',
        onSelect: () => navigate('/communication'),
      },
      {
        key: 'tasks',
        label: 'Due today',
        value: tasksDueTodayCount,
        detail: tasksDueTodayCount > 0 ? 'Clear before close' : 'No due tasks',
        tone: 'primary',
        onSelect: () => navigate('/worklist'),
      },
      {
        key: 'schedule',
        label: 'Schedule pressure',
        value: pendingAppointmentRequestsCount,
        detail:
          availableSlotsCount > 0
            ? `${availableSlotsCount} open slot${availableSlotsCount === 1 ? '' : 's'} visible`
            : 'No open capacity visible',
        tone: pendingAppointmentRequestsCount > availableSlotsCount ? 'warning' : 'neutral',
        onSelect: () => navigate('/appointments'),
      },
    ],
    [
      availableSlotsCount,
      communicationNeedsResponseCount,
      navigate,
      pendingAppointmentRequestsCount,
      summaryQuery.data?.openAlertsCount,
      tasksDueTodayCount,
    ],
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

  const reduceCommunicationOverviewAttention =
    notificationPreferences.effectiveCommunicationCueMode === 'reduced';

  const safetyContextNote =
    recentSafetyEventCount > 0
      ? 'Recent movement from the live safety feed.'
      : 'No recent safety activity in the current feed.';

  const reviewBacklogNote =
    pendingInsightsCount > 0
      ? `${highPriorityInsightsCount} high-priority item${highPriorityInsightsCount === 1 ? '' : 's'} remain visible in the current review queue.`
      : 'No pending insight mix is visible in the current queue.';

  const schedulingFootnote = useMemo(() => {
    if (pendingAppointmentRequestsCount === 0 && availableSlotsCount === 0) {
      return 'No visible scheduling pressure in the next 7 days.';
    }

    if (pendingAppointmentRequestsCount > availableSlotsCount) {
      return 'Pending requests exceed visible open capacity in the next 7 days.';
    }

    if (availableSlotsCount > 0) {
      return 'Visible open capacity currently covers pending request demand in the next 7 days.';
    }

    return 'No visible open capacity is currently published in the next 7 days.';
  }, [availableSlotsCount, pendingAppointmentRequestsCount]);

  return (
    <Stack
      className="page-stack dashboard-page-shell dashboard-page-shell--home dashboard-home-page dashboard-home-page--today"
      gap="5"
    >
      <Section
        className="dashboard-page-header dashboard-page-header--home dashboard-home-page__header"
        eyebrow={`Shift brief for ${clinicianFirstName}`}
        title="Today"
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

      <section className="today-brief" aria-label="Shift brief">
        <div className="today-brief__lead">
          <p className="today-brief__eyebrow">Shift brief</p>
          <h2 className="today-brief__title">{attentionLead.title}</h2>
          <p className="today-brief__copy">{attentionLead.copy}</p>
          <div className="today-brief__actions">
            <Button
              className="today-brief__cta"
              onClick={() => {
                navigate(attentionLead.actionPath);
              }}
            >
              {attentionLead.actionLabel}
            </Button>
            <p className="today-brief__support">{attentionLead.support}</p>
          </div>
        </div>

        <div className="today-brief__facts" role="list" aria-label="Shift priorities">
          {shiftFacts.map((fact) => (
            <button
              key={fact.key}
              type="button"
              className={`today-brief__fact today-brief__fact--${fact.tone}`}
              onClick={fact.onSelect}
              role="listitem"
            >
              <span className="today-brief__fact-label">{fact.label}</span>
              <strong className="today-brief__fact-value">{fact.value}</strong>
              <span className="today-brief__fact-detail">{fact.detail}</span>
            </button>
          ))}
        </div>
      </section>

      <div className="today-layout">
        <section className="today-main-surface" aria-label="Urgent review surface">
          <header className="today-surface__header">
            <div className="today-surface__intro">
              <p className="today-surface__eyebrow">Start here</p>
              <h2 className="today-surface__title">Urgent review surface</h2>
              <p className="today-surface__copy">
                Work the next clinically important item first, then use the supporting rail to keep the day moving.
              </p>
            </div>
            <div className="today-surface__facts">
              <span className="today-surface__fact">
                {summaryQuery.data?.openAlertsCount ?? 0} open alert{(summaryQuery.data?.openAlertsCount ?? 0) === 1 ? '' : 's'}
              </span>
              <span className="today-surface__fact">
                {priorityQueueQuery.data?.length ?? 0} queue item{(priorityQueueQuery.data?.length ?? 0) === 1 ? '' : 's'}
              </span>
            </div>
          </header>

          {priorityQueueQuery.isLoading && (priorityQueueQuery.data?.length ?? 0) === 0 ? (
            <div className="today-main-surface__state" aria-label="Urgent review loading placeholder">
              <Skeleton height={96} />
              <Skeleton height={96} />
              <Skeleton height={96} />
            </div>
          ) : priorityQueueQuery.error && (priorityQueueQuery.data?.length ?? 0) === 0 ? (
            <DashboardModuleState
              mode="error"
              title="Unable to load the urgent review surface"
              description="The live queue could not be loaded."
              onRetry={() => {
                void priorityQueueQuery.refetch();
              }}
              retrying={priorityQueueQuery.isFetching}
            />
          ) : (priorityQueueQuery.data?.length ?? 0) === 0 ? (
            <EmptyState
              title="Nothing urgent right now"
              description="High-priority alerts, missed check-ins, appointment exceptions, and follow-up items will appear here."
              tone="success"
            />
          ) : (
            <div className="today-priority-list" role="list" aria-label="Urgent review items">
              {(priorityQueueQuery.data ?? []).slice(0, 5).map((item) => (
                <article key={item.id} className="today-priority-item" role="listitem">
                  <div className="today-priority-item__top">
                    <div className="today-priority-item__identity">
                      <p className="today-priority-item__patient">{resolvePatientLabel(item.patientId)}</p>
                      <p className="today-priority-item__kind">{priorityKindLabel(item.itemType)}</p>
                    </div>
                    <div className="today-priority-item__state">
                      <Badge variant={priorityBadgeVariant(item.priority)}>
                        {humanizeDashboardLabel(item.priority)}
                      </Badge>
                      <span
                        className="today-priority-item__time"
                        title={item.dueAt ? formatDashboardDateTime(item.dueAt) : formatDashboardDateTime(item.createdAt)}
                      >
                        {priorityFreshnessLabel(item)}
                      </span>
                    </div>
                  </div>
                  <h3 className="today-priority-item__title">{item.title}</h3>
                  <p className="today-priority-item__reason">
                    {item.subtitle?.trim() ||
                      (item.dueAt
                        ? `Action is due ${formatDashboardRelativeTime(item.dueAt)}.`
                        : `${humanizeDashboardLabel(item.source)} review is still waiting.`)}
                  </p>
                  <div className="today-priority-item__footer">
                    <div className="today-priority-item__meta">
                      <span>{humanizeDashboardLabel(item.source)}</span>
                      <span>{humanizeDashboardLabel(item.status)}</span>
                      <span>
                        {item.dueAt
                          ? `Due ${formatDashboardDateTime(item.dueAt)}`
                          : `Opened ${formatDashboardDateTime(item.createdAt)}`}
                      </span>
                    </div>
                    <Button size="sm" onClick={() => openPriorityItem(item)}>
                      {priorityActionLabel(item)}
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}

          <section className="today-safety-pulse" aria-label="Safety pulse">
            <header className="today-safety-pulse__header">
              <div>
                <p className="today-safety-pulse__eyebrow">Safety pulse</p>
                <h3 className="today-safety-pulse__title">Recent safety movement</h3>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  navigate('/alerts');
                }}
              >
                Open alerts
              </Button>
            </header>

            {safetyEventsQuery.isLoading && (safetyEventsQuery.data?.length ?? 0) === 0 ? (
              <div className="today-safety-pulse__state" aria-label="Safety pulse loading placeholder">
                <Skeleton height={72} />
                <Skeleton height={72} />
              </div>
            ) : safetyEventsQuery.error && (safetyEventsQuery.data?.length ?? 0) === 0 ? (
              <DashboardModuleState
                mode="error"
                title="Unable to load recent safety activity"
                description="The live safety feed could not be loaded."
                onRetry={() => {
                  void safetyEventsQuery.refetch();
                }}
                retrying={safetyEventsQuery.isFetching}
              />
            ) : (safetyEventsQuery.data?.length ?? 0) === 0 ? (
              <EmptyState
                title="No recent safety activity"
                description="Alert creation and notification activity will appear here when the Safety Spine records a new event."
                tone="success"
              />
            ) : (
              <div className="today-safety-pulse__list" role="list">
                {(safetyEventsQuery.data ?? []).slice(0, 3).map((item) => (
                  <article key={item.id} className="today-safety-pulse__item" role="listitem">
                    <div className="today-safety-pulse__item-top">
                      <div>
                        <p className="today-safety-pulse__patient">{resolvePatientLabel(item.patientId)}</p>
                        <p className="today-safety-pulse__kind">{humanizeDashboardLabel(item.type)}</p>
                      </div>
                      <div className="today-safety-pulse__item-side">
                        {safetyBadge(item)}
                        <span
                          className="today-safety-pulse__time"
                          title={formatDashboardDateTime(item.createdAt)}
                        >
                          {formatDashboardRelativeTime(item.createdAt)}
                        </span>
                      </div>
                    </div>
                    <p className="today-safety-pulse__summary">{item.summary}</p>
                  </article>
                ))}
              </div>
            )}
          </section>
        </section>

        <aside className="today-support-rail" aria-label="Supporting rail">
          <section className="today-support-panel">
            <header className="today-support-panel__header">
              <div>
                <p className="today-support-panel__eyebrow">Schedule snapshot</p>
                <h2 className="today-support-panel__title">Due today</h2>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  navigate('/appointments');
                }}
              >
                Open schedule
              </Button>
            </header>

            {appointmentsQuery.isLoading && (appointmentsQuery.data?.length ?? 0) === 0 ? (
              <div className="today-support-panel__state">
                <Skeleton height={78} />
                <Skeleton height={78} />
              </div>
            ) : appointmentsQuery.error && (appointmentsQuery.data?.length ?? 0) === 0 ? (
              <DashboardModuleState
                mode="error"
                title="Unable to load today’s schedule"
                description="The schedule snapshot could not be loaded."
                onRetry={() => {
                  void appointmentsQuery.refetch();
                }}
                retrying={appointmentsQuery.isFetching}
              />
            ) : (appointmentsQuery.data?.length ?? 0) === 0 ? (
              <EmptyState
                title="No appointments today"
                description="Today’s confirmed, pending, and exception appointments will appear here."
                tone="success"
              />
            ) : (
              <div className="today-support-list" role="list">
                {(appointmentsQuery.data ?? []).slice(0, 4).map((item) => (
                  <article key={item.id} className="today-support-item" role="listitem">
                    <div className="today-support-item__top">
                      <p className="today-support-item__title">{resolvePatientLabel(item.patientId)}</p>
                      <Badge variant={appointmentBadgeVariant(item.status)}>
                        {humanizeDashboardLabel(item.status)}
                      </Badge>
                    </div>
                    <p className="today-support-item__detail">{formatDashboardTimeRange(item.startsAt, item.endsAt)}</p>
                    <p className="today-support-item__note">{appointmentSummary(item)}</p>
                    <div className="today-support-item__footer">
                      <span
                        className="today-support-item__meta"
                        title={formatDashboardDateTime(item.updatedAt)}
                      >
                        Updated {formatDashboardRelativeTime(item.updatedAt)}
                      </span>
                      <Button size="sm" variant="secondary" onClick={() => openPatient(item.patientId)}>
                        Open patient
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section
            className={`today-support-panel dashboard-home-communication-overview${
              reduceCommunicationOverviewAttention ? ' dashboard-home-communication-overview--reduced' : ''
            }`}
            data-testid="dashboard-home-communication-overview"
          >
            <header className="today-support-panel__header">
              <div>
                <p className="today-support-panel__eyebrow">Inbox</p>
                <h2 className="today-support-panel__title">Inbox needing response</h2>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  openCommunication();
                }}
              >
                Open inbox
              </Button>
            </header>

            {communicationQuery.isLoading && (communicationQuery.data?.items.length ?? 0) === 0 ? (
              <div className="today-support-panel__state">
                <Skeleton height={78} />
                <Skeleton height={78} />
              </div>
            ) : communicationQuery.error && (communicationQuery.data?.items.length ?? 0) === 0 ? (
              <DashboardModuleState
                mode="error"
                title="Unable to load inbox follow-through"
                description="Patient message review could not be loaded."
                onRetry={() => {
                  void communicationQuery.refetch();
                }}
                retrying={communicationQuery.isFetching}
              />
            ) : (communicationQuery.data?.items.length ?? 0) === 0 ? (
              <EmptyState
                title="No communication waiting"
                description="Patient communication needing clinician review will appear here."
                tone="success"
              />
            ) : (
              <div className="today-support-list" role="list">
                {(communicationQuery.data?.items ?? []).slice(0, 4).map((item) => (
                  <article key={item.id} className="today-support-item today-support-item--communication" role="listitem">
                    <div className="today-support-item__top">
                      <p className="today-support-item__title">{item.patientName}</p>
                      {threadDominantBadge(item)}
                    </div>
                    <p className="today-support-item__note">
                      {item.messagePreview?.trim() || 'Conversation preview unavailable.'}
                    </p>
                    <div className="today-support-item__footer">
                      <div className="today-support-item__meta-wrap">
                        <span
                          className="today-support-item__meta"
                          title={formatDashboardDateTime(item.messageCreatedAt)}
                        >
                          {formatDashboardRelativeTime(item.messageCreatedAt)}
                        </span>
                        {item.followUpRequested ? (
                          <span className="today-support-item__meta">Follow-up requested</span>
                        ) : null}
                      </div>
                      <Button size="sm" variant="secondary" onClick={() => openCommunication(item.patientId)}>
                        Open thread
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="today-support-panel">
            <header className="today-support-panel__header">
              <div>
                <p className="today-support-panel__eyebrow">Follow-through</p>
                <h2 className="today-support-panel__title">Keep the day moving</h2>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  navigate('/worklist');
                }}
              >
                Open queue
              </Button>
            </header>

            {followUpTasksQuery.isLoading && (followUpTasksQuery.data?.length ?? 0) === 0 ? (
              <div className="today-support-panel__state">
                <Skeleton height={78} />
                <Skeleton height={78} />
              </div>
            ) : followUpTasksQuery.error && (followUpTasksQuery.data?.length ?? 0) === 0 ? (
              <DashboardModuleState
                mode="error"
                title="Unable to load follow-through"
                description="Open clinician tasks could not be loaded."
                onRetry={() => {
                  void followUpTasksQuery.refetch();
                }}
                retrying={followUpTasksQuery.isFetching}
              />
            ) : (followUpTasksQuery.data?.length ?? 0) === 0 ? (
              <EmptyState
                title="No follow-up tasks"
                description="Open safety review, appointment, communication, and adherence follow-up items will appear here."
                tone="success"
              />
            ) : (
              <div className="today-support-list" role="list">
                {(followUpTasksQuery.data ?? []).slice(0, 4).map((item) => (
                  <article key={item.id} className="today-support-item" role="listitem">
                    <div className="today-support-item__top">
                      <p className="today-support-item__title">{item.title}</p>
                      <Badge variant={taskPriorityVariant(item.priority)}>
                        {humanizeDashboardLabel(item.priority)}
                      </Badge>
                    </div>
                    <p className="today-support-item__detail">{resolvePatientLabel(item.patientId)}</p>
                    <p className="today-support-item__note">
                      {item.dueAt
                        ? `Due ${formatDashboardRelativeTime(item.dueAt)}.`
                        : `Updated ${formatDashboardRelativeTime(item.updatedAt)}.`}
                    </p>
                    <div className="today-support-item__footer">
                      <div className="today-support-item__meta-wrap">
                        <span className="today-support-item__meta">{humanizeDashboardLabel(item.type)}</span>
                        <span className="today-support-item__meta">{humanizeDashboardLabel(item.status)}</span>
                      </div>
                      <Button size="sm" variant="secondary" onClick={() => openTaskItem(item)}>
                        {taskActionLabel(item)}
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>

      <section className="today-context" aria-label="Operational context">
        <header className="today-context__header">
          <div>
            <p className="today-context__eyebrow">Operational context</p>
            <h2 className="today-context__title">Quiet background context</h2>
          </div>
          <p className="today-context__copy">
            Enough background workload to support decisions without turning Today into a report page.
          </p>
        </header>

        <div className="today-context__grid">
          <article className="today-context-card">
            <p className="today-context-card__eyebrow">Safety workload</p>
            <h3 className="today-context-card__title">Safety pressure</h3>
            <div className="today-context-card__facts" aria-label="Safety workload facts">
              <span>{summaryQuery.data?.openAlertsCount ?? 0} open alerts</span>
              <span>{summaryQuery.data?.assignedToMeAlertsCount ?? 0} assigned to me</span>
              <span>{recentSafetyEventCount} recent feed events</span>
            </div>
            <p className="today-context-card__note">{safetyContextNote}</p>
          </article>

          <article className="today-context-card">
            <p className="today-context-card__eyebrow">Review backlog</p>
            <h3 className="today-context-card__title">Clinical review backlog</h3>
            <div className="today-context-card__facts" aria-label="Review backlog facts">
              <span>{pendingInsightsCount} pending insights</span>
              <span>{highPriorityInsightsCount} high priority</span>
              <span>{safetyCategoryInsightsCount} safety category</span>
            </div>
            <p className="today-context-card__note">{reviewBacklogNote}</p>
          </article>

          <article className="today-context-card">
            <p className="today-context-card__eyebrow">Capacity outlook</p>
            <h3 className="today-context-card__title">Scheduling balance</h3>
            <div className="today-context-card__facts" aria-label="Scheduling balance facts">
              <span>{pendingAppointmentRequestsCount} pending requests</span>
              <span>{availableSlotsCount} open slots</span>
              <span>
                {nextOpenSlot
                  ? `Next ${formatDashboardTimeRange(nextOpenSlot.startsAt, nextOpenSlot.endsAt)}`
                  : 'No open slot yet'}
              </span>
            </div>
            <p className="today-context-card__note">{schedulingFootnote}</p>
          </article>
        </div>
      </section>
    </Stack>
  );
}
