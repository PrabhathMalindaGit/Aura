import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { useConnectionStatus } from '../../../services/connection';
import { usePatients } from '../../../services/clinicianApi';
import { getSavedPatientsPreset } from '../../../services/clinicianWorkspacePreferences';
import {
  clearWorkspaceState,
  hasWorkspaceState,
  normalizeWorkspaceSearch,
  readWorkspaceState,
  writeWorkspaceState,
} from '../../../services/workspaceState';
import type { PatientSummary } from '../../../types/models';
import { asAppError } from '../../../utils/errors';
import { toErrorView, type ErrorView } from '../../../utils/errorView';
import {
  buildPatientEntryReturnTo,
  createPatientEntryState,
} from '../../../utils/patientEntryContext';
import { MAX_COMPARE_PATIENTS } from '../../../utils/patientCompare';
import {
  applyPatientFilters,
  defaultPatientFilters,
  getPatientTriagePreset,
  hasOpenAlerts,
  isMissedCheckin,
  isRecentlyActive,
  matchesPatientTriagePreset,
  PATIENT_TRIAGE_PRESETS,
  type PatientFilters,
} from '../../../utils/patientFilters';

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
const DEFAULT_PATIENTS_PAGE_SIZE = 10;
const PATIENTS_PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

function buildCompareSearch(patientIds: readonly string[]): string {
  const params = new URLSearchParams();
  patientIds.forEach((patientId) => {
    params.append('patient', patientId);
  });

  return params.toString();
}

