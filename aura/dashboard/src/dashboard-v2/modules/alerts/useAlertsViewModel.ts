import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { useClinicianIdentity } from '../../../hooks/useClinicianIdentity';
import { useAssignment } from '../../../hooks/useAssignment';
import { useRiskOverride } from '../../../hooks/useRiskOverride';
import {
  clinicianQueryKeys,
  useAlertContext,
  useAlerts,
  usePatients,
  useUpdateAlertStatus,
} from '../../../services/clinicianApi';
import { useConnectionStatus } from '../../../services/connection';
import {
  getSeenMap,
  getSeenStorageKey,
  markSeen as markSeenInStore,
  pruneSeenMap,
  type SeenAlertMap,
} from '../../../services/seenStore';
import {
  clearWorkspaceState,
  readWorkspaceState,
  writeWorkspaceState,
} from '../../../services/workspaceState';
import { asAppError, toUserMessage } from '../../../utils/errors';
import { toErrorView } from '../../../utils/errorView';
import {
  buildPatientEntryReturnTo,
  createPatientEntryState,
} from '../../../utils/patientEntryContext';
import { isAlertSeenForUi } from '../../../utils/seen';
import { useAlertsUiStore } from '../../state/useAlertsUiStore';
import type {
  AlertItem,
  PatientSummary,
} from '../../../types/models';
import {
  buildAlertGovernance,
  buildAlertQueueRow,
  buildAlertReviewHeader,
  buildAlertReviewSummary,
  buildAlertsStatusBar,
  defaultAlertsWorkspaceState,
  filterAlerts,
  formatAlertsLastUpdated,
  normalizeAlertsWorkspaceState,
  reasonText,
  sortAlerts,
  type AlertsSortOrder,
  type AlertsSourceFilter,
  type AlertsTimeRangeFilter,
  type AlertsWorkspaceState,
} from '../../adapters/alerts';

const POLLING_INTERVAL_MS = 12_000;
const SEEN_PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const ALERTS_WORKSPACE_PAGE = 'alerts';

