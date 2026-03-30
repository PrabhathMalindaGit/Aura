import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { PatientCardList } from '../components/patients/PatientCardList';
import { PatientsFiltersBar } from '../components/patients/PatientsFiltersBar';
import { PatientsTable } from '../components/patients/PatientsTable';
import { RetryButton } from '../components/system/RetryButton';
import { StatusPanel } from '../components/system/StatusPanel';
import { AlertBanner } from '../components/ui/AlertBanner';
import { Button } from '../components/ui/Button';
import { Section } from '../components/ui/Section';
import { Skeleton } from '../components/ui/Skeleton';
import { Stack } from '../components/ui/Stack';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useConnectionStatus } from '../services/connection';
import { usePatients } from '../services/clinicianApi';
import {
  clearWorkspaceState,
  hasWorkspaceState,
  normalizeWorkspaceSearch,
  readWorkspaceState,
  writeWorkspaceState,
} from '../services/workspaceState';
import { getSavedPatientsPreset } from '../services/clinicianWorkspacePreferences';
import { MEDIA_QUERIES } from '../styles/breakpoints';
import type { PatientSummary } from '../types/models';
import { asAppError } from '../utils/errors';
import { toErrorView } from '../utils/errorView';
import {
  buildPatientEntryReturnTo,
  createPatientEntryState,
} from '../utils/patientEntryContext';
import { MAX_COMPARE_PATIENTS } from '../utils/patientCompare';
import {
  applyPatientFilters,
  defaultPatientFilters,
  getPatientTriagePreset,
  getPatientDisplayName,
  hasOpenAlerts,
  isMissedCheckin,
  isRecentlyActive,
  matchesPatientTriagePreset,
  PATIENT_TRIAGE_PRESETS,
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

function buildCompareSearch(patientIds: readonly string[]): string {
  const params = new URLSearchParams();
  patientIds.forEach((patientId) => {
    params.append('patient', patientId);
  });

  return params.toString();
}

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
  const [comparePatientIds, setComparePatientIds] = useState<string[]>([]);
  const [filters, setFilters] = useState<PatientFilters>(() => {
    const hasSavedPatientsState = hasWorkspaceState(PATIENTS_WORKSPACE_PAGE);
    const restored = readWorkspaceState(
      PATIENTS_WORKSPACE_PAGE,
      defaultPatientFilters(),
      normalizePatientsWorkspaceState,
    );
    const savedPreset =
      !hasSavedPatientsState && !initialSearchValue
        ? getPatientTriagePreset(getSavedPatientsPreset())
        : null;
    const seededFilters = savedPreset
      ? {
          ...restored,
          ...savedPreset.filters,
        }
      : restored;
    savedFiltersRef.current = seededFilters;
    return initialSearchValue
      ? {
          ...seededFilters,
          search: initialSearchValue,
        }
      : seededFilters;
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
  const activeTriagePreset = useMemo(
    () =>
      PATIENT_TRIAGE_PRESETS.find((preset) => matchesPatientTriagePreset(filters, preset)) ?? null,
    [filters],
  );
  const comparePatients = useMemo(() => {
    const patientById = new Map(allPatients.map((patient) => [patient.id.trim(), patient] as const));

    return comparePatientIds
      .map((patientId) => patientById.get(patientId))
      .filter((patient): patient is PatientSummary => Boolean(patient));
  }, [allPatients, comparePatientIds]);
  const compareSelectionLimitReached = comparePatientIds.length >= MAX_COMPARE_PATIENTS;
  const comparePreviewPatients = comparePatients.slice(0, 3);
  const trimmedSearch = filters.search.trim();
  const filteredEmptyDescription = useMemo(() => {
    if (activeTriagePreset?.id === 'active-alerts') {
      return trimmedSearch
        ? `No patients with active alerts match this exact roster view. Search "${trimmedSearch}" further narrowed the current view.`
        : 'No patients with active alerts match this exact roster view.';
    }

    if (activeTriagePreset?.id === 'missed-checkins') {
      return trimmedSearch
        ? `No patients with missed recent check-ins match this exact roster view. Search "${trimmedSearch}" further narrowed the current view.`
        : 'No patients with missed recent check-ins match this exact roster view.';
    }

    if (activeTriagePreset?.id === 'recently-active') {
      return trimmedSearch
        ? `No patients were recently active in this exact roster view. Search "${trimmedSearch}" further narrowed the current view.`
        : 'No patients were recently active in this exact roster view.';
    }

    if (trimmedSearch) {
      return `Search "${trimmedSearch}" does not match any patient in this exact roster view. Broaden the current filters or try a different patient name or ID.`;
    }

    return 'This roster view is narrower than the patients currently available. Broaden the filters or search by a different patient name or ID.';
  }, [activeTriagePreset, trimmedSearch]);

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

  const toggleComparePatient = useCallback((patientId: string): void => {
    const normalizedPatientId = patientId.trim();
    if (!normalizedPatientId) {
      return;
    }

    setComparePatientIds((current) => {
      if (current.includes(normalizedPatientId)) {
        return current.filter((value) => value !== normalizedPatientId);
      }

      if (current.length >= MAX_COMPARE_PATIENTS) {
        return current;
      }

      return [...current, normalizedPatientId];
    });
  }, []);

  const clearComparePatients = useCallback((): void => {
    setComparePatientIds([]);
  }, []);

  const openCompareMode = useCallback((): void => {
    if (comparePatientIds.length < 2) {
      return;
    }

    const search = buildCompareSearch(comparePatientIds);
    navigate(`/patients/compare${search ? `?${search}` : ''}`);
  }, [comparePatientIds, navigate]);

  const persistPatientsState = useCallback((nextFilters: PatientFilters): void => {
    const normalized = normalizePatientsWorkspaceState(nextFilters);
    savedFiltersRef.current = normalized;
    writeWorkspaceState(PATIENTS_WORKSPACE_PAGE, normalized);
  }, []);

  const applyNonSearchFilters = useCallback(
    (
      update:
        | Partial<Omit<PatientFilters, 'search'>>
        | ((current: PatientFilters) => Partial<Omit<PatientFilters, 'search'>>),
    ): void => {
      setFilters((current) => {
        const patch = typeof update === 'function' ? update(current) : update;
        const next = {
          ...current,
          ...patch,
        };
        persistPatientsState(next);
        return next;
      });
    },
    [persistPatientsState],
  );

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

  useEffect(() => {
    if (patientsQuery.isLoading && allPatients.length === 0) {
      return;
    }

    const validPatientIds = new Set(
      allPatients.map((patient) => patient.id.trim()).filter((patientId) => patientId.length > 0),
    );

    setComparePatientIds((current) => {
      const next = current.filter((patientId) => validPatientIds.has(patientId));
      return next.length === current.length ? current : next;
    });
  }, [allPatients, patientsQuery.isLoading]);

  const rosterFooterStatusLine =
    rosterSummary.total === 0 ? 'No patients are currently in this roster.' : workspaceStatusLine;
  const rosterFooterNote =
    'Alert burden shows current open-alert count only. Pain level shows the latest reported score only.';
  const presetButtons = PATIENT_TRIAGE_PRESETS.map((preset) => {
    const isActive = activeTriagePreset?.id === preset.id;

    return (
      <Button
        key={preset.id}
        className={isActive ? 'patients-filters__preset patients-filters__preset--active' : 'patients-filters__preset'}
        variant={isActive ? 'secondary' : 'ghost'}
        size="sm"
        aria-pressed={isActive}
        onClick={() => {
          applyNonSearchFilters(preset.filters);
        }}
      >
        {preset.label}
      </Button>
    );
  });

  return (
    <Stack
      className="page-stack dashboard-page-shell dashboard-page-shell--roster patients-page patients-page--roster-phase4"
      gap="5"
    >
      <Section
        className="dashboard-page-header dashboard-page-header--roster patients-page-header"
        eyebrow="Care roster"
        title="Roster"
        subtitle="Find, scan, and open the right patient from the current care roster."
        actions={
          <Button
            variant="secondary"
            size="sm"
            disabled={patientsQuery.isFetching}
            onClick={() => {
              void patientsQuery.refetch();
            }}
          >
            {patientsQuery.isFetching ? 'Refreshing...' : 'Refresh'}
          </Button>
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

      <section className="roster-surface" aria-label="Roster workspace">
        <div className="roster-control-bar">
          <PatientsFiltersBar
            filters={filters}
            presets={presetButtons}
            onSearchChange={(search) => {
              searchPersistenceEnabledRef.current = true;
              setFilters((current) => ({ ...current, search }));
            }}
            onStatusChange={(status) => applyNonSearchFilters({ status })}
            onHasOpenAlertsOnlyChange={(hasOpenAlertsOnly) =>
              applyNonSearchFilters({ hasOpenAlertsOnly })
            }
            onMissedCheckinsOnlyChange={(missedCheckinsOnly) =>
              applyNonSearchFilters({ missedCheckinsOnly })
            }
            onRecentlyActiveChange={(recentlyActive) => applyNonSearchFilters({ recentlyActive })}
            onSortChange={(sort) => applyNonSearchFilters({ sort })}
            onReset={clearSavedPatientsState}
          />

          {comparePatients.length > 0 ? (
            <div
              className="patients-compare-tray patients-compare-tray--inline"
              role="group"
              aria-label="Patients selected for compare"
            >
              <div className="patients-compare-tray__summary" aria-live="polite">
                <span className="patients-compare-tray__count">{comparePatients.length} selected</span>
                <div className="patients-compare-tray__chips">
                  {comparePreviewPatients.map((patient) => (
                    <span key={patient.id} className="patients-compare-tray__chip">
                      {getPatientDisplayName(patient)}
                    </span>
                  ))}
                </div>
              </div>
              <div className="patients-compare-tray__actions">
                <Button variant="ghost" size="sm" onClick={clearComparePatients}>
                  Clear
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={openCompareMode}
                  disabled={comparePatients.length < 2}
                  aria-label={`Compare ${comparePatients.length} selected patient${
                    comparePatients.length === 1 ? '' : 's'
                  }`}
                >
                  Compare selected ({comparePatients.length})
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="roster-results">
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
              <p className="patients-empty-state__description">{filteredEmptyDescription}</p>
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
              selectedComparePatientIds={comparePatientIds}
              onToggleComparePatient={toggleComparePatient}
              compareSelectionLimitReached={compareSelectionLimitReached}
            />
          ) : (
            <PatientsTable
              patients={visiblePatients}
              onOpenPatient={openPatientFromRoster}
              selectedComparePatientIds={comparePatientIds}
              onToggleComparePatient={toggleComparePatient}
              compareSelectionLimitReached={compareSelectionLimitReached}
            />
          )}
        </div>

        <footer className="roster-footer" aria-live="polite">
          <p className="roster-footer__status">{rosterFooterStatusLine}</p>
          <div className="roster-footer__meta">
            {rosterSummary.total > 0 ? (
              <span className="roster-footer__meta-item">{workspaceSupportLine}</span>
            ) : null}
            <span className="roster-footer__meta-item">Updated {updatedAtLabel}</span>
            <span className="roster-footer__meta-item">{rosterFooterNote}</span>
          </div>
        </footer>
      </section>
    </Stack>
  );
}
