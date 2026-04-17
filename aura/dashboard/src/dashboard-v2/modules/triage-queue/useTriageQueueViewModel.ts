import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { useConnectionStatus } from '../../../services/connection';
import { useClinicianWorklist } from '../../../services/clinicianApi';
import {
  clearWorkspaceState,
  normalizeWorkspaceSearch,
  readWorkspaceState,
  writeWorkspaceState,
} from '../../../services/workspaceState';
import { asAppError } from '../../../utils/errors';
import { toErrorView } from '../../../utils/errorView';
import { createPatientEntryState } from '../../../utils/patientEntryContext';
import {
  countActiveWorklistFilters,
  buildTriageCases,
  buildWorklistQueueGuidance,
  describeWorklistQueueScope,
  type TriageActionVm,
  type TriageCaseVm,
} from '../../adapters/worklist';
import {
  defaultWorklistFilters,
  hasWorklistFilterConstraints,
  type WorklistFilters as WorklistFiltersState,
} from '../../../utils/worklist';
import { useTriageQueueUiStore } from '../../state/useTriageQueueUiStore';

const RETRY_EVENT = 'aura:retry';
const WORKLIST_WORKSPACE_PAGE = 'worklist';
const WORKLIST_STATUS_FILTERS = ['all', 'active', 'on_hold', 'discharged', 'inactive'] as const;
const WORKLIST_SORT_OPTIONS = [
  'priority',
  'updatedAt',
  'lastCheckinAt',
  'patientName',
  'nextAppointmentAt',
] as const;

interface UseTriageQueueViewModelOptions {
  isNarrowLayout: boolean;
}

export function normalizeWorklistWorkspaceState(value: unknown): WorklistFiltersState {
  const fallback = defaultWorklistFilters();

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return fallback;
  }

  const candidate = value as Partial<WorklistFiltersState>;

  return {
    search: normalizeWorkspaceSearch(candidate.search),
    highRiskOnly: candidate.highRiskOnly === true,
    hasOpenAlerts: candidate.hasOpenAlerts === true,
    needsResponse: candidate.needsResponse === true,
    missedCheckins: candidate.missedCheckins === true,
    needsPromReview: candidate.needsPromReview === true,
    assignedToMe: candidate.assignedToMe === true,
    status: WORKLIST_STATUS_FILTERS.includes(candidate.status ?? 'all')
      ? (candidate.status as WorklistFiltersState['status'])
      : fallback.status,
    sort: WORKLIST_SORT_OPTIONS.includes(candidate.sort ?? 'priority')
      ? (candidate.sort as WorklistFiltersState['sort'])
      : fallback.sort,
  };
}

