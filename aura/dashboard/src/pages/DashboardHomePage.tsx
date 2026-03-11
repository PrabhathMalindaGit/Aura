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
import { useConnectionStatus } from '../services/connection';
import type { DashboardFollowUpTaskItem, DashboardPriorityQueueItem } from '../types/models';

function formatUpdatedAt(lastSuccessAt: number | null): string {
  if (!lastSuccessAt) {
    return 'Waiting for data';
  }

  return new Date(lastSuccessAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function DashboardHomePage(): JSX.Element {
  const navigate = useNavigate();
  const connection = useConnectionStatus();
  const clinicianName = useMemo(() => getClinicianName(), []);
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
          summaryQuery.data.openAlertsCount > 0 ? 'Safety triage queue' : 'No open safety alerts',
        tone: 'risk',
        onSelect: () => navigate('/alerts'),
      },
      {
        key: 'assigned-to-me',
        label: 'Assigned to me',
        value: summaryQuery.data.assignedToMeAlertsCount,
        helper: 'Current alert ownership',
        tone: 'primary',
        onSelect: () => navigate('/alerts'),
      },
      {
        key: 'pending-insights',
        label: 'Pending insights',
        value: summaryQuery.data.pendingInsightsCount,
        helper: 'Suggested review items',
        tone: 'neutral',
        onSelect: () => navigate('/insights'),
      },
      {
        key: 'today-appointments',
        label: 'Today’s appointments',
        value: summaryQuery.data.todayAppointmentsCount,
        helper: 'Schedule and confirmations',
        tone: 'success',
        onSelect: () => navigate('/appointments'),
      },
      {
        key: 'missed-checkins',
        label: 'Missed check-ins',
        value: summaryQuery.data.missedCheckinsCount,
        helper: 'Patients needing outreach',
        tone: 'warning',
        onSelect: () => navigate('/worklist'),
      },
      {
        key: 'follow-up-tasks',
        label: 'Follow-up tasks',
        value: summaryQuery.data.openFollowUpTasksCount,
        helper: 'Open clinician workflow items',
        tone: 'primary',
        onSelect: () => navigate('/worklist'),
      },
    ];
  }, [navigate, summaryQuery.data]);

  const headerMeta = useMemo(
    () => (
      <span className="dashboard-home-page__meta" aria-live="polite">
        <span
          className={`dashboard-home-page__meta-pill ${
            connection.online
              ? 'dashboard-home-page__meta-pill--online'
              : 'dashboard-home-page__meta-pill--offline'
          }`}
        >
          {connection.online ? 'Connected' : 'Offline snapshot'}
        </span>
        <span className="dashboard-home-page__meta-pill">
          Messages waiting {summaryQuery.data?.messagesNeedingResponseCount ?? '—'}
        </span>
        <span className="dashboard-home-page__meta-pill">Updated {formatUpdatedAt(connection.lastSuccessAt)}</span>
      </span>
    ),
    [connection.lastSuccessAt, connection.online, summaryQuery.data?.messagesNeedingResponseCount],
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

  const summaryBandCopy = useMemo(() => {
    if (!summaryQuery.data) {
      return 'Review the live counters to orient safety load, follow-up pressure, and schedule context before opening the queue.';
    }

    if (summaryQuery.data.openAlertsCount > 0) {
      return 'Use this layer to size today’s safety workload first, then move into the live queue and follow-through rail.';
    }

    if (summaryQuery.data.openFollowUpTasksCount > 0 || summaryQuery.data.todayAppointmentsCount > 0) {
      return 'The safety queue is quieter right now, so the day shifts toward follow-up actions and the active schedule.';
    }

    return 'Today’s overview is light, with no immediate safety pressure and a lower follow-up burden across the workspace.';
  }, [summaryQuery.data]);

  const primaryZoneCopy = useMemo(() => {
    if (!summaryQuery.data) {
      return 'Use the live queue and recent safety timeline to review what needs clinical attention first.';
    }

    if (summaryQuery.data.openAlertsCount > 0) {
      return 'Open alerts and recent safety events stay together here so review decisions can happen quickly and with context.';
    }

    return 'This area still anchors urgent review, even when the current safety queue is lighter and the day is more stable.';
  }, [summaryQuery.data]);

  const secondaryZoneCopy = useMemo(() => {
    if (!summaryQuery.data) {
      return 'Appointments, follow-up tasks, and communication review stay grouped here for a fast read on the rest of the day.';
    }

    if (summaryQuery.data.todayAppointmentsCount > 0 || summaryQuery.data.openFollowUpTasksCount > 0) {
      return 'Keep the schedule, clinician tasks, and communication review in one quieter rail so follow-through stays coordinated.';
    }

    return 'When the schedule is lighter, this rail becomes a calm reference for the remaining follow-up and communication context.';
  }, [summaryQuery.data]);

  return (
    <Stack className="page-stack dashboard-home-page" gap="5">
      <section className="dashboard-home-hero glass-card" aria-label="Dashboard overview">
        <div className="dashboard-home-hero__main">
          <Section
            className="dashboard-page-header dashboard-home-page__header"
            eyebrow={`Welcome back, ${clinicianName}`}
            title="Dashboard"
            subtitle="Your clinical workspace for today’s safety signals, follow-up decisions, and schedule context."
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
            <h3 className="dashboard-home-hero__aside-title">
              {summaryQuery.data?.openAlertsCount
                ? 'Safety review and follow-up need attention.'
                : 'The care workspace is stable right now.'}
            </h3>
            <p className="dashboard-home-hero__aside-copy">
              {summaryQuery.data?.openAlertsCount
                ? 'Start with the priority queue, then confirm today’s schedule and communication follow-up.'
                : 'Use the summary cards to scan the day quickly, then move into follow-up tasks and communication review.'}
            </p>
            <div className="dashboard-home-hero__facts" role="list" aria-label="Dashboard focus facts">
              {heroFacts.map((fact) => (
                <div key={fact.key} className="dashboard-home-hero__fact" role="listitem">
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
            <h2 className="dashboard-home-summary-shell__title">Today&apos;s overview</h2>
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

          <div className="dashboard-home-layout__secondary">
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
