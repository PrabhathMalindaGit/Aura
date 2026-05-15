import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardModuleState } from '../components/dashboard/DashboardModuleState';
import { ClinicianTruthChips } from '../components/clinician/ClinicianTruthChips';
import heroBg from '../assets/hero-bg.png';
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
import { sanitizeDashboardPreviewText } from '../utils/syntheticRunTags';

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

function communicationTruthChips(item: DashboardCommunicationOverviewItem) {
  const chips: Array<{
    label: string;
    variant: 'danger' | 'warning' | 'info' | 'neutral';
    truth: 'server' | 'local';
  }> = [];

  if (item.flaggedBySafety) {
    chips.push({ label: 'Safety flagged', variant: 'danger', truth: 'server' });
  }

  if (item.responseDelayed || item.responseState === 'delayed') {
    chips.push({ label: 'Response delayed', variant: 'warning', truth: 'server' });
  } else if (item.reviewedAfterLatestInbound) {
    chips.push({ label: 'Reviewed', variant: 'info', truth: 'server' });
  } else if (item.needsResponse) {
    chips.push({ label: 'Needs response', variant: 'warning', truth: 'server' });
  }

  if (item.responseDueAt && !(item.responseDelayed || item.responseState === 'delayed')) {
    chips.push({
      label: `Due by ${new Date(item.responseDueAt).toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
      })}`,
      variant: 'neutral',
      truth: 'server',
    });
  }

  if ((item.openAlertCount ?? 0) > 0) {
    chips.push({
      label: `${item.openAlertCount} open alert${item.openAlertCount === 1 ? '' : 's'}`,
      variant: 'danger',
      truth: 'server',
    });
  }

  return chips;
}