export function useTriageQueueViewModel({
  isNarrowLayout,
}: UseTriageQueueViewModelOptions) {
  const navigate = useNavigate();
  const connection = useConnectionStatus();
  const selectedCaseKey = useTriageQueueUiStore((state) => state.selectedCaseKey);
  const focusMode = useTriageQueueUiStore((state) => state.focusMode);
  const setSelectedCaseKey = useTriageQueueUiStore((state) => state.setSelectedCaseKey);
  const setFocusMode = useTriageQueueUiStore((state) => state.setFocusMode);
  const savedFiltersRef = useRef<WorklistFiltersState>(defaultWorklistFilters());
  const liveFiltersRef = useRef<WorklistFiltersState>(defaultWorklistFilters());
  const searchPersistenceEnabledRef = useRef(false);
  const [filters, setFilters] = useState<WorklistFiltersState>(() => {
    const restored = readWorkspaceState(
      WORKLIST_WORKSPACE_PAGE,
      defaultWorklistFilters(),
      normalizeWorklistWorkspaceState,
    );
    savedFiltersRef.current = restored;
    return restored;
  });
  const debouncedSearch = useDebouncedValue(filters.search.trim(), 250);
  const debouncedPersistedSearch = useDebouncedValue(filters.search, 250);

  const requestFilters = useMemo(
    () => ({
      search: debouncedSearch || undefined,
      highRiskOnly: filters.highRiskOnly,
      hasOpenAlerts: filters.hasOpenAlerts,
      needsResponse: filters.needsResponse,
      missedCheckins: filters.missedCheckins,
      needsPromReview: filters.needsPromReview,
      assignedToMe: filters.assignedToMe,
      status: filters.status,
      sort: filters.sort,
    }),
    [debouncedSearch, filters],
  );

  const worklistQuery = useClinicianWorklist(requestFilters);
  const items = useMemo(() => worklistQuery.data?.items ?? [], [worklistQuery.data?.items]);
  const total = worklistQuery.data?.total ?? items.length;
  const activeFilterConstraints = hasWorklistFilterConstraints(filters);
  const activeFilterCount = countActiveWorklistFilters(filters);
  const queueScopeLabel = describeWorklistQueueScope(filters);
  const queueViewLabel = activeFilterConstraints ? 'Focused queue view' : 'Full review queue';
  const guidanceLine = buildWorklistQueueGuidance(items, activeFilterConstraints);
  const updatedAtLabel = connection.lastSuccessAt
    ? new Date(connection.lastSuccessAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '--';

  const cases = useMemo(() => buildTriageCases(items), [items]);

  useEffect(() => {
    liveFiltersRef.current = filters;
  }, [filters]);

  const persistWorklistState = useCallback((nextFilters: WorklistFiltersState): void => {
    const normalized = normalizeWorklistWorkspaceState(nextFilters);
    savedFiltersRef.current = normalized;
    writeWorkspaceState(WORKLIST_WORKSPACE_PAGE, normalized);
  }, []);

  const clearSavedWorklistState = useCallback((): void => {
    const nextFilters = defaultWorklistFilters();
    savedFiltersRef.current = nextFilters;
    searchPersistenceEnabledRef.current = false;
    clearWorkspaceState(WORKLIST_WORKSPACE_PAGE);
    setFilters(nextFilters);
  }, []);

  useEffect(() => {
    if (!searchPersistenceEnabledRef.current) {
      return;
    }

    persistWorklistState({
      ...liveFiltersRef.current,
      search: debouncedPersistedSearch,
    });
  }, [debouncedPersistedSearch, persistWorklistState]);

  const retryWorklist = useCallback((): void => {
    void worklistQuery.refetch();
  }, [worklistQuery]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const onRetry = (): void => {
      retryWorklist();
    };

    window.addEventListener(RETRY_EVENT, onRetry);
    return () => window.removeEventListener(RETRY_EVENT, onRetry);
  }, [retryWorklist]);

  useEffect(() => {
    if (cases.length === 0) {
      if (worklistQuery.isLoading || worklistQuery.isFetching) {
        return;
      }

      if (selectedCaseKey !== null) {
        setSelectedCaseKey(null);
      }

      if (isNarrowLayout) {
        setFocusMode('queue');
      }

      return;
    }

    const hasVisibleSelection =
      selectedCaseKey !== null && cases.some((item) => item.key === selectedCaseKey);

    if (hasVisibleSelection) {
      return;
    }

    if (isNarrowLayout) {
      setSelectedCaseKey(null);
      setFocusMode('queue');
      return;
    }

    setSelectedCaseKey(cases[0].key);
    setFocusMode('workspace');
  }, [
    cases,
    isNarrowLayout,
    selectedCaseKey,
    setFocusMode,
    setSelectedCaseKey,
    worklistQuery.isFetching,
    worklistQuery.isLoading,
  ]);

  const selectedCase =
    cases.find((item) => item.key === selectedCaseKey) ??
    null;

  const showInitialLoading = worklistQuery.isLoading && items.length === 0;
  const genericError = worklistQuery.error ? asAppError(worklistQuery.error) : null;
  const staleDataAvailable = items.length > 0;
  const staleErrorBannerVisible = Boolean(genericError && staleDataAvailable);
  const blockingOfflineVisible = !connection.online && !staleDataAvailable && !worklistQuery.error;
  const errorView = genericError ? toErrorView(genericError) : null;

  const openAlertsWorkspace = useCallback(
    (patientId?: string): void => {
      const normalizedPatientId = typeof patientId === 'string' ? patientId.trim() : '';

      if (normalizedPatientId) {
        navigate(`/alerts?patientId=${encodeURIComponent(normalizedPatientId)}`);
        return;
      }

      navigate('/alerts');
    },
    [navigate],
  );

  const openPatientFromWorklist = useCallback(
    (patientId: string): void => {
      const normalizedPatientId = patientId.trim();

      if (!normalizedPatientId) {
        return;
      }

      const sourceItem =
        items.find((item) => item.patientId.trim() === normalizedPatientId) ?? null;
      const subtype = sourceItem
        ? sourceItem.latestRiskLevel === 'high'
          ? 'high-risk'
          : sourceItem.communicationNeedsResponse
            ? 'needs-response'
            : sourceItem.openAlertsCount > 0
              ? 'open-alerts'
              : 'general'
        : 'general';
      const hint =
        sourceItem?.topIssue?.trim() ||
        sourceItem?.reviewReason?.trim() ||
        'Queue handoff';

      navigate(`/patients/${encodeURIComponent(normalizedPatientId)}`, {
        state: createPatientEntryState({
          patientId: normalizedPatientId,
          source: 'worklist',
          subtype,
          hint,
          focus: 'workflow',
          returnTo: '/worklist',
        }),
      });
    },
    [items, navigate],
  );

  const openCommunicationFromWorklist = useCallback(
    (patientId: string): void => {
      const normalizedPatientId = patientId.trim();

      if (!normalizedPatientId) {
        return;
      }

      navigate(
        `/communication?patientId=${encodeURIComponent(normalizedPatientId)}&view=needs-response`,
      );
    },
    [navigate],
  );

  const openAppointmentsFromWorklist = useCallback((): void => {
    navigate('/appointments');
  }, [navigate]);

  const runWorkspaceAction = useCallback(
    (selected: TriageCaseVm, action: TriageActionVm): void => {
      if (action.kind === 'alerts') {
        openAlertsWorkspace(selected.record.patientId);
        return;
      }

      if (action.kind === 'communication') {
        openCommunicationFromWorklist(selected.record.patientId);
        return;
      }

      if (action.kind === 'appointments') {
        openAppointmentsFromWorklist();
        return;
      }

      openPatientFromWorklist(selected.record.patientId);
    },
    [
      openAlertsWorkspace,
      openAppointmentsFromWorklist,
      openCommunicationFromWorklist,
      openPatientFromWorklist,
    ],
  );

  const selectCase = useCallback(
    (key: string): void => {
      setSelectedCaseKey(key);

      if (isNarrowLayout) {
        setFocusMode('workspace');
      }
    },
    [isNarrowLayout, setFocusMode, setSelectedCaseKey],
  );

  const clearSelectionToQueue = useCallback((): void => {
    setFocusMode('queue');
  }, [setFocusMode]);

  const setSearch = useCallback((search: string): void => {
    searchPersistenceEnabledRef.current = true;
    setFilters((current) => ({ ...current, search }));
  }, []);

  const toggleFilter = useCallback(
    (key: 'highRiskOnly' | 'hasOpenAlerts' | 'needsResponse' | 'missedCheckins' | 'needsPromReview' | 'assignedToMe'): void => {
      setFilters((current) => {
        const next = {
          ...current,
          [key]: !current[key],
          search: savedFiltersRef.current.search,
        };
        persistWorklistState(next);
        return {
          ...current,
          [key]: !current[key],
        };
      });
    },
    [persistWorklistState],
  );

  const setStatus = useCallback(
    (status: WorklistFiltersState['status']): void => {
      setFilters((current) => {
        const next = {
          ...current,
          status,
          search: savedFiltersRef.current.search,
        };
        persistWorklistState(next);
        return {
          ...current,
          status,
        };
      });
    },
    [persistWorklistState],
  );

  const setSort = useCallback(
    (sort: WorklistFiltersState['sort']): void => {
      setFilters((current) => {
        const next = {
          ...current,
          sort,
          search: savedFiltersRef.current.search,
        };
        persistWorklistState(next);
        return {
          ...current,
          sort,
        };
      });
    },
    [persistWorklistState],
  );

  const visibleSelectionKey = selectedCase?.key ?? null;

  return {
    cases,
    filters,
    activeFilterCount,
    activeFilterConstraints,
    blockingOfflineVisible,
    clearSavedWorklistState,
    clearSelectionToQueue,
    connection,
    errorView,
    focusMode,
    guidanceLine,
    queueScopeLabel,
    queueViewLabel,
    retryWorklist,
    runWorkspaceAction,
    selectCase,
    selectedCase,
    setSearch,
    setSort,
    setStatus,
    showInitialLoading,
    staleErrorBannerVisible,
    toggleFilter,
    total,
    updatedAtLabel,
    visibleSelectionKey,
    worklistQuery,
  };
}
