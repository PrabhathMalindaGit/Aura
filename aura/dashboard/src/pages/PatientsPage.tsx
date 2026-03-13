import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PatientCardList } from '../components/patients/PatientCardList';
import { PatientsFiltersBar } from '../components/patients/PatientsFiltersBar';
import { PatientsTable } from '../components/patients/PatientsTable';
import { RetryButton } from '../components/system/RetryButton';
import { StatusPanel } from '../components/system/StatusPanel';
import { AlertBanner } from '../components/ui/AlertBanner';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Section } from '../components/ui/Section';
import { Skeleton } from '../components/ui/Skeleton';
import { Stack } from '../components/ui/Stack';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useConnectionStatus } from '../services/connection';
import { usePatients } from '../services/clinicianApi';
import { MEDIA_QUERIES } from '../styles/breakpoints';
import { asAppError } from '../utils/errors';
import { toErrorView } from '../utils/errorView';
import {
  applyPatientFilters,
  defaultPatientFilters,
  hasOpenAlerts,
  isMissedCheckin,
  isRecentlyActive,
  type PatientFilters,
} from '../utils/patientFilters';

const PATIENTS_ENDPOINT_HINT =
  'Add GET /clinician/patients returning { ok: true, patients: [...] }';
const RETRY_EVENT = 'aura:retry';

function isEndpointMissing(error: unknown): boolean {
  const appError = asAppError(error);
  return appError.kind === 'HTTP' && appError.status === 404;
}

