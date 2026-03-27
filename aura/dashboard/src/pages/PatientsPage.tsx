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
  const workspaceHeaderSupport =
    workspaceStatusLine === workspaceSupportLine
      ? workspaceSupportLine
      : `${workspaceStatusLine}. ${workspaceSupportLine}.`;
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
  const summaryLeadTitle =
    visibleSummary.needsReview > 0
      ? 'Review burden is concentrated in this roster'
      : visibleSummary.recentlyActive > 0
        ? 'Roster is active and stable'
        : visiblePatients.length > 0
          ? 'Roster is quiet and in view'
          : 'Roster needs a broader view';
  const summaryLeadNarrative =
    visibleSummary.needsReview > 0
      ? `${reviewBurdenLabel}. Open the highest-burden patients first, then use compare only when the roster truly needs side-by-side review.`
      : visibleSummary.recentlyActive > 0
        ? `${visibleSummary.recentlyActive} ${
            visibleSummary.recentlyActive === 1 ? 'patient is' : 'patients are'
          } recently active in this view, with quieter review burden across the rest of the roster.`
        : 'No immediate review burden is dominating this roster view right now. Keep the cohort visible and open individual reviews as needed.';
  const rosterMixScale = Math.max(
    visibleSummary.active,
    visibleSummary.onHold,
    visibleSummary.discharged,
    visibleSummary.needsReview,
    1,
  );
  const rosterMixBars = [
    {
      key: 'active',
      label: 'Active care',
      count: visibleSummary.active,
      width: `${(visibleSummary.active / rosterMixScale) * 100}%`,
    },
    {
      key: 'review',
      label: 'Needs review',
      count: visibleSummary.needsReview,
      width: `${(visibleSummary.needsReview / rosterMixScale) * 100}%`,
    },
    {
      key: 'hold',
      label: 'On hold',
      count: visibleSummary.onHold,
      width: `${(visibleSummary.onHold / rosterMixScale) * 100}%`,
    },
    {
      key: 'discharged',
      label: 'Discharged',
      count: visibleSummary.discharged,
      width: `${(visibleSummary.discharged / rosterMixScale) * 100}%`,
    },
  ] as const;
  const comparePatients = useMemo(() => {
    const patientById = new Map(allPatients.map((patient) => [patient.id.trim(), patient] as const));

    return comparePatientIds
      .map((patientId) => patientById.get(patientId))
      .filter((patient): patient is PatientSummary => Boolean(patient));
  }, [allPatients, comparePatientIds]);
  const compareSelectionLimitReached = comparePatientIds.length >= MAX_COMPARE_PATIENTS;
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

  return (
    <Stack className="page-stack dashboard-page-shell dashboard-page-shell--roster patients-page" gap="5">
      <Section
        className="dashboard-page-header dashboard-page-header--roster patients-page-header"
        eyebrow="Care roster"
        title="Patients"
        subtitle="Scan the broader care roster before opening a deeper patient review."
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

      <section className="patients-summary-strip" aria-label="Patient roster summary">
        <article className="patients-summary-strip__lead">
          <div className="patients-summary-strip__lead-copy">
            <p className="patients-summary-strip__eyebrow">Roster console</p>
            <div className="patients-summary-strip__headline">
              <p className="patients-summary-strip__lead-value">{visiblePatients.length}</p>
              <div className="patients-summary-strip__headline-copy">
                <p className="patients-summary-strip__headline-title">{summaryLeadTitle}</p>
                <p className="patients-summary-strip__hint">{summaryLeadNarrative}</p>
              </div>
            </div>
            <div className="patients-summary-strip__lead-pills" aria-live="polite">
              <span className="patients-summary-strip__lead-pill">{rosterViewLabel}</span>
              <span className="patients-summary-strip__lead-pill">{reviewBurdenLabel}</span>
              <span className="patients-summary-strip__lead-pill">Updated {updatedAtLabel}</span>
            </div>
          </div>
          <div className="patients-summary-strip__comparison" aria-label="Roster mix">
            <div className="patients-summary-strip__comparison-copy">
              <p className="patients-summary-strip__comparison-label">Roster mix</p>
              <p className="patients-summary-strip__comparison-note">
                Compare the visible cohort across active care, review burden, on-hold monitoring, and discharged follow-through.
              </p>
            </div>
            <div className="patients-summary-strip__comparison-bars">
              {rosterMixBars.map((bar) => (
                <div key={bar.key} className="patients-summary-strip__comparison-row">
                  <span className="patients-summary-strip__comparison-row-label">{bar.label}</span>
                  <div className="patients-summary-strip__comparison-track" aria-hidden="true">
                    <span
                      className={`patients-summary-strip__comparison-fill patients-summary-strip__comparison-fill--${bar.key}`}
                      style={{ width: bar.width }}
                    />
                  </div>
                  <span className="patients-summary-strip__comparison-count">{bar.count}</span>
                </div>
              ))}
            </div>
          </div>
        </article>
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

      <Card
        className="patients-workspace-card"
        title={
          <span className="patients-card-title">
            <span className="patients-card-title__eyebrow">Roster workspace</span>
            <span className="patients-card-title__row">
              <span className="patients-card-title__text">Care roster console</span>
              <span className="patients-card-title__meta">{rosterViewLabel}</span>
            </span>
            <span className="patients-card-title__support">{workspaceHeaderSupport}</span>
          </span>
        }
        action={
          <div className="patients-workspace-card__facts" aria-live="polite">
            <span className="patients-workspace-card__fact">{visibleSummary.needsReview} need review</span>
            <span className="patients-workspace-card__fact">{visibleSummary.openAlerts} with alerts</span>
            <span className="patients-workspace-card__fact">{visibleSummary.recentlyActive} active 7d</span>
          </div>
        }
      >
        <Stack gap="4">
          <div className="patients-workspace-card__command-strip">
            <div className="patients-workspace-card__command-copy">
              <p className="patients-workspace-card__command-eyebrow">What needs attention now</p>
              <p className="patients-workspace-card__command-title">{summaryLeadTitle}</p>
              <p className="patients-workspace-card__command-text">{summaryLeadNarrative}</p>
            </div>
            <div className="patients-workspace-card__command-facts" aria-live="polite">
              <span className="patients-workspace-card__fact patients-workspace-card__fact--emphasis">
                {visibleSummary.needsReview} review now
              </span>
              <span className="patients-workspace-card__fact">{visibleSummary.active} active care</span>
              <span className="patients-workspace-card__fact">{visibleSummary.recentlyActive} recently active</span>
            </div>
          </div>
          <div className="patients-workspace-card__controls">
            <div className="patients-workspace-card__control-overview">
              <div className="patients-triage-presets" role="group" aria-label="Quick triage views">
                <span className="patients-triage-presets__label">Quick triage views</span>
                <div className="patients-triage-presets__items">
                  {PATIENT_TRIAGE_PRESETS.map((preset) => {
                    const isActive = activeTriagePreset?.id === preset.id;

                    return (
                      <Button
                        key={preset.id}
                        className={`patients-triage-presets__button${
                          isActive ? ' patients-triage-presets__button--active' : ''
                        }`}
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
                  })}
                </div>
              </div>
              <div className="patients-roster-cues" aria-label="Roster cues guide">
                <p className="patients-roster-cues__eyebrow">Roster cues</p>
                <div className="patients-roster-cues__items">
                  <span className="patients-roster-cues__item">Alert burden shows current open-alert count only</span>
                  <span className="patients-roster-cues__item">Pain level shows the latest reported score only</span>
                </div>
              </div>
            </div>
            <PatientsFiltersBar
              filters={filters}
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
              onRecentlyActiveChange={(recentlyActive) =>
                applyNonSearchFilters({ recentlyActive })
              }
              onSortChange={(sort) => applyNonSearchFilters({ sort })}
              onReset={clearSavedPatientsState}
            />
            {comparePatients.length > 0 ? (
              <div
                className="patients-compare-tray"
                role="group"
                aria-label="Patients selected for compare"
              >
                <div className="patients-compare-tray__summary" aria-live="polite">
                  <span className="patients-compare-tray__count">
                    {comparePatients.length} selected
                  </span>
                  <div className="patients-compare-tray__chips">
                    {comparePatients.map((patient) => (
                      <span key={patient.id} className="patients-compare-tray__chip">
                        {getPatientDisplayName(patient)}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="patients-compare-tray__actions">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearComparePatients}
                  >
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

          <div className="patients-workspace-card__roster-stage">
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
                  {filteredEmptyDescription}
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
        </Stack>
      </Card>
    </Stack>
  );
}
