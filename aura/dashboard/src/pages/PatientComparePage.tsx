import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertBanner } from '../components/ui/AlertBanner';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Section } from '../components/ui/Section';
import { Skeleton } from '../components/ui/Skeleton';
import { Stack } from '../components/ui/Stack';
import {
  clinicianQueryKeys,
  getPatientTrends,
  useClinicianWorklist,
  useDashboardCommunicationOverview,
  usePatients,
} from '../services/clinicianApi';
import { formatRelativeDate } from '../utils/date';
import { formatPainValue, formatPercent } from '../utils/format';
import {
  getCompareAdherenceValue,
  getCompareAlertContext,
  getCompareAlertCount,
  getComparePainSnapshot,
  getComparePatientName,
  getComparePatientSupportLine,
  getCompareRecentActivityLabel,
  getCommunicationPreviewText,
  groupCommunicationSignalsByPatient,
  hasAlertCompareAction,
  hasCommunicationCompareAction,
  resolveComparePatientSelection,
} from '../utils/patientCompare';
import {
  deriveTrendSummary,
  normalizeTrendPoints,
  trendPointHasAnyData,
  type TrendSummaryMetrics,
} from '../utils/trends';

interface TrendCompareState {
  isLoading: boolean;
  summary: TrendSummaryMetrics | null;
}

function buildCompareSearch(patientIds: readonly string[]): URLSearchParams {
  const params = new URLSearchParams();
  patientIds.forEach((patientId) => {
    params.append('patient', patientId);
  });
  return params;
}

function formatNeedsResponseLabel(
  itemsCount: number,
  needsResponse: boolean,
  isLoading: boolean,
): string {
  if (itemsCount === 0) {
    return isLoading ? 'Loading…' : 'No current signal';
  }

  return needsResponse ? 'Present' : 'Not surfaced';
}

function formatFollowUpSignalLabel(
  itemsCount: number,
  followUpSignal: boolean,
  isLoading: boolean,
): string {
  if (itemsCount === 0) {
    return isLoading ? 'Loading…' : 'No current signal';
  }

  return followUpSignal ? 'Present' : 'Not surfaced';
}

function formatRecentActivitySupport(
  recentActivityLabel: string,
  isTrendLoading: boolean,
): string {
  if (isTrendLoading) {
    return 'Enhancing with current trend data from recent check-ins.';
  }

  if (recentActivityLabel === 'No recent activity') {
    return 'No recent check-in activity is surfaced in this compare view.';
  }

  return 'Shown from the most recent current dashboard check-in context.';
}

function ComparePatientDomainCard({
  titleId,
  patientName,
  action,
  testId,
  children,
}: {
  titleId: string;
  patientName: string;
  action?: JSX.Element | null;
  testId?: string;
  children: JSX.Element | JSX.Element[];
}): JSX.Element {
  return (
    <article
      className="patient-compare-domain-card"
      aria-labelledby={titleId}
      data-testid={testId}
    >
      <header className="patient-compare-domain-card__header">
        <h3 id={titleId} className="patient-compare-domain-card__title">
          {patientName}
        </h3>
        {action ? <div className="patient-compare-domain-card__actions">{action}</div> : null}
      </header>
      {children}
    </article>
  );
}

