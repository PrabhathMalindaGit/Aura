import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
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
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useConnectionStatus } from '../services/connection';
import { usePatients } from '../services/clinicianApi';
import {
  clearWorkspaceState,
  normalizeWorkspaceSearch,
  readWorkspaceState,
  writeWorkspaceState,
} from '../services/workspaceState';
import { MEDIA_QUERIES } from '../styles/breakpoints';
import type { PatientSummary } from '../types/models';
import { asAppError } from '../utils/errors';
import { toErrorView } from '../utils/errorView';
import {
  buildPatientEntryReturnTo,
  createPatientEntryState,
} from '../utils/patientEntryContext';
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
const PATIENTS_WORKSPACE_PAGE = 'patients';
const PATIENT_STATUS_FILTERS = ['all', 'active', 'on_hold', 'discharged', 'inactive'] as const;
const RECENTLY_ACTIVE_FILTERS = ['all', '24h', '7d', '30d'] as const;
const PATIENT_SORT_OPTIONS = [
  'alerts-desc',
  'last-checkin-desc',
  'name-asc',
  'status-active-first',
] as const;

function normalizePatientsWorkspaceState(value: unknown): PatientFilters {
  const fallback = defaultPatientFilters();

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return fallback;
  }

  const candidate = value as Partial<PatientFilters>;

  return {
    search: normalizeWorkspaceSearch(candidate.search),
    status: PATIENT_STATUS_FILTERS.includes(candidate.status ?? 'all')
      ? (candidate.status as PatientFilters['status'])
      : fallback.status,
    hasOpenAlertsOnly: candidate.hasOpenAlertsOnly === true,
    missedCheckinsOnly: candidate.missedCheckinsOnly === true,
    recentlyActive: RECENTLY_ACTIVE_FILTERS.includes(candidate.recentlyActive ?? 'all')
      ? (candidate.recentlyActive as PatientFilters['recentlyActive'])
      : fallback.recentlyActive,
    sort: PATIENT_SORT_OPTIONS.includes(candidate.sort ?? 'alerts-desc')
      ? (candidate.sort as PatientFilters['sort'])
      : fallback.sort,
  };
}