export function PatientsPage(): JSX.Element {
  const navigate = useNavigate();
  const patientsQuery = usePatients();
  const isMobileLayout = useMediaQuery(MEDIA_QUERIES.mdDown);
  const connection = useConnectionStatus();

  const [filters, setFilters] = useState<PatientFilters>(defaultPatientFilters());

  const allPatients = useMemo(() => patientsQuery.data ?? [], [patientsQuery.data]);
  const visiblePatients = useMemo(() => applyPatientFilters(allPatients, filters), [allPatients, filters]);
  const rosterSummary = useMemo(() => {
    const summary = {
      total: allPatients.length,
      active: 0,
      onHold: 0,
      discharged: 0,
      openAlerts: 0,
      recentlyActive: 0,
      needsReview: 0,
    };

    allPatients.forEach((patient) => {
      if (patient.status === 'active') {
        summary.active += 1;
      } else if (patient.status === 'on_hold') {
        summary.onHold += 1;
      } else if (patient.status === 'discharged') {
        summary.discharged += 1;
      }

      if ((patient.openAlertCount ?? 0) > 0) {
        summary.openAlerts += 1;
      }

      if (isRecentlyActive(patient, '7d')) {
        summary.recentlyActive += 1;
      }

      if (hasOpenAlerts(patient) || isMissedCheckin(patient)) {
        summary.needsReview += 1;
      }
    });

    return summary;
  }, [allPatients]);

  const showInitialLoading = patientsQuery.isLoading && allPatients.length === 0;
  const endpointMissing = Boolean(patientsQuery.error) && isEndpointMissing(patientsQuery.error);
  const genericError = patientsQuery.error && !endpointMissing ? asAppError(patientsQuery.error) : null;
  const staleDataAvailable = allPatients.length > 0;
  const staleErrorBannerVisible = Boolean(genericError && staleDataAvailable);
  const blockingOfflineVisible = !connection.online && !staleDataAvailable && !patientsQuery.error;
  const errorView = genericError ? toErrorView(genericError) : null;
  const updatedAtLabel = connection.lastSuccessAt
    ? new Date(connection.lastSuccessAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '--';

  const retryPatients = useCallback((): void => {
    void patientsQuery.refetch();
  }, [patientsQuery]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const onRetry = (): void => {
      retryPatients();
    };

    window.addEventListener(RETRY_EVENT, onRetry);
    return () => window.removeEventListener(RETRY_EVENT, onRetry);
  }, [retryPatients]);

  return (
    <Stack className="page-stack patients-page" gap="5">
      <Section
        className="dashboard-page-header patients-page-header"
        eyebrow="Care roster"
        title="Patients"
        subtitle="Monitor the broader care roster, recent activity, and alert burden before opening deeper patient review."
        meta={
          <span className="patients-page__meta" aria-live="polite">
            <span className="patients-page__meta-pill patients-page__meta-pill--count">
              {visiblePatients.length} in view
            </span>
            <span className="patients-page__meta-pill">
              {rosterSummary.needsReview} may need closer review
            </span>
            <span className="patients-page__meta-pill patients-page__meta-pill--updated">Updated {updatedAtLabel}</span>
          </span>
        }
      />

      {staleErrorBannerVisible ? (
        <AlertBanner
          variant="warning"
          title="Service temporarily unavailable"
          action={<RetryButton onRetry={retryPatients} loading={patientsQuery.isFetching} />}
        >
          Showing last known patients list from{' '}
          {connection.lastSuccessAt
            ? new Date(connection.lastSuccessAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })
            : '--'}
        </AlertBanner>
      ) : null}

      <section className="patients-summary-strip" aria-label="Patient roster summary">
        <article className="patients-summary-strip__item patients-summary-strip__item--total">
          <p className="patients-summary-strip__label">Total roster</p>
          <p className="patients-summary-strip__value">{rosterSummary.total}</p>
          <p className="patients-summary-strip__hint">{visiblePatients.length} currently in view</p>
        </article>
        <article className="patients-summary-strip__item patients-summary-strip__item--active">
          <p className="patients-summary-strip__label">Active care</p>
          <p className="patients-summary-strip__value">{rosterSummary.active}</p>
          <p className="patients-summary-strip__hint">Patients currently in active rehab</p>
        </article>
        <article className="patients-summary-strip__item patients-summary-strip__item--active">
          <p className="patients-summary-strip__label">Recently active</p>
          <p className="patients-summary-strip__value">{rosterSummary.recentlyActive}</p>
          <p className="patients-summary-strip__hint">Checked in during the last 7 days</p>
        </article>
        <article className="patients-summary-strip__item patients-summary-strip__item--on-hold">
          <p className="patients-summary-strip__label">On hold</p>
          <p className="patients-summary-strip__value">{rosterSummary.onHold}</p>
          <p className="patients-summary-strip__hint">
            {rosterSummary.discharged} discharged from active care
          </p>
        </article>
        <article className="patients-summary-strip__item patients-summary-strip__item--attention">
          <p className="patients-summary-strip__label">Needs review</p>
          <p className="patients-summary-strip__value">{rosterSummary.needsReview}</p>
          <p className="patients-summary-strip__hint">
            {rosterSummary.openAlerts} with active alerts
          </p>
        </article>
      </section>

      <Card
        className="patients-workspace-card"
        title={
          <span className="patients-card-title">
            Patients
            <span className="patients-card-title__meta">Roster workspace</span>
          </span>
        }
        action={
          <Button
            className="patients-workspace-card__refresh"
            variant="secondary"
            onClick={() => {
              void patientsQuery.refetch();
            }}
            disabled={patientsQuery.isFetching}
          >
            {patientsQuery.isFetching ? 'Refreshing...' : 'Refresh'}
          </Button>
        }
      >
        <Stack gap="4">
          <PatientsFiltersBar
            filters={filters}
            onSearchChange={(search) => setFilters((current) => ({ ...current, search }))}
            onStatusChange={(status) => setFilters((current) => ({ ...current, status }))}
            onHasOpenAlertsOnlyChange={(hasOpenAlertsOnly) =>
              setFilters((current) => ({ ...current, hasOpenAlertsOnly }))
            }
            onMissedCheckinsOnlyChange={(missedCheckinsOnly) =>
              setFilters((current) => ({ ...current, missedCheckinsOnly }))
            }
            onRecentlyActiveChange={(recentlyActive) =>
              setFilters((current) => ({ ...current, recentlyActive }))
            }
            onSortChange={(sort) => setFilters((current) => ({ ...current, sort }))}
            onReset={() => setFilters(defaultPatientFilters())}
          />

          {showInitialLoading ? (
            <div className="patients-skeleton" aria-label="Patients loading placeholder">
              <Skeleton height={64} />
              <Skeleton height={64} />
              <Skeleton height={64} />
              <Skeleton height={64} />
            </div>
          ) : endpointMissing ? (
            <StatusPanel
              variant="info"
              title="Patients list not available yet"
              description="The backend endpoint /clinician/patients is not implemented."
              actions={<RetryButton onRetry={retryPatients} loading={patientsQuery.isFetching} />}
              hint={
                <details className="status-panel__details">
                  <summary>Show developer hint</summary>
                  <p className="muted-text">{PATIENTS_ENDPOINT_HINT}</p>
                </details>
              }
              details={{
                endpoint: '/clinician/patients',
                status: 404,
                timestamp: connection.lastErrorAt
                  ? new Date(connection.lastErrorAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })
                  : undefined,
              }}
            />
          ) : genericError && !staleDataAvailable && errorView ? (
            <StatusPanel
              variant={errorView.variant === 'warning' ? 'error' : errorView.variant}
              title="Unable to load patients"
              description={errorView.description}
              actions={<RetryButton onRetry={retryPatients} loading={patientsQuery.isFetching} />}
              details={{
                endpoint: connection.lastEndpoint,
                status: connection.lastHttpStatus,
                timestamp: connection.lastErrorAt
                  ? new Date(connection.lastErrorAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })
                  : undefined,
              }}
            />
          ) : blockingOfflineVisible ? (
            <StatusPanel
              variant="info"
              title="Offline"
              description="No cached patient list is available yet. Reconnect and retry."
              actions={<RetryButton onRetry={retryPatients} loading={patientsQuery.isFetching} />}
            />
          ) : allPatients.length === 0 ? (
            <div className="patients-empty-state patients-empty-state--clear" role="status" aria-live="polite">
              <div className="patients-empty-state__title-row">
                <span className="patients-empty-state__icon" aria-hidden="true">
                  ✓
                </span>
                <h3 className="patients-empty-state__title">Roster clear</h3>
              </div>
              <p className="patients-empty-state__description">
                No patient records are available yet. This roster fills in as check-ins, alerts, and care activity are recorded.
              </p>
              <p className="patients-empty-state__meta">Last updated {updatedAtLabel}</p>
            </div>
          ) : visiblePatients.length === 0 ? (
            <div className="patients-empty-state patients-empty-state--filtered" role="status" aria-live="polite">
              <div className="patients-empty-state__title-row">
                <span className="patients-empty-state__icon" aria-hidden="true">
                  ⌕
                </span>
                <h3 className="patients-empty-state__title">No matching patients</h3>
              </div>
              <p className="patients-empty-state__description">
                This roster view is narrower than the current patient set. Adjust a filter or search by a different name or patient ID.
              </p>
              <div className="patients-empty-state__actions">
                <Button
                  className="patients-empty-state__reset"
                  variant="secondary"
                  size="sm"
                  onClick={() => setFilters(defaultPatientFilters())}
                >
                  Reset filters
                </Button>
              </div>
            </div>
          ) : isMobileLayout ? (
            <PatientCardList
              patients={visiblePatients}
              onOpenPatient={(patientId) => navigate(`/patients/${patientId}`)}
            />
          ) : (
            <PatientsTable
              patients={visiblePatients}
              onOpenPatient={(patientId) => navigate(`/patients/${patientId}`)}
            />
          )}
        </Stack>
      </Card>
    </Stack>
  );
}