function useDocumentHidden(): boolean {
  const [hidden, setHidden] = useState(() => (typeof document === 'undefined' ? false : document.hidden));

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    const onVisibilityChange = (): void => {
      setHidden(document.hidden);
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  return hidden;
}

function countActiveFilters(state: AlertsWorkspaceState): number {
  return [
    state.searchValue.trim().length > 0,
    state.sourceFilter !== 'all',
    state.timeRange !== '7d',
    state.sortOrder !== 'newest',
    state.unseenOnly,
    state.assignedToMeOnly,
    state.unassignedOnly,
    state.overriddenOnly,
  ].filter(Boolean).length;
}

export interface UseAlertsViewModelOptions {
  isNarrowLayout: boolean;
}

interface AlertsNoticeVm {
  key: string;
  tone: 'warning' | 'info' | 'critical';
  title: string;
  message: string;
}

export function useAlertsViewModel({
  isNarrowLayout,
}: UseAlertsViewModelOptions) {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const clinicianIdentity = useClinicianIdentity();
  const connection = useConnectionStatus();
  const documentHidden = useDocumentHidden();
  const selectedAlertId = useAlertsUiStore((state) => state.selectedAlertId);
  const queueScrollTop = useAlertsUiStore((state) => state.queueScrollTop);
  const focusMode = useAlertsUiStore((state) => state.focusMode);
  const governanceOpen = useAlertsUiStore((state) => state.governanceOpen);
  const queueSheetOpen = useAlertsUiStore((state) => state.queueSheetOpen);
  const setSelectedAlertId = useAlertsUiStore((state) => state.setSelectedAlertId);
  const setQueueScrollTop = useAlertsUiStore((state) => state.setQueueScrollTop);
  const setFocusMode = useAlertsUiStore((state) => state.setFocusMode);
  const setGovernanceOpen = useAlertsUiStore((state) => state.setGovernanceOpen);
  const setQueueSheetOpen = useAlertsUiStore((state) => state.setQueueSheetOpen);
  const savedWorkspaceRef = useRef<AlertsWorkspaceState>(
    readWorkspaceState(
      ALERTS_WORKSPACE_PAGE,
      defaultAlertsWorkspaceState(),
      normalizeAlertsWorkspaceState,
    ),
  );
  const liveWorkspaceRef = useRef<AlertsWorkspaceState>(savedWorkspaceRef.current);
  const searchPersistenceEnabledRef = useRef(false);

  const chatOriginPatientId = searchParams.get('patientId')?.trim() || '';
  const openedFromChat = searchParams.get('source')?.trim() === 'chat';
  const initialSearchValue = useMemo(() => {
    const searchQuery = searchParams.get('search')?.trim();
    const patientIdQuery = chatOriginPatientId;
    return searchQuery || patientIdQuery || '';
  }, [chatOriginPatientId, searchParams]);

  const [status, setStatus] = useState(savedWorkspaceRef.current.status);
  const [searchValue, setSearchValue] = useState(
    () => initialSearchValue || savedWorkspaceRef.current.searchValue,
  );
  const [sourceFilter, setSourceFilter] = useState<AlertsSourceFilter>(savedWorkspaceRef.current.sourceFilter);
  const [timeRange, setTimeRange] = useState<AlertsTimeRangeFilter>(savedWorkspaceRef.current.timeRange);
  const [sortOrder, setSortOrder] = useState<AlertsSortOrder>(savedWorkspaceRef.current.sortOrder);
  const [unseenOnly, setUnseenOnly] = useState(savedWorkspaceRef.current.unseenOnly);
  const [assignedToMeOnly, setAssignedToMeOnly] = useState(savedWorkspaceRef.current.assignedToMeOnly);
  const [unassignedOnly, setUnassignedOnly] = useState(savedWorkspaceRef.current.unassignedOnly);
  const [overriddenOnly, setOverriddenOnly] = useState(savedWorkspaceRef.current.overriddenOnly);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [seenAlertMap, setSeenAlertMap] = useState<SeenAlertMap>(() => getSeenMap(clinicianIdentity.clinicianId));

  const debouncedPersistedSearch = useDebouncedValue(searchValue, 250);

  const shouldPollOpenAlerts = status === 'open' && connection.online && !documentHidden;
  const alertsQuery = useAlerts(status, {
    pollingEnabled: shouldPollOpenAlerts,
    pollingIntervalMs: POLLING_INTERVAL_MS,
  });
  const patientsQuery = usePatients();
  const updateAlertMutation = useUpdateAlertStatus();
  const assignments = useAssignment({
    clinicianId: clinicianIdentity.clinicianId,
    clinicianName: clinicianIdentity.displayName,
  });
  const overrides = useRiskOverride({
    clinicianId: clinicianIdentity.clinicianId,
    clinicianName: clinicianIdentity.displayName,
  });

  useEffect(() => {
    setSeenAlertMap(pruneSeenMap(clinicianIdentity.clinicianId));

    if (typeof window === 'undefined') {
      return;
    }

    const seenStorageKey = getSeenStorageKey(clinicianIdentity.clinicianId);
    const onStorage = (event: StorageEvent): void => {
      if (event.key === seenStorageKey) {
        setSeenAlertMap(getSeenMap(clinicianIdentity.clinicianId));
      }
    };

    const pruneInterval = window.setInterval(() => {
      setSeenAlertMap(pruneSeenMap(clinicianIdentity.clinicianId));
    }, SEEN_PRUNE_INTERVAL_MS);

    window.addEventListener('storage', onStorage);
    return () => {
      window.clearInterval(pruneInterval);
      window.removeEventListener('storage', onStorage);
    };
  }, [clinicianIdentity.clinicianId]);

  useEffect(() => {
    if (!initialSearchValue) {
      return;
    }

    searchPersistenceEnabledRef.current = false;
    setSearchValue(initialSearchValue);
  }, [initialSearchValue]);

  useEffect(() => {
    liveWorkspaceRef.current = normalizeAlertsWorkspaceState({
      status,
      searchValue,
      sourceFilter,
      timeRange,
      sortOrder,
      unseenOnly,
      assignedToMeOnly,
      unassignedOnly,
      overriddenOnly,
    });
  }, [
    assignedToMeOnly,
    overriddenOnly,
    searchValue,
    sortOrder,
    sourceFilter,
    status,
    timeRange,
    unseenOnly,
    unassignedOnly,
  ]);

  const persistAlertsWorkspaceState = useCallback((nextState: Partial<AlertsWorkspaceState>): void => {
    const normalized = normalizeAlertsWorkspaceState({
      ...liveWorkspaceRef.current,
      ...nextState,
    });
    savedWorkspaceRef.current = normalized;
    writeWorkspaceState(ALERTS_WORKSPACE_PAGE, normalized);
  }, []);

  useEffect(() => {
    if (!searchPersistenceEnabledRef.current) {
      return;
    }

    persistAlertsWorkspaceState({
      searchValue: debouncedPersistedSearch,
    });
  }, [debouncedPersistedSearch, persistAlertsWorkspaceState]);

  const sourceAlerts = useMemo(
    () => overrides.applyAlertOverrides(assignments.applyAlertAssignments(alertsQuery.data ?? [])),
    [alertsQuery.data, assignments, overrides],
  );

  const patientMap = useMemo(() => {
    const map = new Map<string, PatientSummary>();
    for (const patient of patientsQuery.data ?? []) {
      map.set(patient.id.trim(), patient);
    }
    return map;
  }, [patientsQuery.data]);

  const visibleAlerts = useMemo(
    () =>
      sortAlerts(
        filterAlerts(sourceAlerts, {
          searchValue,
          sourceFilter,
          timeRange,
          unseenOnly,
          assignedToMeOnly,
          unassignedOnly,
          overriddenOnly,
          clinicianId: clinicianIdentity.clinicianId,
          seenAlertMap,
          status,
        }),
        sortOrder,
      ),
    [
      assignedToMeOnly,
      clinicianIdentity.clinicianId,
      overriddenOnly,
      searchValue,
      seenAlertMap,
      sortOrder,
      sourceAlerts,
      sourceFilter,
      status,
      timeRange,
      unassignedOnly,
      unseenOnly,
    ],
  );

  useEffect(() => {
    if (visibleAlerts.length === 0) {
      if (selectedAlertId) {
        setSelectedAlertId(null);
      }

      if (isNarrowLayout) {
        setFocusMode('queue');
      }
      return;
    }

    const selectedVisible =
      selectedAlertId !== null && visibleAlerts.some((alert) => alert._id === selectedAlertId);

    if (selectedVisible) {
      if (!isNarrowLayout) {
        setFocusMode('workspace');
      }
      return;
    }

    if (isNarrowLayout) {
      setSelectedAlertId(visibleAlerts[0]?._id ?? null);
      setFocusMode('queue');
      return;
    }

    setSelectedAlertId(visibleAlerts[0]?._id ?? null);
    setFocusMode('workspace');
  }, [
    isNarrowLayout,
    selectedAlertId,
    setFocusMode,
    setSelectedAlertId,
    visibleAlerts,
  ]);

  const activeAlert =
    visibleAlerts.find((alert) => alert._id === selectedAlertId) ??
    null;
  const activeAlertSeenByUi = activeAlert ? isAlertSeenForUi(activeAlert, seenAlertMap) : false;

  const alertContextQuery = useAlertContext(activeAlert?._id, Boolean(activeAlert?._id));

  const statusCounts = useMemo(() => {
    const cachedAcknowledged =
      queryClient.getQueryData<AlertItem[]>(clinicianQueryKeys.alerts('acknowledged')) ?? [];
    const cachedResolved =
      queryClient.getQueryData<AlertItem[]>(clinicianQueryKeys.alerts('resolved')) ?? [];
    const cachedOpen =
      queryClient.getQueryData<AlertItem[]>(clinicianQueryKeys.alerts('open')) ?? [];

    return {
      open: status === 'open' ? sourceAlerts.length : cachedOpen.length,
      acknowledged: status === 'acknowledged' ? sourceAlerts.length : cachedAcknowledged.length,
      resolved: status === 'resolved' ? sourceAlerts.length : cachedResolved.length,
    };
  }, [queryClient, sourceAlerts.length, status]);

  const openAlertsForOverview = useMemo(() => {
    if (status === 'open') {
      return sourceAlerts;
    }

    const cachedOpen =
      queryClient.getQueryData<AlertItem[]>(clinicianQueryKeys.alerts('open')) ?? [];
    return overrides.applyAlertOverrides(assignments.applyAlertAssignments(cachedOpen));
  }, [assignments, overrides, queryClient, sourceAlerts, status]);

  const statusBar = useMemo(
    () =>
      buildAlertsStatusBar({
        status,
        statusCounts,
        visibleCount: visibleAlerts.length,
        filterCount: countActiveFilters(liveWorkspaceRef.current),
        updatedAtLabel: formatAlertsLastUpdated(connection.lastSuccessAt),
        openAlerts: openAlertsForOverview,
        seenAlertMap,
        clinicianId: clinicianIdentity.clinicianId,
      }),
    [
      clinicianIdentity.clinicianId,
      connection.lastSuccessAt,
      openAlertsForOverview,
      seenAlertMap,
      status,
      statusCounts,
      visibleAlerts.length,
    ],
  );

  const queueRows = useMemo(
    () =>
      visibleAlerts.map((alert) =>
        buildAlertQueueRow({
          alert,
          patient: patientMap.get(alert.patientId.trim()) ?? null,
          seenAlertMap,
        }),
      ),
    [patientMap, seenAlertMap, visibleAlerts],
  );

  const activeHeader = useMemo(
    () =>
      activeAlert
        ? buildAlertReviewHeader({
            alert: activeAlert,
            patient: patientMap.get(activeAlert.patientId.trim()) ?? null,
            seen: activeAlertSeenByUi,
          })
        : null,
    [activeAlert, activeAlertSeenByUi, patientMap],
  );

  const activeReviewSummary = useMemo(
    () => (activeAlert ? buildAlertReviewSummary(activeAlert) : null),
    [activeAlert],
  );

  const governance = useMemo(
    () =>
      activeAlert
        ? buildAlertGovernance({
            alert: activeAlert,
            patient: patientMap.get(activeAlert.patientId.trim()) ?? null,
            seen: activeAlertSeenByUi,
            timeline: alertContextQuery.data?.timeline,
          })
        : null,
    [activeAlert, activeAlertSeenByUi, alertContextQuery.data?.timeline, patientMap],
  );

  const staleDataAvailable = sourceAlerts.length > 0;
  const genericError = alertsQuery.error ? asAppError(alertsQuery.error) : null;
  const staleErrorBannerVisible = Boolean(genericError && staleDataAvailable);
  const blockingOfflineVisible = !connection.online && !staleDataAvailable && !alertsQuery.error;
  const blockingErrorVisible = Boolean(genericError && !staleDataAvailable && connection.online);
  const errorView = genericError ? toErrorView(genericError) : null;

  const chatOriginNote = openedFromChat
    ? chatOriginPatientId
      ? `Opened from patient communication for ${chatOriginPatientId}. Keep alert review anchored to this patient context.`
      : 'Opened from patient communication. Keep alert review anchored to the current patient context.'
    : null;

  const notices: AlertsNoticeVm[] = [
    staleErrorBannerVisible
      ? {
          key: 'stale-data',
          tone: 'warning' as const,
          title: 'Service temporarily unavailable',
          message: `Showing the last known alert snapshot from ${formatAlertsLastUpdated(connection.lastSuccessAt)}.`,
        }
      : null,
    actionNotice
      ? {
          key: 'action-note',
          tone: 'info' as const,
          title: 'Action note',
          message: actionNotice,
        }
      : null,
    actionError
      ? {
          key: 'action-error',
          tone: 'critical' as const,
          title: 'Action failed',
          message: actionError,
        }
      : null,
    assignments.assignmentError
      ? {
          key: 'assignment-error',
          tone: 'critical' as const,
          title: 'Assignment update failed',
          message: assignments.assignmentError,
        }
      : null,
    overrides.overrideError
      ? {
          key: 'override-error',
          tone: 'critical' as const,
          title: 'Risk override update failed',
          message: overrides.overrideError,
        }
      : null,
  ].filter((notice): notice is AlertsNoticeVm => Boolean(notice));

  const selectAlert = useCallback(
    (alertId: string, options?: { markSeen?: boolean }): void => {
      const nextAlert = sourceAlerts.find((alert) => alert._id === alertId);
      if (!nextAlert) {
        return;
      }

      if (options?.markSeen && nextAlert.status === 'open') {
        setSeenAlertMap(markSeenInStore(nextAlert._id, clinicianIdentity.clinicianId));
      }

      setSelectedAlertId(nextAlert._id);
      setFocusMode('workspace');
      setActionError(null);
      setActionNotice(null);
    },
    [clinicianIdentity.clinicianId, setFocusMode, setSelectedAlertId, sourceAlerts],
  );

  const clearSelectionToQueue = useCallback((): void => {
    if (!isNarrowLayout) {
      return;
    }

    setFocusMode('queue');
  }, [isNarrowLayout, setFocusMode]);

  const handleStatusChange = useCallback(
    (nextStatus: AlertsWorkspaceState['status']): void => {
      setStatus(nextStatus);
      setActionError(null);
      setActionNotice(null);

      if (nextStatus === 'open') {
        persistAlertsWorkspaceState({
          status: nextStatus,
        });
        return;
      }

      setUnseenOnly(false);
      setAssignedToMeOnly(false);
      setUnassignedOnly(false);
      setOverriddenOnly(false);
      persistAlertsWorkspaceState({
        status: nextStatus,
        unseenOnly: false,
        assignedToMeOnly: false,
        unassignedOnly: false,
        overriddenOnly: false,
      });
    },
    [persistAlertsWorkspaceState],
  );

  const retryAlerts = useCallback((): void => {
    void alertsQuery.refetch();
  }, [alertsQuery]);

  const openPatientFromAlert = useCallback(
    (patientId: string): void => {
      const normalizedPatientId = patientId.trim();
      if (!normalizedPatientId) {
        return;
      }

      const sourceAlert =
        (activeAlert && activeAlert.patientId.trim() === normalizedPatientId
          ? activeAlert
          : sourceAlerts.find((alert) => alert.patientId.trim() === normalizedPatientId)) ?? null;

      navigate(`/patients/${encodeURIComponent(normalizedPatientId)}`, {
        state: createPatientEntryState({
          patientId: normalizedPatientId,
          source: 'alerts',
          subtype: sourceAlert?.status ?? 'open',
          hint: sourceAlert ? reasonText(sourceAlert.reason) : 'Alert follow-through',
          focus: 'alerts',
          returnTo: buildPatientEntryReturnTo(location.pathname, location.search),
        }),
      });
    },
    [activeAlert, location.pathname, location.search, navigate, sourceAlerts],
  );

  const handleStatusUpdate = useCallback(
    async (nextStatus: 'acknowledged' | 'resolved', alert = activeAlert): Promise<void> => {
      if (!alert) {
        return;
      }

      setActionError(null);
      setActionNotice(null);
      assignments.clearAssignmentError();
      overrides.clearOverrideError();

      try {
        const updatedAlert = await updateAlertMutation.mutateAsync({
          id: alert._id,
          status: nextStatus,
        });
        setActionNotice(
          nextStatus === 'resolved'
            ? `Resolved alert for ${updatedAlert.patientId}.`
            : `Acknowledged alert for ${updatedAlert.patientId}.`,
        );
      } catch (error) {
        setActionError(toUserMessage(asAppError(error)));
      }
    },
    [activeAlert, assignments, overrides, updateAlertMutation],
  );

  const handleAssignToMe = useCallback(
    async (alert = activeAlert): Promise<void> => {
      if (!alert) {
        return;
      }

      setActionError(null);
      setActionNotice(null);
      assignments.clearAssignmentError();
      const result = await assignments.assignToMe(alert);
      if (!result.ok && result.message) {
        setActionError(result.message);
        return;
      }

      setActionNotice(`Assigned alert for ${alert.patientId} to ${clinicianIdentity.displayName}.`);
    },
    [activeAlert, assignments, clinicianIdentity.displayName],
  );

  const handleTakeOver = useCallback(
    async (alert = activeAlert): Promise<void> => {
      if (!alert) {
        return;
      }

      setActionError(null);
      setActionNotice(null);
      assignments.clearAssignmentError();
      const result = await assignments.takeOver(alert);
      if (!result.ok && result.message) {
        setActionError(result.message);
        return;
      }

      setActionNotice(`Took over alert for ${alert.patientId}.`);
    },
    [activeAlert, assignments],
  );

  const handleUnassign = useCallback(
    async (alert = activeAlert): Promise<void> => {
      if (!alert) {
        return;
      }

      setActionError(null);
      setActionNotice(null);
      assignments.clearAssignmentError();
      const result = await assignments.unassignFromMe(alert);
      if (!result.ok && result.message) {
        setActionError(result.message);
        return;
      }

      setActionNotice(`Removed assignment for ${alert.patientId}.`);
    },
    [activeAlert, assignments],
  );

  const handleSaveRiskOverride = useCallback(
    async (
      payload: { riskFinal: string; overrideReason?: string },
      alert = activeAlert,
    ): Promise<void> => {
      if (!alert) {
        return;
      }

      setActionError(null);
      setActionNotice(null);
      overrides.clearOverrideError();
      const result = await overrides.saveOverride(alert, payload);
      if (!result.ok && result.message) {
        setActionError(result.message);
        return;
      }

      setActionNotice(`Updated override state for ${alert.patientId}.`);
    },
    [activeAlert, overrides],
  );

  const handleClearRiskOverride = useCallback(
    async (alert = activeAlert): Promise<void> => {
      if (!alert) {
        return;
      }

      setActionError(null);
      setActionNotice(null);
      overrides.clearOverrideError();
      const result = await overrides.clearOverride(alert);
      if (!result.ok && result.message) {
        setActionError(result.message);
        return;
      }

      setActionNotice(`Cleared override for ${alert.patientId}.`);
    },
    [activeAlert, overrides],
  );

  const resetFilters = useCallback((): void => {
    const next = defaultAlertsWorkspaceState();
    savedWorkspaceRef.current = next;
    searchPersistenceEnabledRef.current = false;
    clearWorkspaceState(ALERTS_WORKSPACE_PAGE);
    setStatus(next.status);
    setSearchValue(initialSearchValue || next.searchValue);
    setSourceFilter(next.sourceFilter);
    setTimeRange(next.timeRange);
    setSortOrder(next.sortOrder);
    setUnseenOnly(next.unseenOnly);
    setAssignedToMeOnly(next.assignedToMeOnly);
    setUnassignedOnly(next.unassignedOnly);
    setOverriddenOnly(next.overriddenOnly);
  }, [initialSearchValue]);

  return {
    status,
    searchValue,
    sourceFilter,
    timeRange,
    sortOrder,
    unseenOnly,
    assignedToMeOnly,
    unassignedOnly,
    overriddenOnly,
    focusMode,
    queueScrollTop,
    governanceOpen,
    queueSheetOpen,
    chatOriginNote,
    notices,
    statusBar,
    queueRows,
    activeAlert,
    activeHeader,
    activeReviewSummary,
    activeAlertSeen: activeAlertSeenByUi,
    activeContext: alertContextQuery.data,
    activeContextLoading: alertContextQuery.isFetching,
    activeContextError: alertContextQuery.error ? toUserMessage(asAppError(alertContextQuery.error)) : null,
    governance,
    showInitialLoading: alertsQuery.isLoading && sourceAlerts.length === 0,
    isRefreshing: alertsQuery.isFetching,
    blockingErrorVisible,
    blockingOfflineVisible,
    errorView,
    selectedAlertId,
    mutationPending: updateAlertMutation.isPending,
    assignmentPending: assignments.assignmentBusy,
    overridePending: overrides.overrideBusy,
    clinicianId: clinicianIdentity.clinicianId,
    filterCount: countActiveFilters(liveWorkspaceRef.current),
    setSearchValue: (value: string) => {
      searchPersistenceEnabledRef.current = true;
      setSearchValue(value);
    },
    setSourceFilter: (value: AlertsSourceFilter) => {
      setSourceFilter(value);
      persistAlertsWorkspaceState({ sourceFilter: value });
    },
    setTimeRange: (value: AlertsTimeRangeFilter) => {
      setTimeRange(value);
      persistAlertsWorkspaceState({ timeRange: value });
    },
    setSortOrder: (value: AlertsSortOrder) => {
      setSortOrder(value);
      persistAlertsWorkspaceState({ sortOrder: value });
    },
    setUnseenOnly: (value: boolean) => {
      setUnseenOnly(value);
      persistAlertsWorkspaceState({ unseenOnly: value });
    },
    setAssignedToMeOnly: (value: boolean) => {
      setAssignedToMeOnly(value);
      const nextUnassignedOnly = value ? false : unassignedOnly;
      if (value) {
        setUnassignedOnly(false);
      }
      persistAlertsWorkspaceState({
        assignedToMeOnly: value,
        unassignedOnly: nextUnassignedOnly,
      });
    },
    setUnassignedOnly: (value: boolean) => {
      setUnassignedOnly(value);
      const nextAssignedToMeOnly = value ? false : assignedToMeOnly;
      if (value) {
        setAssignedToMeOnly(false);
      }
      persistAlertsWorkspaceState({
        unassignedOnly: value,
        assignedToMeOnly: nextAssignedToMeOnly,
      });
    },
    setOverriddenOnly: (value: boolean) => {
      setOverriddenOnly(value);
      persistAlertsWorkspaceState({ overriddenOnly: value });
    },
    handleStatusChange,
    retryAlerts,
    selectAlert,
    clearSelectionToQueue,
    openPatientFromAlert,
    handleStatusUpdate,
    handleAssignToMe,
    handleTakeOver,
    handleUnassign,
    handleSaveRiskOverride,
    handleClearRiskOverride,
    refetchAlertContext: () => void alertContextQuery.refetch(),
    setQueueScrollTop,
    setGovernanceOpen,
    setQueueSheetOpen,
    resetFilters,
  };
}