function summarizePatients(patients: PatientSummary[]): {
  total: number;
  active: number;
  onHold: number;
  discharged: number;
  openAlerts: number;
  recentlyActive: number;
  needsReview: number;
} {
  const summary = {
    total: patients.length,
    active: 0,
    onHold: 0,
    discharged: 0,
    openAlerts: 0,
    recentlyActive: 0,
    needsReview: 0,
  };

  patients.forEach((patient) => {
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
}

function isEndpointMissing(error: unknown): boolean {
  const appError = asAppError(error);
  return appError.kind === 'HTTP' && appError.status === 404;
}

export function PatientsPage(): JSX.Element {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const patientsQuery = usePatients();
  const isMobileLayout = useMediaQuery(MEDIA_QUERIES.mdDown);
  const connection = useConnectionStatus();
  const initialSearchValue = useMemo(() => searchParams.get('search')?.trim() ?? '', [searchParams]);
  const savedFiltersRef = useRef<PatientFilters>(defaultPatientFilters());
  const liveFiltersRef = useRef<PatientFilters>(defaultPatientFilters());
  const searchPersistenceEnabledRef = useRef(false);
  const [filters, setFilters] = useState<PatientFilters>(() => {
    const restored = readWorkspaceState(
      PATIENTS_WORKSPACE_PAGE,
      defaultPatientFilters(),
      normalizePatientsWorkspaceState,
    );
    savedFiltersRef.current = restored;
    return initialSearchValue
      ? {
          ...restored,
          search: initialSearchValue,
        }
      : restored;
  });
  const debouncedPersistedSearch = useDebouncedValue(filters.search, 250);

  const allPatients = useMemo(() => patientsQuery.data ?? [], [patientsQuery.data]);
  const visiblePatients = useMemo(() => applyPatientFilters(allPatients, filters), [allPatients, filters]);
  const rosterSummary = useMemo(() => summarizePatients(allPatients), [allPatients]);
  const visibleSummary = useMemo(() => summarizePatients(visiblePatients), [visiblePatients]);

  const showInitialLoading = patientsQuery.isLoading && allPatients.length === 0;
  const endpointMissing = Boolean(patientsQuery.error) && isEndpointMissing(patientsQuery.error);
  const genericError = patientsQuery.error && !endpointMissing ? asAppError(patientsQuery.error) : null;
  const staleDataAvailable = allPatients.length > 0;
  const staleErrorBannerVisible = Boolean(genericError && staleDataAvailable);
  const blockingOfflineVisible = !connection.online && !staleDataAvailable && !patientsQuery.error;
  const errorView = genericError ? toErrorView(genericError) : null;
  const rosterViewLabel =
    visiblePatients.length === rosterSummary.total ? 'Full roster view' : 'Filtered roster view';
  const reviewBurdenLabel =
    visibleSummary.needsReview === 0
      ? 'No closer review signaled in this view'
      : `${visibleSummary.needsReview} ${
          visibleSummary.needsReview === 1 ? 'patient needs' : 'patients need'
        } closer review`;
  const workspaceStatusLine =
    visiblePatients.length === rosterSummary.total
      ? `Showing all ${rosterSummary.total} patients`
      : `Showing ${visiblePatients.length} of ${rosterSummary.total} patients`;
  const workspaceSupportLine =
    visibleSummary.needsReview > 0
      ? `${reviewBurdenLabel}${visibleSummary.openAlerts > 0 ? ` · ${visibleSummary.openAlerts} with active alerts` : ''}`
      : visibleSummary.recentlyActive > 0
        ? `${visibleSummary.recentlyActive} ${visibleSummary.recentlyActive === 1 ? 'patient checked in' : 'patients checked in'} during the last 7 days`
        : 'The current roster view is steady';
  const updatedAtLabel = connection.lastSuccessAt
    ? new Date(connection.lastSuccessAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '--';

  const retryPatients = useCallback((): void => {
    void patientsQuery.refetch();
  }, [patientsQuery]);

  const openPatientFromRoster = useCallback(
    (patientId: string): void => {
      const normalizedPatientId = patientId.trim();

      if (!normalizedPatientId) {
        return;
      }

      navigate(`/patients/${encodeURIComponent(normalizedPatientId)}`, {
        state: createPatientEntryState({
          patientId: normalizedPatientId,
          source: 'patients',
          subtype: 'roster',
          focus: 'roster',
          returnTo: buildPatientEntryReturnTo(location.pathname, location.search),
        }),
      });
    },
    [location.pathname, location.search, navigate],
  );

  const persistPatientsState = useCallback((nextFilters: PatientFilters): void => {
    const normalized = normalizePatientsWorkspaceState(nextFilters);
    savedFiltersRef.current = normalized;
    writeWorkspaceState(PATIENTS_WORKSPACE_PAGE, normalized);
  }, []);

  const clearSavedPatientsState = useCallback((): void => {
    const nextFilters = defaultPatientFilters();
    savedFiltersRef.current = nextFilters;
    searchPersistenceEnabledRef.current = false;
    clearWorkspaceState(PATIENTS_WORKSPACE_PAGE);
    setFilters(nextFilters);
  }, []);

  useEffect(() => {
    liveFiltersRef.current = filters;
  }, [filters]);

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

  useEffect(() => {
    if (!initialSearchValue) {
      return;
    }

    searchPersistenceEnabledRef.current = false;
    setFilters((current) =>
      current.search === initialSearchValue ? current : { ...current, search: initialSearchValue },
    );
  }, [initialSearchValue]);

  useEffect(() => {
    if (!searchPersistenceEnabledRef.current) {
      return;
    }

    persistPatientsState({
      ...liveFiltersRef.current,
      search: debouncedPersistedSearch,
    });
  }, [debouncedPersistedSearch, persistPatientsState]);

  return (
    <Stack className="page-stack patients-page" gap="5">
      <Section
        className="dashboard-page-header patients-page-header"
        eyebrow="Care roster"
        title="Patients"
        subtitle="Scan the broader care roster before opening a deeper patient review."
        meta={
          <span className="patients-page__meta" aria-live="polite">
            <span className="patients-page__meta-pill patients-page__meta-pill--count">
              {visiblePatients.length} in view
            </span>
            <span className="patients-page__meta-pill">
              {reviewBurdenLabel}
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
          <p className="patients-summary-strip__label">Roster in view</p>
          <p className="patients-summary-strip__value">{visiblePatients.length}</p>
          <p className="patients-summary-strip__hint">of {rosterSummary.total} total patients</p>
        </article>
        <article className="patients-summary-strip__item patients-summary-strip__item--active">
          <p className="patients-summary-strip__label">Active care</p>
          <p className="patients-summary-strip__value">{visibleSummary.active}</p>
          <p className="patients-summary-strip__hint">
            {visibleSummary.onHold} on hold · {visibleSummary.discharged} discharged
          </p>
        </article>
        <article className="patients-summary-strip__item patients-summary-strip__item--attention">
          <p className="patients-summary-strip__label">Needs review</p>
          <p className="patients-summary-strip__value">{visibleSummary.needsReview}</p>
          <p className="patients-summary-strip__hint">
            {visibleSummary.openAlerts} with active alerts in view
          </p>
        </article>
        <article className="patients-summary-strip__item patients-summary-strip__item--active">
          <p className="patients-summary-strip__label">Recently active</p>
          <p className="patients-summary-strip__value">{visibleSummary.recentlyActive}</p>
          <p className="patients-summary-strip__hint">Checked in during the last 7 days</p>
        </article>
      </section>

      <section className="patients-roster-note" aria-label="Roster workspace guidance">
        <div className="patients-roster-note__copy">
          <p className="patients-roster-note__eyebrow">Roster workspace</p>
          <p className="patients-roster-note__text">
            Use the roster to decide which patient needs deeper review next.
          </p>
        </div>
        <div className="patients-roster-note__facts" aria-live="polite">
          <span className="patients-roster-note__fact">{rosterViewLabel}</span>
          <span className="patients-roster-note__fact">{reviewBurdenLabel}</span>
        </div>
      </section>

      <Card
        className="patients-workspace-card"
        title={
          <span className="patients-card-title">
            Patients
            <span className="patients-card-title__meta">Broad review</span>
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
          <div className="patients-workspace-card__controls">
            <div className="patients-workspace-card__context">
              <p className="patients-workspace-card__status-line" aria-live="polite">
                {rosterViewLabel} · {workspaceStatusLine}
              </p>
              <p className="patients-workspace-card__support-line" aria-live="polite">
                {workspaceSupportLine}
              </p>
            </div>
            <p className="patients-queue-intro">
              Scan identity, recent activity, alert burden, and the next review step from one roster view.
            </p>
            <p className="patients-pain-legend" aria-label="Pain trend guide">
              Pain trend guide: <strong>7+ elevated</strong> · <strong>4-6.9 moderate</strong> ·{' '}
              <strong>under 4 lower</strong>
            </p>
            <PatientsFiltersBar
              filters={filters}
              onSearchChange={(search) => {
                searchPersistenceEnabledRef.current = true;
                setFilters((current) => ({ ...current, search }));
              }}
              onStatusChange={(status) =>
                setFilters((current) => {
                  const next = {
                    ...current,
                    status,
                    search: savedFiltersRef.current.search,
                  };
                  persistPatientsState(next);
                  return {
                    ...current,
                    status,
                  };
                })
              }
              onHasOpenAlertsOnlyChange={(hasOpenAlertsOnly) =>
                setFilters((current) => {
                  const next = {
                    ...current,
                    hasOpenAlertsOnly,
                    search: savedFiltersRef.current.search,
                  };
                  persistPatientsState(next);
                  return {
                    ...current,
                    hasOpenAlertsOnly,
                  };
                })
              }
              onMissedCheckinsOnlyChange={(missedCheckinsOnly) =>
                setFilters((current) => {
                  const next = {
                    ...current,
                    missedCheckinsOnly,
                    search: savedFiltersRef.current.search,
                  };
                  persistPatientsState(next);
                  return {
                    ...current,
                    missedCheckinsOnly,
                  };
                })
              }
              onRecentlyActiveChange={(recentlyActive) =>
                setFilters((current) => {
                  const next = {
                    ...current,
                    recentlyActive,
                    search: savedFiltersRef.current.search,
                  };
                  persistPatientsState(next);
                  return {
                    ...current,
                    recentlyActive,
                  };
                })
              }
              onSortChange={(sort) =>
                setFilters((current) => {
                  const next = {
                    ...current,
                    sort,
                    search: savedFiltersRef.current.search,
                  };
                  persistPatientsState(next);
                  return {
                    ...current,
                    sort,
                  };
                })
              }
              onReset={clearSavedPatientsState}
            />
          </div>

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
                <h3 className="patients-empty-state__title">No patient records yet</h3>
              </div>
              <p className="patients-empty-state__description">
                No patient records are available yet. This roster will populate as patient check-ins, alerts, and care activity begin to appear.
              </p>
              <p className="patients-empty-state__meta">Last updated {updatedAtLabel}</p>
            </div>
          ) : visiblePatients.length === 0 ? (
            <div className="patients-empty-state patients-empty-state--filtered" role="status" aria-live="polite">
              <div className="patients-empty-state__title-row">
                <span className="patients-empty-state__icon" aria-hidden="true">
                  ⌕
                </span>
                <h3 className="patients-empty-state__title">No patients match this view</h3>
              </div>
              <p className="patients-empty-state__description">
                This roster view is narrower than the patients currently available. Broaden the
                filters or search by a different patient name or ID.
              </p>
              <div className="patients-empty-state__actions">
                <Button
                  className="patients-empty-state__reset"
                  variant="secondary"
                  size="sm"
                  onClick={clearSavedPatientsState}
                >
                  Reset filters
                </Button>
              </div>
            </div>
          ) : isMobileLayout ? (
            <PatientCardList
              patients={visiblePatients}
              onOpenPatient={openPatientFromRoster}
            />
          ) : (
            <PatientsTable
              patients={visiblePatients}
              onOpenPatient={openPatientFromRoster}
            />
          )}
        </Stack>
      </Card>
    </Stack>
  );
}
