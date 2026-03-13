import { useCallback, useMemo } from 'react';
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
import { getClinicianName } from '../services/clinicianIdentity';
import {
  useDashboardCommunicationOverview,
  useDashboardFollowUpTasks,
  useDashboardPriorityQueue,
  useDashboardRecentSafetyEvents,
  useDashboardSummary,
  useDashboardTodayAppointments,
  usePatients,
} from '../services/clinicianApi';
import type { DashboardFollowUpTaskItem, DashboardPriorityQueueItem } from '../types/models';

export function DashboardHomePage(): JSX.Element {
  const navigate = useNavigate();
  const clinicianName = useMemo(() => getClinicianName(), []);
  const clinicianFirstName = useMemo(() => clinicianName.split(' ')[0] ?? clinicianName, [clinicianName]);
  const summaryQuery = useDashboardSummary();
  const priorityQueueQuery = useDashboardPriorityQueue(7);
  const safetyEventsQuery = useDashboardRecentSafetyEvents(6);
  const appointmentsQuery = useDashboardTodayAppointments();
  const followUpTasksQuery = useDashboardFollowUpTasks({ limit: 5 });
  const communicationQuery = useDashboardCommunicationOverview(4);
  const patientsQuery = usePatients();

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
      patientsQuery.refetch(),
    ]);
  }, [
    appointmentsQuery,
    communicationQuery,
    followUpTasksQuery,
    patientsQuery,
    priorityQueueQuery,
    safetyEventsQuery,
    summaryQuery,
  ]);

  const summaryMetrics = useMemo<DashboardSummaryMetric[]>(() => {
    if (!summaryQuery.data) {
      return [];
    }

    return [
      {
        key: 'open-alerts',
        label: 'Open alerts',
        value: summaryQuery.data.openAlertsCount,
        helper:
          summaryQuery.data.openAlertsCount > 0 ? 'Needs safety review' : 'No safety queue',
        tone: 'risk',
        onSelect: () => navigate('/alerts'),
      },
      {
        key: 'follow-up-tasks',
        label: 'Follow-up tasks',
        value: summaryQuery.data.openFollowUpTasksCount,
        helper:
          summaryQuery.data.openFollowUpTasksCount > 0
            ? 'Actionable follow-up'
            : 'No follow-up waiting',
        tone: 'primary',
        onSelect: () => navigate('/worklist'),
      },
      {
        key: 'today-appointments',
        label: 'Today’s appointments',
        value: summaryQuery.data.todayAppointmentsCount,
        helper:
          summaryQuery.data.todayAppointmentsCount > 0 ? 'Schedule to confirm' : 'No visits today',
        tone: 'success',
        onSelect: () => navigate('/appointments'),
      },
      {
        key: 'assigned-to-me',
        label: 'Assigned to me',
        value: summaryQuery.data.assignedToMeAlertsCount,
        helper:
          summaryQuery.data.assignedToMeAlertsCount > 0
            ? 'Current ownership'
            : 'No owned alerts',
        tone: 'neutral',
        onSelect: () => navigate('/alerts'),
      },
      {
        key: 'missed-checkins',
        label: 'Missed check-ins',
        value: summaryQuery.data.missedCheckinsCount,
        helper:
          summaryQuery.data.missedCheckinsCount > 0 ? 'Needs outreach' : 'No missed check-ins',
        tone: 'warning',
        onSelect: () => navigate('/worklist'),
      },
      {
        key: 'pending-insights',
        label: 'Pending insights',
        value: summaryQuery.data.pendingInsightsCount,
        helper:
          summaryQuery.data.pendingInsightsCount > 0 ? 'Awaiting review' : 'No suggested review',
        tone: 'neutral',
        onSelect: () => navigate('/insights'),
      },
    ];
  }, [navigate, summaryQuery.data]);

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
      ? 'No alert ownership yet'
      : `${count} ${count === 1 ? 'alert is' : 'alerts are'} assigned to you`;
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
    communicationQuery.isFetching;

  const heroFacts = useMemo(
    () => [
      {
        key: 'alerts',
        label: 'Open alerts',
        value: summaryQuery.data?.openAlertsCount ?? '—',
      },
      {
        key: 'tasks',
        label: 'Follow-up tasks',
        value: summaryQuery.data?.openFollowUpTasksCount ?? '—',
      },
      {
        key: 'appointments',
        label: 'Today’s appointments',
        value: summaryQuery.data?.todayAppointmentsCount ?? '—',
      },
    ],
    [
      summaryQuery.data?.openAlertsCount,
      summaryQuery.data?.openFollowUpTasksCount,
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

    if (
      summaryQuery.data.openFollowUpTasksCount > 0 ||
      summaryQuery.data.messagesNeedingResponseCount > 0
    ) {
      return 'tasks';
    }

    if (summaryQuery.data.todayAppointmentsCount > 0) {
      return 'appointments';
    }

    return null;
  }, [summaryQuery.data]);

  const heroSubtitle = useMemo(() => {
    if (!summaryQuery.data) {
      return 'Start with the live snapshot, then move into the queue.';
    }

    if (summaryQuery.data.openAlertsCount > 0) {
      return `${summaryQuery.data.openAlertsCount} ${
        summaryQuery.data.openAlertsCount === 1 ? 'open alert needs' : 'open alerts need'
      } review before the rest of the day moves forward.`;
    }

    if (
      summaryQuery.data.openFollowUpTasksCount > 0 ||
      summaryQuery.data.messagesNeedingResponseCount > 0
    ) {
      return 'Safety pressure is lighter. Move through follow-up, communication, and today’s schedule next.';
    }

    if (summaryQuery.data.todayAppointmentsCount > 0) {
      return 'Safety pressure is light. Confirm today’s schedule first, then scan the remaining follow-up.';
    }

    return 'No immediate safety pressure. Use the live snapshot to confirm the workspace is still quiet.';
  }, [summaryQuery.data]);

  const focusTitle = useMemo(() => {
    if (!summaryQuery.data) {
      return 'Today’s review is still loading';
    }

    if (summaryQuery.data.openAlertsCount > 0) {
      return 'Safety review leads the day';
    }

    if (
      summaryQuery.data.openFollowUpTasksCount > 0 ||
      summaryQuery.data.messagesNeedingResponseCount > 0
    ) {
      return 'Follow-through leads the day';
    }

    if (summaryQuery.data.todayAppointmentsCount > 0) {
      return 'The schedule is the first check';
    }

    return 'The day is steady';
  }, [summaryQuery.data]);

  const focusCopy = useMemo(() => {
    if (!summaryQuery.data) {
      return 'Use the live counts below, then open the queue.';
    }

    if (summaryQuery.data.openAlertsCount > 0) {
      return 'Start in the priority queue. Then confirm follow-up and today’s schedule.';
    }

    if (
      summaryQuery.data.openFollowUpTasksCount > 0 ||
      summaryQuery.data.messagesNeedingResponseCount > 0
    ) {
      return 'Safety pressure is lighter. Move through tasks and communication next.';
    }

    if (summaryQuery.data.todayAppointmentsCount > 0) {
      return 'Confirm today’s visits, then scan the remaining follow-up.';
    }

    return 'Start with the live snapshot and confirm the workspace is still quiet.';
  }, [summaryQuery.data]);

  const summaryBandCopy = useMemo(() => {
    if (!summaryQuery.data) {
      return 'Safety, follow-up, and schedule pressure in one read.';
    }

    if (summaryQuery.data.openAlertsCount > 0) {
      return 'Scan the live counts, then move straight into safety review.';
    }

    if (
      summaryQuery.data.openFollowUpTasksCount > 0 ||
      summaryQuery.data.messagesNeedingResponseCount > 0
    ) {
      return 'Safety is steadier. Use the counts below to balance follow-up and the day’s schedule.';
    }

    if (summaryQuery.data.todayAppointmentsCount > 0) {
      return 'Use the counts below to confirm today’s schedule and the remaining follow-up.';
    }

    return 'A quick read of the live counts before moving into the workspace.';
  }, [summaryQuery.data]);

  const primaryZoneCopy = useMemo(() => {
    if (!summaryQuery.data) {
      return 'Use the queue and recent safety events to review what needs attention first.';
    }

    if (summaryQuery.data.openAlertsCount > 0) {
      return 'Open alerts and recent safety events stay together for fast review.';
    }

    return 'This area stays ready for urgent review when safety pressure changes.';
  }, [summaryQuery.data]);

  const secondaryZoneCopy = useMemo(() => {
    if (!summaryQuery.data) {
      return 'Appointments, tasks, and communication stay grouped here for the rest of the day.';
    }

    if (
      summaryQuery.data.todayAppointmentsCount > 0 ||
      summaryQuery.data.openFollowUpTasksCount > 0 ||
      summaryQuery.data.messagesNeedingResponseCount > 0
    ) {
      return 'Appointments, tasks, and communication stay grouped here for coordinated follow-through.';
    }

    return 'This rail holds the remaining follow-through and schedule context.';
  }, [summaryQuery.data]);

  return (
    <Stack className="page-stack dashboard-home-page" gap="4">
      <section className="dashboard-home-hero glass-card" aria-label="Dashboard overview">
        <div className="dashboard-home-hero__main">
          <Section
            className="dashboard-page-header dashboard-home-page__header"
            eyebrow={`Today’s operating picture for ${clinicianFirstName}`}
            title="Dashboard"
            subtitle={heroSubtitle}
            meta={headerMeta}
            actions={
              <Button variant="secondary" size="sm" onClick={refreshAll} disabled={isRefreshing}>
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
                  <span className="dashboard-home-hero__fact-label">{fact.label}</span>
                  <strong className="dashboard-home-hero__fact-value">{fact.value}</strong>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </section>

      <section className="dashboard-home-summary-shell glass-card" aria-label="Clinical snapshot">
        <div className="dashboard-home-summary-shell__header">
          <div className="dashboard-home-summary-shell__intro">
            <p className="dashboard-home-summary-shell__eyebrow">Clinical snapshot</p>
            <h2 className="dashboard-home-summary-shell__title">Start with the live snapshot</h2>
            <p className="dashboard-home-summary-shell__copy">{summaryBandCopy}</p>
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

      <div className="dashboard-home-layout">
        <section className="dashboard-home-zone dashboard-home-zone--primary" aria-label="Attention and safety">
          <div className="dashboard-home-zone__header">
            <div className="dashboard-home-zone__intro">
              <p className="dashboard-home-zone__eyebrow">Attention and safety</p>
              <h2 className="dashboard-home-zone__title">Review what needs action now</h2>
              <p className="dashboard-home-zone__copy">{primaryZoneCopy}</p>
            </div>
          </div>

          <div className="dashboard-home-layout__primary">
          <PriorityQueueModule
            items={priorityQueueQuery.data ?? []}
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
              <p className="dashboard-home-zone__eyebrow">Follow-through and schedule</p>
              <h2 className="dashboard-home-zone__title">Keep the day moving</h2>
              <p className="dashboard-home-zone__copy">{secondaryZoneCopy}</p>
            </div>
          </div>

          <div className="dashboard-home-layout__secondary dashboard-home-support-rail">
          <TodayAppointmentsCard
            items={appointmentsQuery.data ?? []}
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

          <CommunicationOverviewCard
            overview={communicationQuery.data}
            loading={communicationQuery.isLoading}
            hasError={Boolean(communicationQuery.error)}
            onRetry={() => {
              void communicationQuery.refetch();
            }}
            retrying={communicationQuery.isFetching}
            onOpenPatient={openPatient}
            onOpenPatients={() => navigate('/worklist')}
          />
          </div>
        </aside>
      </div>
    </Stack>
  );
}
