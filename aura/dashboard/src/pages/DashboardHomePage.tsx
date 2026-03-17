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
    communicationQuery.isFetching;

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
        </aside>
      </div>
    </Stack>
  );
}