export function normalizePatientsWorkspaceState(value: unknown): PatientFilters {
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

export interface UsePatientsViewModelResult {
  filters: PatientFilters;
  visiblePatients: PatientSummary[];
  filteredPatientsCount: number;
  comparePatientIds: string[];
  compareSelectionLimitReached: boolean;
  comparePatients: PatientSummary[];
  comparePreviewPatients: PatientSummary[];
  activeTriagePreset: (typeof PATIENT_TRIAGE_PRESETS)[number] | null;
  rosterSummary: ReturnType<typeof summarizePatients>;
  visibleSummary: ReturnType<typeof summarizePatients>;
  showInitialLoading: boolean;
  endpointMissing: boolean;
  genericError: ReturnType<typeof asAppError> | null;
  errorView: ErrorView | null;
  staleErrorBannerVisible: boolean;
  blockingOfflineVisible: boolean;
  filteredEmptyDescription: string;
  reviewBurdenLabel: string;
  workspaceStatusLine: string;
  workspaceSupportLine: string;
  pagination: {
    page: number;
    pageSize: number;
    pageCount: number;
    start: number;
    end: number;
    rangeLabel: string;
    selectedOutsidePageCount: number;
    pageSizeOptions: readonly number[];
  };
  updatedAtLabel: string;
  patientsQuery: ReturnType<typeof usePatients>;
  endpointHint: string;
  setSearch: (search: string) => void;
  setStatus: (status: PatientFilters['status']) => void;
  setHasOpenAlertsOnly: (value: boolean) => void;
  setMissedCheckinsOnly: (value: boolean) => void;
  setRecentlyActive: (value: PatientFilters['recentlyActive']) => void;
  setSort: (value: PatientFilters['sort']) => void;
  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;
  applyTriagePreset: (presetId: 'active-alerts' | 'missed-checkins' | 'recently-active') => void;
  clearSavedPatientsState: () => void;
  openPatientFromRoster: (patientId: string) => void;
  toggleComparePatient: (patientId: string) => void;
  clearComparePatients: () => void;
  openCompareMode: () => void;
  retryPatients: () => void;
}

export function usePatientsViewModel(): UsePatientsViewModelResult {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const patientsQuery = usePatients();
  const connection = useConnectionStatus();
  const initialSearchValue = useMemo(() => searchParams.get('search')?.trim() ?? '', [searchParams]);
  const savedFiltersRef = useRef<PatientFilters>(defaultPatientFilters());
  const liveFiltersRef = useRef<PatientFilters>(defaultPatientFilters());
  const searchPersistenceEnabledRef = useRef(false);
  const [comparePatientIds, setComparePatientIds] = useState<string[]>([]);
  const [page, setCurrentPage] = useState(1);
  const [pageSize, setCurrentPageSize] = useState(DEFAULT_PATIENTS_PAGE_SIZE);
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
  const filteredPatients = useMemo(() => applyPatientFilters(allPatients, filters), [allPatients, filters]);
  const pageCount = Math.max(1, Math.ceil(filteredPatients.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageStartIndex = filteredPatients.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const pageEndIndex = Math.min(safePage * pageSize, filteredPatients.length);
  const visiblePatients = useMemo(
    () => filteredPatients.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filteredPatients, pageSize, safePage],
  );
  const rosterSummary = useMemo(() => summarizePatients(allPatients), [allPatients]);
  const visibleSummary = useMemo(() => summarizePatients(filteredPatients), [filteredPatients]);

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
    filteredPatients.length === rosterSummary.total
      ? `Showing all ${rosterSummary.total} patients`
      : `Showing ${filteredPatients.length} of ${rosterSummary.total} patients`;
  const paginationRangeLabel =
    filteredPatients.length === 0
      ? 'Showing 0 patients'
      : `Showing ${pageStartIndex}-${pageEndIndex} of ${filteredPatients.length} ${
          filteredPatients.length === 1 ? 'patient' : 'patients'
        }`;
  const workspaceSupportLine =
    visibleSummary.needsReview > 0
      ? `${reviewBurdenLabel}${visibleSummary.openAlerts > 0 ? ` · ${visibleSummary.openAlerts} with active alerts` : ''}`
      : visibleSummary.recentlyActive > 0
        ? `${visibleSummary.recentlyActive} ${
            visibleSummary.recentlyActive === 1 ? 'patient checked in' : 'patients checked in'
          } during the last 7 days`
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
  const visiblePatientIds = useMemo(
    () => new Set(visiblePatients.map((patient) => patient.id.trim())),
    [visiblePatients],
  );
  const selectedOutsidePageCount = comparePatientIds.filter((patientId) => !visiblePatientIds.has(patientId)).length;
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

  const resetToFirstPage = useCallback((): void => {
    setCurrentPage(1);
  }, []);

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
      resetToFirstPage();
    },
    [persistPatientsState, resetToFirstPage],
  );

  const clearSavedPatientsState = useCallback((): void => {
    const nextFilters = defaultPatientFilters();
    savedFiltersRef.current = nextFilters;
    searchPersistenceEnabledRef.current = false;
    clearWorkspaceState(PATIENTS_WORKSPACE_PAGE);
    setFilters(nextFilters);
    resetToFirstPage();
  }, [resetToFirstPage]);

  const setSearch = useCallback((search: string): void => {
    searchPersistenceEnabledRef.current = true;
    setFilters((current) => ({ ...current, search }));
    resetToFirstPage();
  }, [resetToFirstPage]);

  const setStatus = useCallback(
    (status: PatientFilters['status']): void => {
      applyNonSearchFilters({ status });
    },
    [applyNonSearchFilters],
  );

  const setHasOpenAlertsOnly = useCallback(
    (hasOpenAlertsOnly: boolean): void => {
      applyNonSearchFilters({ hasOpenAlertsOnly });
    },
    [applyNonSearchFilters],
  );

  const setMissedCheckinsOnly = useCallback(
    (missedCheckinsOnly: boolean): void => {
      applyNonSearchFilters({ missedCheckinsOnly });
    },
    [applyNonSearchFilters],
  );

  const setRecentlyActive = useCallback(
    (recentlyActive: PatientFilters['recentlyActive']): void => {
      applyNonSearchFilters({ recentlyActive });
    },
    [applyNonSearchFilters],
  );

  const setSort = useCallback(
    (sort: PatientFilters['sort']): void => {
      applyNonSearchFilters({ sort });
    },
    [applyNonSearchFilters],
  );

  const setPage = useCallback(
    (nextPage: number): void => {
      setCurrentPage(Math.min(Math.max(1, nextPage), pageCount));
    },
    [pageCount],
  );

  const setPageSize = useCallback((nextPageSize: number): void => {
    const normalizedPageSize = PATIENTS_PAGE_SIZE_OPTIONS.includes(nextPageSize as (typeof PATIENTS_PAGE_SIZE_OPTIONS)[number])
      ? nextPageSize
      : DEFAULT_PATIENTS_PAGE_SIZE;

    setCurrentPageSize(normalizedPageSize);
    setCurrentPage(1);
  }, []);

  const applyTriagePreset = useCallback(
    (presetId: 'active-alerts' | 'missed-checkins' | 'recently-active'): void => {
      const preset = PATIENT_TRIAGE_PRESETS.find((candidate) => candidate.id === presetId);
      if (!preset) {
        return;
      }

      applyNonSearchFilters(preset.filters);
    },
    [applyNonSearchFilters],
  );

  useEffect(() => {
    liveFiltersRef.current = filters;
  }, [filters]);

  useEffect(() => {
    if (page > pageCount) {
      setCurrentPage(pageCount);
    }
  }, [page, pageCount]);

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

  return {
    filters,
    visiblePatients,
    filteredPatientsCount: filteredPatients.length,
    comparePatientIds,
    compareSelectionLimitReached,
    comparePatients,
    comparePreviewPatients,
    activeTriagePreset,
    rosterSummary,
    visibleSummary,
    showInitialLoading,
    endpointMissing,
    genericError,
    errorView,
    staleErrorBannerVisible,
    blockingOfflineVisible,
    filteredEmptyDescription,
    reviewBurdenLabel,
    workspaceStatusLine,
    workspaceSupportLine,
    pagination: {
      page: safePage,
      pageSize,
      pageCount,
      start: pageStartIndex,
      end: pageEndIndex,
      rangeLabel: paginationRangeLabel,
      selectedOutsidePageCount,
      pageSizeOptions: PATIENTS_PAGE_SIZE_OPTIONS,
    },
    updatedAtLabel,
    patientsQuery,
    endpointHint: PATIENTS_ENDPOINT_HINT,
    setSearch,
    setStatus,
    setHasOpenAlertsOnly,
    setMissedCheckinsOnly,
    setRecentlyActive,
    setSort,
    setPage,
    setPageSize,
    applyTriagePreset,
    clearSavedPatientsState,
    openPatientFromRoster,
    toggleComparePatient,
    clearComparePatients,
    openCompareMode,
    retryPatients,
  };
}