export function PatientComparePage(): JSX.Element {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const patientsQuery = usePatients();
  const worklistQuery = useClinicianWorklist();
  const communicationQuery = useDashboardCommunicationOverview(100);

  const allPatients = useMemo(() => patientsQuery.data ?? [], [patientsQuery.data]);
  const compareSelection = useMemo(
    () => resolveComparePatientSelection(searchParams.getAll('patient'), allPatients),
    [allPatients, searchParams],
  );
  const comparePatientIds = compareSelection.validIds;
  const comparePatients = compareSelection.validPatients;

  const trendQueries = useQueries({
    queries: comparePatientIds.map((patientId) => ({
      queryKey: clinicianQueryKeys.patientTrends(patientId, 14),
      queryFn: () => getPatientTrends(patientId, 14),
      staleTime: 7_000,
      refetchOnWindowFocus: false,
      retry: false,
    })),
  });

  const worklistByPatientId = useMemo(() => {
    return new Map(
      (worklistQuery.data?.items ?? []).map((item) => [item.patientId.trim(), item] as const),
    );
  }, [worklistQuery.data?.items]);

  const communicationByPatientId = useMemo(
    () => groupCommunicationSignalsByPatient(communicationQuery.data?.items ?? []),
    [communicationQuery.data?.items],
  );

  const trendStateByPatientId = useMemo(() => {
    const next = new Map<string, TrendCompareState>();

    comparePatientIds.forEach((patientId, index) => {
      const query = trendQueries[index];
      const rawPoints = query?.data ?? [];
      const normalizedPoints = normalizeTrendPoints(rawPoints, 14);
      const hasTrendData = normalizedPoints.some(trendPointHasAnyData);

      next.set(patientId, {
        isLoading: Boolean(query?.isLoading && rawPoints.length === 0),
        summary: hasTrendData ? deriveTrendSummary(normalizedPoints) : null,
      });
    });

    return next;
  }, [comparePatientIds, trendQueries]);

  const isLoadingInitialPatients = patientsQuery.isLoading && allPatients.length === 0;
  const hasInvalidCompareState =
    !isLoadingInitialPatients && !patientsQuery.error && comparePatients.length < 2;
  const hasOverflowNotice = compareSelection.overflowed;
  const hasUnavailableNotice = compareSelection.unavailableCount > 0;

  function handleBackToPatients(): void {
    navigate('/patients');
  }

  function handleRemovePatient(patientId: string): void {
    const nextPatientIds = comparePatientIds.filter((value) => value !== patientId);
    setSearchParams(buildCompareSearch(nextPatientIds));
  }

  function openPatientDetail(patientId: string): void {
    navigate(`/patients/${encodeURIComponent(patientId)}`);
  }

  function openAlerts(patientId: string): void {
    navigate(`/alerts?patientId=${encodeURIComponent(patientId)}`);
  }

  function openCommunication(patientId: string, preferNeedsResponse: boolean): void {
    const params = new URLSearchParams();
    params.set('patientId', patientId);
    if (preferNeedsResponse) {
      params.set('view', 'needs-response');
    }

    navigate(`/communication?${params.toString()}`);
  }

  return (
    <Stack className="page-stack patient-compare-page" gap="5">
      <Section
        className="dashboard-page-header patient-compare-page__header"
        eyebrow="Small-set comparison"
        title="Compare patients"
        subtitle="Review 2 or 3 current patients side by side using current dashboard signals before choosing the next deeper follow-up."
        actions={
          <Button variant="secondary" onClick={handleBackToPatients}>
            Back to Patients
          </Button>
        }
      />

      {patientsQuery.error && allPatients.length === 0 ? (
        <EmptyState
          title="Patient compare is unavailable right now"
          description="The compare view needs the current roster before it can line up patients side by side."
          tone="warning"
          action={
            <Button variant="secondary" onClick={() => void patientsQuery.refetch()}>
              Retry
            </Button>
          }
        />
      ) : null}

      {isLoadingInitialPatients ? (
        <Card className="patient-compare-page__loading-card" title="Preparing compare view">
          <Stack gap="3">
            <Skeleton height={36} />
            <Skeleton height={88} />
            <Skeleton height={88} />
          </Stack>
        </Card>
      ) : null}

      {!isLoadingInitialPatients && hasInvalidCompareState ? (
        <EmptyState
          title="Compare needs 2–3 current patients"
          description="Choose 2 or 3 current patients from the roster to compare alerts, recent pain snapshot, adherence or recent activity, and current communication signals side by side."
          action={
            <Button variant="secondary" onClick={handleBackToPatients}>
              Return to Patients
            </Button>
          }
        />
      ) : null}

      {!isLoadingInitialPatients &&
      !patientsQuery.error &&
      !hasInvalidCompareState &&
      comparePatients.length >= 2 ? (
        <>
          {hasOverflowNotice ? (
            <AlertBanner variant="info" title="Compare mode is showing the first 3 current patients from this request.">
              Keep compare focused to 2 or 3 patients at a time.
            </AlertBanner>
          ) : null}

          {hasUnavailableNotice ? (
            <AlertBanner variant="warning" title="Some requested patients are no longer available in the current roster.">
              Compare mode omitted unavailable patients and kept the remaining current patients in their first-seen order.
            </AlertBanner>
          ) : null}

          <Card
            className="patient-compare-page__selection-card"
            title="Selected patients"
            action={
              <span
                className="patient-compare-page__selection-count"
                aria-live="polite"
              >
                {comparePatients.length} selected
              </span>
            }
          >
            <div
              className="patient-compare-page__chips"
              role="group"
              aria-label="Selected patients for compare"
            >
              {comparePatients.map((patient) => {
                const patientName = getComparePatientName(patient);
                return (
                  <button
                    key={patient.id}
                    type="button"
                    className="patient-compare-page__chip"
                    onClick={() => handleRemovePatient(patient.id)}
                    aria-label={`Remove ${patientName} from compare`}
                    data-testid={`patient-compare-chip-${patient.id}`}
                  >
                    <span>{patientName}</span>
                    <span aria-hidden="true">×</span>
                  </button>
                );
              })}
            </div>
          </Card>

          <section className="patient-compare-page__summary-grid" aria-label="Patient compare order">
            {comparePatients.map((patient) => {
              const worklistItem = worklistByPatientId.get(patient.id) ?? null;
              const patientName = getComparePatientName(patient);
              const supportLine = getComparePatientSupportLine(patient, worklistItem);

              return (
                <article
                  key={patient.id}
                  className="patient-compare-page__summary-card"
                  data-testid={`patient-compare-summary-${patient.id}`}
                >
                  <div className="patient-compare-page__summary-copy">
                    <h3 className="patient-compare-page__summary-title">{patientName}</h3>
                    <p className="patient-compare-page__summary-support">{supportLine}</p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => openPatientDetail(patient.id)}
                  >
                    Open review
                  </Button>
                </article>
              );
            })}
          </section>

          <Card
            className="patient-compare-page__section"
            title="Alerts"
          >
            <p className="patient-compare-page__section-intro">
              Compare current open alert counts and the review context already surfaced in the roster.
            </p>
            <div className="patient-compare-page__section-grid">
              {comparePatients.map((patient) => {
                const worklistItem = worklistByPatientId.get(patient.id) ?? null;
                const patientName = getComparePatientName(patient);
                const alertCount = getCompareAlertCount(patient, worklistItem);

                return (
                  <ComparePatientDomainCard
                    key={patient.id}
                    titleId={`patient-compare-alerts-${patient.id}`}
                    patientName={patientName}
                    testId={`patient-compare-alerts-${patient.id}`}
                    action={
                      hasAlertCompareAction(patient, worklistItem) ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openAlerts(patient.id)}
                        >
                          Open alerts
                        </Button>
                      ) : null
                    }
                  >
                    <dl className="patient-compare-page__metric-list">
                      <div className="patient-compare-page__metric">
                        <dt>Open alerts</dt>
                        <dd>{String(alertCount)}</dd>
                      </div>
                      <div className="patient-compare-page__metric">
                        <dt>Current review context</dt>
                        <dd>{getCompareAlertContext(patient, worklistItem)}</dd>
                      </div>
                    </dl>
                  </ComparePatientDomainCard>
                );
              })}
            </div>
          </Card>

          <Card
            className="patient-compare-page__section"
            title="Pain / recent trend"
          >
            <p className="patient-compare-page__section-intro">
              Start with the most recent grounded pain snapshot, then add current trend context when recent check-ins are available.
            </p>
            <div className="patient-compare-page__section-grid">
              {comparePatients.map((patient) => {
                const worklistItem = worklistByPatientId.get(patient.id) ?? null;
                const patientName = getComparePatientName(patient);
                const trendState = trendStateByPatientId.get(patient.id);
                const painSnapshot = getComparePainSnapshot(
                  patient,
                  worklistItem,
                  trendState?.summary,
                );
                const averagePain7d = trendState?.summary?.avgPain7d ?? null;
                const recentActivityLabel = getCompareRecentActivityLabel(
                  patient,
                  trendState?.summary,
                );

                return (
                  <ComparePatientDomainCard
                    key={patient.id}
                    titleId={`patient-compare-pain-${patient.id}`}
                    patientName={patientName}
                    testId={`patient-compare-pain-${patient.id}`}
                  >
                    <dl className="patient-compare-page__metric-list">
                      <div className="patient-compare-page__metric">
                        <dt>Recent pain snapshot</dt>
                        <dd>{formatPainValue(painSnapshot)}</dd>
                      </div>
                      <div className="patient-compare-page__metric">
                        <dt>Avg pain (7d)</dt>
                        <dd>
                          {averagePain7d !== null
                            ? formatPainValue(averagePain7d)
                            : trendState?.isLoading
                              ? 'Loading…'
                              : '—'}
                        </dd>
                      </div>
                      <div className="patient-compare-page__metric">
                        <dt>Recent activity</dt>
                        <dd>{recentActivityLabel}</dd>
                      </div>
                    </dl>
                    <p className="patient-compare-page__metric-note">
                      {formatRecentActivitySupport(recentActivityLabel, trendState?.isLoading === true)}
                    </p>
                  </ComparePatientDomainCard>
                );
              })}
            </div>
          </Card>

          <Card
            className="patient-compare-page__section"
            title="Adherence / recent activity"
          >
            <p className="patient-compare-page__section-intro">
              Compare current adherence signals and recent activity context without inferring a broader trend story where data is sparse.
            </p>
            <div className="patient-compare-page__section-grid">
              {comparePatients.map((patient) => {
                const worklistItem = worklistByPatientId.get(patient.id) ?? null;
                const patientName = getComparePatientName(patient);
                const trendState = trendStateByPatientId.get(patient.id);
                const adherenceValue = getCompareAdherenceValue(worklistItem, trendState?.summary);
                const recentActivityLabel = getCompareRecentActivityLabel(
                  patient,
                  trendState?.summary,
                );
                const missedCheckinLabel = worklistItem
                  ? worklistItem.missedCheckins.flag
                    ? `${worklistItem.missedCheckins.count} missed`
                    : 'Not surfaced'
                  : worklistQuery.isLoading
                    ? 'Loading…'
                    : 'No current signal';

                return (
                  <ComparePatientDomainCard
                    key={patient.id}
                    titleId={`patient-compare-adherence-${patient.id}`}
                    patientName={patientName}
                    testId={`patient-compare-adherence-${patient.id}`}
                  >
                    <dl className="patient-compare-page__metric-list">
                      <div className="patient-compare-page__metric">
                        <dt>Recent adherence</dt>
                        <dd>
                          {adherenceValue !== null
                            ? formatPercent(adherenceValue)
                            : worklistQuery.isLoading
                              ? 'Loading…'
                              : '—'}
                        </dd>
                      </div>
                      <div className="patient-compare-page__metric">
                        <dt>Missed recent check-ins</dt>
                        <dd>{missedCheckinLabel}</dd>
                      </div>
                      <div className="patient-compare-page__metric">
                        <dt>Recent activity</dt>
                        <dd>{recentActivityLabel}</dd>
                      </div>
                    </dl>
                    <p className="patient-compare-page__metric-note">
                      {adherenceValue !== null
                        ? 'Shown from current check-in and roster signals only.'
                        : worklistQuery.isLoading
                          ? 'Loading recent adherence context from the current worklist.'
                          : 'No recent adherence signal is surfaced in this compare view.'}
                    </p>
                  </ComparePatientDomainCard>
                );
              })}
            </div>
          </Card>

          <Card
            className="patient-compare-page__section"
            title="Communication"
          >
            <p className="patient-compare-page__section-intro">
              Compare current dashboard communication signals only, including response-needed and follow-up cues already surfaced in the workspace.
            </p>
            <div className="patient-compare-page__section-grid">
              {comparePatients.map((patient) => {
                const patientName = getComparePatientName(patient);
                const communicationSignals = communicationByPatientId[patient.id];
                const itemsCount = communicationSignals?.items.length ?? 0;
                const latestMessageAt = communicationSignals?.latestItem?.messageCreatedAt;

                return (
                  <ComparePatientDomainCard
                    key={patient.id}
                    titleId={`patient-compare-communication-${patient.id}`}
                    patientName={patientName}
                    testId={`patient-compare-communication-${patient.id}`}
                    action={
                      hasCommunicationCompareAction(communicationSignals) ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            openCommunication(patient.id, communicationSignals.needsResponse)
                          }
                        >
                          Open communication
                        </Button>
                      ) : null
                    }
                  >
                    <dl className="patient-compare-page__metric-list">
                      <div className="patient-compare-page__metric">
                        <dt>Needs response</dt>
                        <dd>
                          {formatNeedsResponseLabel(
                            itemsCount,
                            communicationSignals?.needsResponse === true,
                            communicationQuery.isLoading,
                          )}
                        </dd>
                      </div>
                      <div className="patient-compare-page__metric">
                        <dt>Recent communication activity</dt>
                        <dd>
                          {latestMessageAt
                            ? formatRelativeDate(latestMessageAt)
                            : communicationQuery.isLoading
                              ? 'Loading…'
                              : 'No current signal'}
                        </dd>
                      </div>
                      <div className="patient-compare-page__metric">
                        <dt>Follow-up signal</dt>
                        <dd>
                          {formatFollowUpSignalLabel(
                            itemsCount,
                            communicationSignals?.followUpSignal === true,
                            communicationQuery.isLoading,
                          )}
                        </dd>
                      </div>
                    </dl>
                    <p className="patient-compare-page__metric-note">
                      {itemsCount > 0
                        ? getCommunicationPreviewText(communicationSignals)
                        : communicationQuery.isLoading
                          ? 'Loading current dashboard communication signals.'
                          : 'No current dashboard communication signal is surfaced for this patient.'}
                    </p>
                  </ComparePatientDomainCard>
                );
              })}
            </div>
          </Card>
        </>
      ) : null}
    </Stack>
  );
}
