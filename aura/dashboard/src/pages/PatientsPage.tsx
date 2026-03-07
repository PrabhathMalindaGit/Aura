import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PatientCardList } from '../components/patients/PatientCardList';
import { PatientsFiltersBar } from '../components/patients/PatientsFiltersBar';
import { PatientsTable } from '../components/patients/PatientsTable';
import { RetryButton } from '../components/system/RetryButton';
import { StatusPanel } from '../components/system/StatusPanel';
import { AlertBanner } from '../components/ui/AlertBanner';
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
import { applyPatientFilters, defaultPatientFilters, type PatientFilters } from '../utils/patientFilters';

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

  const showInitialLoading = patientsQuery.isLoading && allPatients.length === 0;
  const endpointMissing = Boolean(patientsQuery.error) && isEndpointMissing(patientsQuery.error);
  const genericError = patientsQuery.error && !endpointMissing ? asAppError(patientsQuery.error) : null;
  const staleDataAvailable = allPatients.length > 0;
  const staleErrorBannerVisible = Boolean(genericError && staleDataAvailable);
  const blockingOfflineVisible = !connection.online && !staleDataAvailable && !patientsQuery.error;
  const errorView = genericError ? toErrorView(genericError) : null;

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
    <Stack className="page-stack" gap="6">
      <Section
        className="dashboard-page-header patients-page-header"
        eyebrow="Patient panel"
        title="Patients"
        subtitle="Sort and filter by risk, last check-in, and status."
        meta={`${visiblePatients.length} in view`}
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

      <Card title="Patients">
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
            <StatusPanel
              variant="empty"
              title="No patients found"
              description="Once check-ins or alerts exist, patients will appear here."
            />
          ) : visiblePatients.length === 0 ? (
            <StatusPanel
              variant="empty"
              title="No results"
              description="Try clearing filters or searching by patient ID."
            />
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