function communicationContextLine(item: DashboardCommunicationOverviewItem): string | null {
  const parts = [
    item.patientRiskLevel === 'high' ? 'Higher risk context' : null,
    typeof item.openAlertCount === 'number'
      ? `${item.openAlertCount} open alert${item.openAlertCount === 1 ? '' : 's'}`
      : null,
    item.responseDelayed || item.responseState === 'delayed'
      ? `Response delayed past ${item.responseDelayHours ?? 'configured'}h`
      : item.reviewedAfterLatestInbound
        ? item.lastReviewedAt
          ? `Reviewed ${formatDashboardRelativeTime(item.lastReviewedAt)}`
          : 'Reviewed in workflow'
        : null,
    item.followUpRequested && !item.reviewedAfterLatestInbound
      ? 'Follow-up requested'
      : null,
    item.responseDueAt && !(item.responseDelayed || item.responseState === 'delayed')
      ? `Response target ${formatDashboardRelativeTime(item.responseDueAt)}`
      : item.responseDelayHours
        ? `Response target ${item.responseDelayHours}h`
        : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(' · ') : null;
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
        } setting the first pass today.`,
        actionLabel: 'Open alerts',
        actionPath: '/alerts',
      };
    }

    if (communicationNeedsResponseCount > 0) {
      return {
        title: 'Response pressure leads the shift',
        copy: `${communicationNeedsResponseCount} ${
          communicationNeedsResponseCount === 1 ? 'patient thread needs' : 'patient threads need'
        } clinician response right now.`,
        actionLabel: 'Open inbox',
        actionPath: '/communication',
      };
    }

    if (tasksDueTodayCount > 0 || (summaryQuery.data?.missedCheckinsCount ?? 0) > 0) {
      return {
        title: 'Follow-through leads the shift',
        copy: 'Due work and missed check-ins need the first deliberate pass.',
        actionLabel: 'Open queue',
        actionPath: '/worklist',
      };
    }

    if ((summaryQuery.data?.todayAppointmentsCount ?? 0) > 0) {
      return {
        title: 'The agenda is shaping today',
        copy: `${summaryQuery.data?.todayAppointmentsCount ?? 0} ${
          (summaryQuery.data?.todayAppointmentsCount ?? 0) === 1 ? 'visit is' : 'visits are'
        } active today and worth confirming early.`,
        actionLabel: 'Open schedule',
        actionPath: '/appointments',
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
      };
    }

    return {
      title: 'The shift is steady',
      copy: 'No urgent pressure is leading right now. Confirm the queue and keep the day moving.',
      actionLabel: 'Open queue',
      actionPath: '/worklist',
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
      return 'Safety review is leading today.';
    }

    if (communicationNeedsResponseCount > 0) {
      return 'Inbox follow-through is leading today.';
    }

    if (tasksDueTodayCount > 0 || (summaryQuery.data?.missedCheckinsCount ?? 0) > 0) {
      return 'Due work and missed check-ins are shaping the day.';
    }

    if ((summaryQuery.data?.todayAppointmentsCount ?? 0) > 0) {
      return 'The agenda is active today.';
    }

    return 'A fast shift brief for the queue, the rail, and quiet background context.';
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
      <style>{`
        .bento-grid-layout {
          display: grid;
          gap: var(--space-4);
          grid-template-columns: 1fr;
          max-width: 1400px;
          margin: 0 auto;
          width: 100%;
        }
        @media (min-width: 1024px) {
          .bento-grid-layout {
            grid-template-columns: minmax(0, 7fr) minmax(0, 4fr);
            align-items: start;
          }
        }
        .bento-hero-banner {
          position: relative;
          background-color: var(--secondary);
          background-image: linear-gradient(135deg, hsl(190 60% 40% / 0.8) 0%, hsl(230 40% 30% / 0.9) 100%), url(${heroBg});
          background-size: cover;
          background-position: center;
          border-radius: var(--radius-2xl);
          padding: 60px var(--space-6) var(--space-8);
          box-shadow: var(--shadow-2);
          overflow: hidden;
          margin-bottom: var(--space-4);
        }
        .bento-hero-banner::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(20,40,60,0.5), transparent);
          z-index: 0;
        }
        .bento-hero-banner > * {
          position: relative;
          z-index: 1;
        }
        .bento-hero-banner .today-brief__title {
          font-family: var(--font-heading);
          color: white;
          font-size: clamp(32px, 4vw, 48px);
          margin-bottom: var(--space-2);
          text-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }
        .bento-hero-banner .today-brief__copy {
          color: rgba(255,255,255,0.9);
          font-size: var(--text-lg);
          max-width: 500px;
          margin-bottom: var(--space-5);
        }
        .today-brief__facts {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: var(--space-3);
          margin-top: var(--space-2);
        }
        .bento-glass-fact {
          background: rgba(0, 0, 0, 0.25);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: var(--radius-xl);
          padding: var(--space-4);
          text-align: left;
          color: white;
          transition: transform 0.2s cubic-bezier(0.2, 0, 0, 1), background 0.2s;
        }
        .bento-glass-fact:hover {
          transform: translateY(-4px);
          background: rgba(0, 0, 0, 0.35);
        }
        .bento-glass-fact .today-brief__fact-value {
          font-family: var(--font-heading);
          font-size: var(--text-display);
          display: block;
          margin: 4px 0;
        }
        .bento-glass-fact .today-brief__fact-label {
          font-weight: 600;
          opacity: 0.9;
        }
        .bento-card-surface {
          background: rgba(255, 255, 255, 0.4);
          backdrop-filter: blur(24px) saturate(1.8);
          -webkit-backdrop-filter: blur(24px) saturate(1.8);
          border: 1px solid rgba(255, 255, 255, 0.6);
          border-radius: var(--radius-2xl);
          padding: var(--space-6);
          box-shadow: 0 12px 32px rgba(30, 40, 60, 0.08), inset 0 1px 0 rgba(255,255,255,1);
          transition: transform 0.3s cubic-bezier(0.2, 0, 0, 1), box-shadow 0.3s;
        }
        .dark .bento-card-surface {
          background: rgba(20, 25, 35, 0.5);
          border-color: rgba(255, 255, 255, 0.1);
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255,255,255,0.05);
        }
        .bento-card-surface:hover {
          transform: translateY(-2px);
          box-shadow: 0 16px 40px rgba(30, 40, 60, 0.12);
        }
        .dark .bento-card-surface:hover {
          box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
        }
        .today-surface__header {
          margin-bottom: var(--space-4);
          padding-bottom: var(--space-3);
          border-bottom: 1px solid rgba(150, 150, 150, 0.2);
        }
      `}</style>
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

      <section className="bento-hero-banner today-brief" aria-label="Shift brief">
        <div className="today-brief__lead">
          <h1 className="today-brief__title">{attentionLead.title}</h1>
          <p className="today-brief__copy">{attentionLead.copy}</p>
          <div className="today-brief__actions">
            <Button
              className="today-brief__cta"
              variant="secondary"
              onClick={() => {
                navigate(attentionLead.actionPath);
              }}
              style={{ fontWeight: 'bold' }}
            >
              {attentionLead.actionLabel}
            </Button>
          </div>
        </div>

        <div className="today-brief__facts" role="group" aria-label="Shift priorities">
          {shiftFacts.map((fact) => (
            <button
              key={fact.key}
              type="button"
              className={`today-brief__fact bento-glass-fact`}
              onClick={fact.onSelect}
            >
              <span className="today-brief__fact-label">{fact.label}</span>
              <strong className="today-brief__fact-value">{fact.value}</strong>
              <span className="today-brief__fact-detail" style={{ opacity: 0.8, fontSize: '0.9em' }}>{fact.detail}</span>
            </button>
          ))}
        </div>
      </section>

      <div className="today-layout bento-grid-layout">
        <div className="today-main-column">
          <section className="today-main-surface glass-card" aria-label="Urgent review surface" style={{ padding: 'var(--space-5)', border: 'none' }}>
            <header className="today-surface__header">
              <h2 className="today-surface__title">Open next</h2>
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
                image="/src/assets/empty-state.png"
              />
            ) : (
              <div className="today-priority-list" role="list" aria-label="Urgent review items">
                {(priorityQueueQuery.data ?? []).slice(0, 5).map((item) => (
                  <article key={item.id} className="today-priority-item" role="listitem">
                    <div className="today-priority-item__header">
                      <div className="today-priority-item__lead">
                        <p className="today-priority-item__patient">{resolvePatientLabel(item.patientId)}</p>
                        <p className="today-priority-item__kind">{priorityKindLabel(item.itemType)}</p>
                      </div>
                      <Badge variant={priorityBadgeVariant(item.priority)}>
                        {humanizeDashboardLabel(item.priority)}
                      </Badge>
                    </div>
                    <div className="today-priority-item__body">
                      <h3 className="today-priority-item__title">{item.title}</h3>
                      <p className="today-priority-item__reason">
                        {item.subtitle?.trim() ||
                          (item.dueAt
                            ? `Action is due ${formatDashboardRelativeTime(item.dueAt)}.`
                            : `${humanizeDashboardLabel(item.source)} review is still waiting.`)}
                      </p>
                    </div>
                    <div className="today-priority-item__support">
                      <span
                        className="today-priority-item__time"
                        title={item.dueAt ? formatDashboardDateTime(item.dueAt) : formatDashboardDateTime(item.createdAt)}
                      >
                        {priorityFreshnessLabel(item)}
                      </span>
                      <span className="today-priority-item__footnote">
                        {typeof item.meta?.responseState === 'string'
                          ? `${String(item.meta.responseState)} · ${
                              item.meta?.openAlertCount ?? 0
                            } open alert${item.meta?.openAlertCount === 1 ? '' : 's'}`
                          : item.dueAt
                            ? `Due ${formatDashboardDateTime(item.dueAt)}`
                            : `Opened ${formatDashboardDateTime(item.createdAt)}`}
                      </span>
                    </div>
                    <div className="today-priority-item__actions">
                      <Button size="sm" onClick={() => openPriorityItem(item)}>
                        {priorityActionLabel(item)}
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="today-context" aria-label="Operational context">
            <header className="today-context__header">
              <h2 className="today-context__title">Operational context</h2>
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
                {safetyEventsQuery.isLoading && (safetyEventsQuery.data?.length ?? 0) === 0 ? (
                  <div className="today-context-card__state" aria-label="Safety pressure loading placeholder">
                    <Skeleton height={62} />
                    <Skeleton height={62} />
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
                  <div className="today-context-feed__empty">
                    <p className="today-context-feed__empty-title">No recent safety activity</p>
                    <p className="today-context-card__note">{safetyContextNote}</p>
                  </div>
                ) : (
                  <div className="today-context-feed" role="list" aria-label="Recent safety activity">
                    {(safetyEventsQuery.data ?? []).slice(0, 2).map((item) => (
                      <article key={item.id} className="today-context-feed__item" role="listitem">
                        <div className="today-context-feed__top">
                          <div>
                            <p className="today-context-feed__patient">{resolvePatientLabel(item.patientId)}</p>
                            <p className="today-context-feed__time" title={formatDashboardDateTime(item.createdAt)}>
                              {formatDashboardRelativeTime(item.createdAt)}
                            </p>
                          </div>
                          {safetyBadge(item)}
                        </div>
                        <p className="today-context-feed__summary">{item.summary}</p>
                      </article>
                    ))}
                  </div>
                )}
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
        </div>

        <aside className="today-support-rail" aria-label="Supporting rail" style={{ display: 'grid', gap: 'var(--space-4)' }}>
          <div className="today-support-rail__shell">
            <h2 className="visually-hidden">Supporting context</h2>

            <section className="today-support-section bento-card-surface">
              <header className="today-support-section__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
                <div className="today-support-section__heading">
                  <p className="today-support-section__eyebrow" style={{ fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted-foreground)' }}>Schedule snapshot</p>
                  <h3 className="today-support-section__title" style={{ fontFamily: 'var(--font-heading)', fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>Due today</h3>
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
                <div className="today-support-section__state">
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
                        <div className="today-support-item__lead">
                          <p className="today-support-item__title">{resolvePatientLabel(item.patientId)}</p>
                          <p className="today-support-item__detail">{formatDashboardTimeRange(item.startsAt, item.endsAt)}</p>
                        </div>
                        <Badge variant={appointmentBadgeVariant(item.status)}>
                          {humanizeDashboardLabel(item.status)}
                        </Badge>
                      </div>
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
              className={`today-support-section bento-card-surface dashboard-home-communication-overview${
                reduceCommunicationOverviewAttention ? ' dashboard-home-communication-overview--reduced' : ''
              }`}
              data-testid="dashboard-home-communication-overview"
              style={{ marginTop: 'var(--space-4)' }}
            >
              <header className="today-support-section__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
                <div className="today-support-section__heading">
                  <p className="today-support-section__eyebrow" style={{ fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted-foreground)' }}>Inbox</p>
                  <h3 className="today-support-section__title" style={{ fontFamily: 'var(--font-heading)', fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>Inbox needing response</h3>
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
                <div className="today-support-section__state">
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
                        <ClinicianTruthChips chips={communicationTruthChips(item)} />
                      </div>
                      <p className="today-support-item__note">
                        {sanitizeDashboardPreviewText(item.messagePreview) || 'Conversation preview unavailable.'}
                      </p>
                      {communicationContextLine(item) ? (
                        <p className="today-support-item__note">{communicationContextLine(item)}</p>
                      ) : null}
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

            <section className="today-support-section">
              <header className="today-support-section__header">
                <div className="today-support-section__heading">
                  <p className="today-support-section__eyebrow">Follow-through</p>
                  <h3 className="today-support-section__title">Keep the day moving</h3>
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
                <div className="today-support-section__state">
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
                        <div className="today-support-item__lead">
                          <p className="today-support-item__title">{item.title}</p>
                          <p className="today-support-item__detail">{resolvePatientLabel(item.patientId)}</p>
                        </div>
                        <Badge variant={taskPriorityVariant(item.priority)}>
                          {humanizeDashboardLabel(item.priority)}
                        </Badge>
                      </div>
                      <p className="today-support-item__note">
                        {item.dueAt
                          ? `Due ${formatDashboardRelativeTime(item.dueAt)}.`
                          : `Updated ${formatDashboardRelativeTime(item.updatedAt)}.`}
                      </p>
                      <div className="today-support-item__footer">
                        <span className="today-support-item__meta">{humanizeDashboardLabel(item.type)}</span>
                        <Button size="sm" variant="secondary" onClick={() => openTaskItem(item)}>
                          {taskActionLabel(item)}
                        </Button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        </aside>
      </div>
    </Stack>
  );
}
