import { useMemo, type ReactNode } from 'react';
import { useQueries } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';
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
import { DashboardV2Button } from '../dashboard-v2/primitives/Button';
import { DashboardV2Surface } from '../dashboard-v2/primitives/Surface';
import { DashboardV2Heading, DashboardV2Text } from '../dashboard-v2/primitives/Text';
import '../dashboard-v2/modules/patients/patients.css';

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
  children: ReactNode;
}): JSX.Element {
  return (
    <article
      className="v2-patient-compare__domain-card"
      aria-labelledby={titleId}
      data-testid={testId}
    >
      <header className="v2-patient-compare__domain-card-header">
        <DashboardV2Heading as="h3" id={titleId} className="v2-patient-compare__domain-card-title">
          {patientName}
        </DashboardV2Heading>
        {action ? <div className="v2-patient-compare__domain-card-actions">{action}</div> : null}
      </header>
      {children}
    </article>
  );
}

function CompareNotice({
  tone,
  title,
  children,
}: {
  tone: 'info' | 'warning';
  title: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <DashboardV2Surface className={`v2-patient-compare__notice v2-patient-compare__notice--${tone}`}>
      <DashboardV2Text tone="strong">{title}</DashboardV2Text>
      <DashboardV2Text tone="muted">{children}</DashboardV2Text>
    </DashboardV2Surface>
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
    <div className="v2-patient-compare" data-testid="v2-patient-compare-route">
      <DashboardV2Surface className="v2-patient-compare__hero" tone="muted">
        <div className="v2-patient-compare__hero-copy">
          <DashboardV2Text tone="label">Care roster comparison</DashboardV2Text>
          <DashboardV2Heading as="h1">Compare patients</DashboardV2Heading>
          <DashboardV2Text tone="muted">
            Review 2 or 3 current patients side by side using current roster signals before choosing the next deeper follow-up.
          </DashboardV2Text>
        </div>
        <DashboardV2Button
          tone="secondary"
          size="sm"
          leadingIcon={<ArrowLeft size={15} />}
          onPress={handleBackToPatients}
        >
          Back to Patients
        </DashboardV2Button>
      </DashboardV2Surface>

      {patientsQuery.error && allPatients.length === 0 ? (
        <DashboardV2Surface className="v2-patient-compare__empty" tone="critical" role="status">
          <DashboardV2Heading as="h2">Patient compare is unavailable right now</DashboardV2Heading>
          <DashboardV2Text tone="muted">
            The compare view needs the current roster before it can line up patients side by side.
          </DashboardV2Text>
          <DashboardV2Button tone="secondary" onPress={() => void patientsQuery.refetch()}>
            Retry
          </DashboardV2Button>
        </DashboardV2Surface>
      ) : null}

      {isLoadingInitialPatients ? (
        <DashboardV2Surface className="v2-patient-compare__loading-card">
          <DashboardV2Heading as="h2">Preparing compare view</DashboardV2Heading>
          <div className="v2-patient-compare__skeleton" />
          <div className="v2-patient-compare__skeleton" />
          <div className="v2-patient-compare__skeleton" />
        </DashboardV2Surface>
      ) : null}

      {!isLoadingInitialPatients && hasInvalidCompareState ? (
        <DashboardV2Surface className="v2-patient-compare__empty" role="status">
          <DashboardV2Heading as="h2">Compare needs 2–3 current patients</DashboardV2Heading>
          <DashboardV2Text tone="muted">
            Choose 2 or 3 current patients from the roster to compare alerts, recent pain snapshot, adherence or recent activity, and current communication signals side by side.
          </DashboardV2Text>
          <DashboardV2Button tone="secondary" onPress={handleBackToPatients}>
            Return to Patients
          </DashboardV2Button>
        </DashboardV2Surface>
      ) : null}

      {!isLoadingInitialPatients &&
      !patientsQuery.error &&
      !hasInvalidCompareState &&
      comparePatients.length >= 2 ? (
        <>
          {hasOverflowNotice ? (
            <CompareNotice tone="info" title="Compare mode is showing the first 3 current patients from this request.">
              Keep compare focused to 2 or 3 patients at a time.
            </CompareNotice>
          ) : null}

          {hasUnavailableNotice ? (
            <CompareNotice tone="warning" title="Some requested patients are no longer available in the current roster.">
              Compare mode omitted unavailable patients and kept the remaining current patients in their first-seen order.
            </CompareNotice>
          ) : null}

          <DashboardV2Surface className="v2-patient-compare__selection-card">
            <div className="v2-patient-compare__section-header">
              <DashboardV2Heading as="h2">Selected patients</DashboardV2Heading>
              <span className="v2-patient-compare__selection-count" aria-live="polite">
                {comparePatients.length} selected
              </span>
            </div>
            <div
              className="v2-patient-compare__chips"
              role="group"
              aria-label="Selected patients for compare"
            >
              {comparePatients.map((patient) => {
                const patientName = getComparePatientName(patient);
                return (
                  <button
                    key={patient.id}
                    type="button"
                    className="v2-patient-compare__chip"
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
          </DashboardV2Surface>

          <section className="v2-patient-compare__summary-grid" aria-label="Patient compare order">
            {comparePatients.map((patient) => {
              const worklistItem = worklistByPatientId.get(patient.id) ?? null;
              const patientName = getComparePatientName(patient);
              const supportLine = getComparePatientSupportLine(patient, worklistItem);

              return (
                <article
                  key={patient.id}
                  className="v2-patient-compare__summary-card"
                  data-testid={`patient-compare-summary-${patient.id}`}
                >
                  <div className="v2-patient-compare__summary-copy">
                    <DashboardV2Heading as="h3">{patientName}</DashboardV2Heading>
                    <DashboardV2Text tone="muted">{supportLine}</DashboardV2Text>
                  </div>
                  <DashboardV2Button
                    tone="row"
                    size="sm"
                    trailingIcon={<ArrowUpRight size={14} />}
                    onPress={() => openPatientDetail(patient.id)}
                  >
                    Open review
                  </DashboardV2Button>
                </article>
              );
            })}
          </section>

          <DashboardV2Surface className="v2-patient-compare__section">
            <DashboardV2Heading as="h2">Alerts</DashboardV2Heading>
            <DashboardV2Text tone="muted" className="v2-patient-compare__section-intro">
              Compare current open alert counts and the review context already surfaced in the roster.
            </DashboardV2Text>
            <div className="v2-patient-compare__section-grid">
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
                        <DashboardV2Button
                          tone="ghost"
                          size="sm"
                          onPress={() => openAlerts(patient.id)}
                        >
                          Open alerts
                        </DashboardV2Button>
                      ) : null
                    }
                  >
                    <dl className="v2-patient-compare__metric-list">
                      <div className="v2-patient-compare__metric">
                        <dt>Open alerts</dt>
                        <dd>{String(alertCount)}</dd>
                      </div>
                      <div className="v2-patient-compare__metric">
                        <dt>Current review context</dt>
                        <dd>{getCompareAlertContext(patient, worklistItem)}</dd>
                      </div>
                    </dl>
                  </ComparePatientDomainCard>
                );
              })}
            </div>
          </DashboardV2Surface>

          <DashboardV2Surface className="v2-patient-compare__section">
            <DashboardV2Heading as="h2">Pain / recent trend</DashboardV2Heading>
            <DashboardV2Text tone="muted" className="v2-patient-compare__section-intro">
              Start with the most recent grounded pain snapshot, then add current trend context when recent check-ins are available.
            </DashboardV2Text>
            <div className="v2-patient-compare__section-grid">
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
                    <dl className="v2-patient-compare__metric-list">
                      <div className="v2-patient-compare__metric">
                        <dt>Recent pain snapshot</dt>
                        <dd>{formatPainValue(painSnapshot)}</dd>
                      </div>
                      <div className="v2-patient-compare__metric">
                        <dt>Avg pain (7d)</dt>
                        <dd>
                          {averagePain7d !== null
                            ? formatPainValue(averagePain7d)
                            : trendState?.isLoading
                              ? 'Loading…'
                              : '—'}
                        </dd>
                      </div>
                      <div className="v2-patient-compare__metric">
                        <dt>Recent activity</dt>
                        <dd>{recentActivityLabel}</dd>
                      </div>
                    </dl>
                    <p className="v2-patient-compare__metric-note">
                      {formatRecentActivitySupport(recentActivityLabel, trendState?.isLoading === true)}
                    </p>
                  </ComparePatientDomainCard>
                );
              })}
            </div>
          </DashboardV2Surface>

          <DashboardV2Surface className="v2-patient-compare__section">
            <DashboardV2Heading as="h2">Adherence / recent activity</DashboardV2Heading>
            <DashboardV2Text tone="muted" className="v2-patient-compare__section-intro">
              Compare current adherence signals and recent activity context without inferring a broader trend story where data is sparse.
            </DashboardV2Text>
            <div className="v2-patient-compare__section-grid">
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
                    <dl className="v2-patient-compare__metric-list">
                      <div className="v2-patient-compare__metric">
                        <dt>Recent adherence</dt>
                        <dd>
                          {adherenceValue !== null
                            ? formatPercent(adherenceValue)
                            : worklistQuery.isLoading
                              ? 'Loading…'
                              : '—'}
                        </dd>
                      </div>
                      <div className="v2-patient-compare__metric">
                        <dt>Missed recent check-ins</dt>
                        <dd>{missedCheckinLabel}</dd>
                      </div>
                      <div className="v2-patient-compare__metric">
                        <dt>Recent activity</dt>
                        <dd>{recentActivityLabel}</dd>
                      </div>
                    </dl>
                    <p className="v2-patient-compare__metric-note">
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
          </DashboardV2Surface>

          <DashboardV2Surface className="v2-patient-compare__section">
            <DashboardV2Heading as="h2">Communication</DashboardV2Heading>
            <DashboardV2Text tone="muted" className="v2-patient-compare__section-intro">
              Compare current dashboard communication signals only, including response-needed and follow-up cues already surfaced in the workspace.
            </DashboardV2Text>
            <div className="v2-patient-compare__section-grid">
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
                        <DashboardV2Button
                          tone="ghost"
                          size="sm"
                          onPress={() =>
                            openCommunication(patient.id, communicationSignals.needsResponse)
                          }
                        >
                          Open communication
                        </DashboardV2Button>
                      ) : null
                    }
                  >
                    <dl className="v2-patient-compare__metric-list">
                      <div className="v2-patient-compare__metric">
                        <dt>Needs response</dt>
                        <dd>
                          {formatNeedsResponseLabel(
                            itemsCount,
                            communicationSignals?.needsResponse === true,
                            communicationQuery.isLoading,
                          )}
                        </dd>
                      </div>
                      <div className="v2-patient-compare__metric">
                        <dt>Recent communication activity</dt>
                        <dd>
                          {latestMessageAt
                            ? formatRelativeDate(latestMessageAt)
                            : communicationQuery.isLoading
                              ? 'Loading…'
                              : 'No current signal'}
                        </dd>
                      </div>
                      <div className="v2-patient-compare__metric">
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
                    <p className="v2-patient-compare__metric-note">
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
          </DashboardV2Surface>
        </>
      ) : null}
    </div>
  );
}
