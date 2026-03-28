import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { AlertItem, AlertStatus } from '../types/models';
import { AlertCardList } from '../components/alerts/AlertCardList';
import { AlertDetailDrawer } from '../components/alerts/AlertDetailDrawer';
import { AlertsTable } from '../components/alerts/AlertsTable';
import { ExportCsvModal } from '../components/export/ExportCsvModal';
import {
  FiltersBar,
  type SortOrder,
  type SourceFilter,
  type TimeRangeFilter,
} from '../components/alerts/FiltersBar';
import { StatusTabs } from '../components/alerts/StatusTabs';
import { AlertBanner } from '../components/ui/AlertBanner';
import { Button } from '../components/ui/Button';
import { Section } from '../components/ui/Section';
import { RetryButton } from '../components/system/RetryButton';
import { StatusPanel } from '../components/system/StatusPanel';
import { Skeleton } from '../components/ui/Skeleton';
import { Stack } from '../components/ui/Stack';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useAssignment } from '../hooks/useAssignment';
import { useNotificationPreferences } from '../hooks/useNotificationPreferences';
import { useRiskOverride } from '../hooks/useRiskOverride';
import {
  getClinicianId,
  getClinicianIdentityStorageKeys,
  getClinicianName,
} from '../services/clinicianIdentity';
import {
  getSeenMap,
  getSeenStorageKey,
  markSeen as markSeenInStore,
  pruneSeenMap,
  type SeenAlertMap,
} from '../services/seenStore';
import {
  clinicianQueryKeys,
  listAlerts,
  useAlerts,
  useUpdateAlertStatus,
} from '../services/clinicianApi';
import { useConnectionStatus } from '../services/connection';
import {
  normalizeWorkspaceSearch,
  readWorkspaceState,
  writeWorkspaceState,
} from '../services/workspaceState';
import { MEDIA_QUERIES } from '../styles/breakpoints';
import { toCsv, downloadCsv } from '../utils/csv';
import {
  getPresetDateRange,
  type DateRangeValue,
  validateDateRange,
} from '../utils/datesRange';
import { asAppError, toUserMessage } from '../utils/errors';
import {
  buildAlertExportColumns,
  buildAlertExportRows,
  createAlertsCsvFilename,
  filterAlertsForExportByRange,
  formatExportDateRangeSummary,
} from '../services/exportService';
import { findNewIds, mergeUniqueIds, removeIds } from '../utils/highlight';
import { computeAlertKpis } from '../utils/kpi';
import { NEW_ALERT_HIGHLIGHT_TTL_MS } from '../utils/motion';
import { hasRiskOverride } from '../utils/risk';
import { isAlertSeenForUi, isAlertUnseenForUi } from '../utils/seen';
import { isAfterWithinDays } from '../utils/time';
import { toErrorView } from '../utils/errorView';
import {
  buildPatientEntryReturnTo,
  createPatientEntryState,
} from '../utils/patientEntryContext';

const POLLING_INTERVAL_MS = 12_000;
const SEEN_PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const RETRY_EVENT = 'aura:retry';
const ALERTS_WORKSPACE_PAGE = 'alerts';

interface AlertsWorkspaceState {
  status: AlertStatus;
  searchValue: string;
  sourceFilter: SourceFilter;
  timeRange: TimeRangeFilter;
  sortOrder: SortOrder;
  unseenOnly: boolean;
  assignedToMeOnly: boolean;
  unassignedOnly: boolean;
  overriddenOnly: boolean;
}

interface LastTriageOutcome {
  patientId: string;
  status: 'acknowledged' | 'resolved';
}

function createDefaultExportStatuses(activeStatus: AlertStatus): Record<AlertStatus, boolean> {
  return {
    open: activeStatus === 'open',
    acknowledged: activeStatus === 'acknowledged',
    resolved: activeStatus === 'resolved',
  };
}

function reasonText(reason: string | string[]): string {
  return Array.isArray(reason) ? reason.join(' ') : reason;
}

function formatLastUpdated(lastSuccessAt: number | null): string {
  if (!lastSuccessAt) {
    return '--';
  }

  return new Date(lastSuccessAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatTroubleshootingTime(timestamp: number | null): string | undefined {
  if (!timestamp) {
    return undefined;
  }

  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatStatusViewLabel(status: AlertStatus): string {
  if (status === 'acknowledged') {
    return 'Acknowledged queue';
  }

  if (status === 'resolved') {
    return 'Resolved archive';
  }

  return 'Open queue';
}

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

function toDays(range: TimeRangeFilter): number {
  if (range === '24h') {
    return 1;
  }

  if (range === '7d') {
    return 7;
  }

  return 30;
}

function sortAlerts(alerts: AlertItem[], order: SortOrder): AlertItem[] {
  const next = [...alerts];

  if (order === 'patient-asc') {
    next.sort((a, b) => a.patientId.localeCompare(b.patientId));
    return next;
  }

  if (order === 'oldest') {
    next.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    return next;
  }

  next.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return next;
}

function normalizeAlertsWorkspaceState(value: unknown): AlertsWorkspaceState {
  const fallback: AlertsWorkspaceState = {
    status: 'open',
    searchValue: '',
    sourceFilter: 'all',
    timeRange: '7d',
    sortOrder: 'newest',
    unseenOnly: false,
    assignedToMeOnly: false,
    unassignedOnly: false,
    overriddenOnly: false,
  };

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return fallback;
  }

  const candidate = value as Partial<AlertsWorkspaceState>;
  const status =
    candidate.status === 'acknowledged' || candidate.status === 'resolved'
      ? candidate.status
      : 'open';
  const assignedToMeOnly = candidate.assignedToMeOnly === true;
  const unassignedOnly = candidate.unassignedOnly === true && !assignedToMeOnly;
  const openOnlyState =
    status === 'open'
      ? {
          unseenOnly: candidate.unseenOnly === true,
          assignedToMeOnly,
          unassignedOnly,
          overriddenOnly: candidate.overriddenOnly === true,
        }
      : {
          unseenOnly: false,
          assignedToMeOnly: false,
          unassignedOnly: false,
          overriddenOnly: false,
        };

  return {
    status,
    searchValue: normalizeWorkspaceSearch(candidate.searchValue),
    sourceFilter:
      candidate.sourceFilter === 'checkin' || candidate.sourceFilter === 'chat'
        ? candidate.sourceFilter
        : 'all',
    timeRange:
      candidate.timeRange === '24h' || candidate.timeRange === '30d'
        ? candidate.timeRange
        : '7d',
    sortOrder:
      candidate.sortOrder === 'oldest' || candidate.sortOrder === 'patient-asc'
        ? candidate.sortOrder
        : 'newest',
    ...openOnlyState,
  };
}

function filterAlerts(
  alerts: AlertItem[],
  options: {
    searchValue: string;
    sourceFilter: SourceFilter;
    timeRange: TimeRangeFilter;
    unseenOnly: boolean;
    assignedToMeOnly: boolean;
    unassignedOnly: boolean;
    overriddenOnly: boolean;
    clinicianId: string;
    seenAlertMap: SeenAlertMap;
    status: AlertStatus;
    skipTimeRange?: boolean;
  },
): AlertItem[] {
  const normalizedSearch = options.searchValue.trim().toLowerCase();

  return alerts.filter((alert) => {
    if (options.sourceFilter !== 'all' && alert.source.type !== options.sourceFilter) {
      return false;
    }

    if (options.status === 'open' && options.unseenOnly && !isAlertUnseenForUi(alert, options.seenAlertMap)) {
      return false;
    }

    if (options.status === 'open' && options.assignedToMeOnly && alert.assignedTo !== options.clinicianId) {
      return false;
    }

    if (options.status === 'open' && options.unassignedOnly && Boolean(alert.assignedTo)) {
      return false;
    }

    if (options.status === 'open' && options.overriddenOnly && !hasRiskOverride(alert)) {
      return false;
    }

    if (!options.skipTimeRange && !isAfterWithinDays(alert.createdAt, toDays(options.timeRange))) {
      return false;
    }

    if (!normalizedSearch) {
      return true;
    }

    const searchable = `${alert._id} ${alert.patientId} ${reasonText(alert.reason)} ${alert.source.type}`.toLowerCase();
    return searchable.includes(normalizedSearch);
  });
}

export function AlertsPage(): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const chatOriginPatientId = searchParams.get('patientId')?.trim() || '';
  const openedFromChat = searchParams.get('source')?.trim() === 'chat';
  const initialSearchValue = useMemo(() => {
    const searchQuery = searchParams.get('search')?.trim();
    const patientIdQuery = chatOriginPatientId;
    return searchQuery || patientIdQuery || '';
  }, [chatOriginPatientId, searchParams]);
  const savedWorkspaceRef = useRef<AlertsWorkspaceState>(
    readWorkspaceState(
      ALERTS_WORKSPACE_PAGE,
      normalizeAlertsWorkspaceState(undefined),
      normalizeAlertsWorkspaceState,
    ),
  );
  const liveWorkspaceRef = useRef<AlertsWorkspaceState>(savedWorkspaceRef.current);
  const searchPersistenceEnabledRef = useRef(false);
  const [status, setStatus] = useState<AlertStatus>(() => savedWorkspaceRef.current.status);
  const [selectedAlert, setSelectedAlert] = useState<AlertItem | null>(null);
  const [searchValue, setSearchValue] = useState(() => initialSearchValue || savedWorkspaceRef.current.searchValue);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>(() => savedWorkspaceRef.current.sourceFilter);
  const [timeRange, setTimeRange] = useState<TimeRangeFilter>(() => savedWorkspaceRef.current.timeRange);
  const [sortOrder, setSortOrder] = useState<SortOrder>(() => savedWorkspaceRef.current.sortOrder);
  const [unseenOnly, setUnseenOnly] = useState(() => savedWorkspaceRef.current.unseenOnly);
  const [assignedToMeOnly, setAssignedToMeOnly] = useState(() => savedWorkspaceRef.current.assignedToMeOnly);
  const [unassignedOnly, setUnassignedOnly] = useState(() => savedWorkspaceRef.current.unassignedOnly);
  const [overriddenOnly, setOverriddenOnly] = useState(() => savedWorkspaceRef.current.overriddenOnly);
  const [actionError, setActionError] = useState<string | null>(null);
  const [lastTriageOutcome, setLastTriageOutcome] = useState<LastTriageOutcome | null>(null);
  const [clinicianId, setClinicianId] = useState(() => getClinicianId());
  const [clinicianName, setClinicianName] = useState(() => getClinicianName());
  const [seenAlertMap, setSeenAlertMap] = useState<SeenAlertMap>(() => getSeenMap(clinicianId));
  const [alertsExportOpen, setAlertsExportOpen] = useState(false);
  const [alertsExportRange, setAlertsExportRange] = useState<DateRangeValue>(() =>
    getPresetDateRange('last7'),
  );
  const [alertsExportStatuses, setAlertsExportStatuses] = useState<Record<AlertStatus, boolean>>(
    () => createDefaultExportStatuses('open'),
  );
  const [alertsExportIncludeNotifications, setAlertsExportIncludeNotifications] = useState(true);
  const [alertsExportIncludeAdvancedFields, setAlertsExportIncludeAdvancedFields] = useState(true);
  const [alertsExportPreviewLoading, setAlertsExportPreviewLoading] = useState(false);
  const [alertsExportDownloadLoading, setAlertsExportDownloadLoading] = useState(false);
  const [alertsExportPreviewCount, setAlertsExportPreviewCount] = useState(0);
  const [alertsExportError, setAlertsExportError] = useState<string | null>(null);
  const [highlightedAlertIds, setHighlightedAlertIds] = useState<string[]>([]);
  const debouncedPersistedSearch = useDebouncedValue(searchValue, 250);
  const alertsExportRangeError = validateDateRange(alertsExportRange);
  const selectedAlertsExportStatuses = useMemo(
    () =>
      (Object.entries(alertsExportStatuses) as Array<[AlertStatus, boolean]>)
        .filter((entry) => entry[1])
        .map((entry) => entry[0]),
    [alertsExportStatuses],
  );

  const drawerFocusReturnRef = useRef<HTMLElement | null>(null);
  const previousOpenAlertIdsRef = useRef<string[] | null>(null);
  const highlightTimeoutsRef = useRef<Record<string, number>>({});

  const queryClient = useQueryClient();
  const documentHidden = useDocumentHidden();
  const isMobileLayout = useMediaQuery(MEDIA_QUERIES.mdDown);
  const connection = useConnectionStatus();
  const notificationPreferences = useNotificationPreferences();

  const shouldPollOpenAlerts = status === 'open' && connection.online && !documentHidden;

  const alertsQuery = useAlerts(status, {
    pollingEnabled: shouldPollOpenAlerts,
    pollingIntervalMs: POLLING_INTERVAL_MS,
  });
  const updateAlertMutation = useUpdateAlertStatus();
  const assignments = useAssignment({ clinicianId, clinicianName });
  const overrides = useRiskOverride({ clinicianId, clinicianName });
  const applyAlertAssignments = assignments.applyAlertAssignments;
  const applyAlertOverrides = overrides.applyAlertOverrides;

  const persistAlertsWorkspaceState = useCallback(
    (
      overridesState: Partial<AlertsWorkspaceState> = {},
      options?: { persistSearch?: boolean },
    ): void => {
      const baseState = liveWorkspaceRef.current;
      const normalized = normalizeAlertsWorkspaceState({
        ...baseState,
        searchValue:
          options?.persistSearch === false
            ? savedWorkspaceRef.current.searchValue
            : baseState.searchValue,
        ...overridesState,
      });

      savedWorkspaceRef.current = normalized;
      writeWorkspaceState(ALERTS_WORKSPACE_PAGE, normalized);
    },
    [],
  );

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

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const { clinicianIdKey, clinicianNameKey } = getClinicianIdentityStorageKeys();
    const onStorage = (event: StorageEvent): void => {
      if (event.key === clinicianIdKey) {
        setClinicianId(getClinicianId());
      }

      if (event.key === clinicianNameKey) {
        setClinicianName(getClinicianName());
      }
    };

    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    setSeenAlertMap(pruneSeenMap(clinicianId));

    if (typeof window === 'undefined') {
      return;
    }

    const seenStorageKey = getSeenStorageKey(clinicianId);
    const onStorage = (event: StorageEvent): void => {
      if (event.key === seenStorageKey) {
        setSeenAlertMap(getSeenMap(clinicianId));
      }
    };

    const pruneInterval = window.setInterval(() => {
      setSeenAlertMap(pruneSeenMap(clinicianId));
    }, SEEN_PRUNE_INTERVAL_MS);

    window.addEventListener('storage', onStorage);

    return () => {
      window.clearInterval(pruneInterval);
      window.removeEventListener('storage', onStorage);
    };
  }, [clinicianId]);

  useEffect(() => {
    if (!initialSearchValue) {
      return;
    }

    searchPersistenceEnabledRef.current = false;
    setSearchValue(initialSearchValue);
  }, [initialSearchValue]);

  useEffect(() => {
    setSelectedAlert(null);
  }, [status]);

  useEffect(() => {
    if (!searchPersistenceEnabledRef.current) {
      return;
    }

    persistAlertsWorkspaceState(
      {
        searchValue: debouncedPersistedSearch,
      },
      { persistSearch: true },
    );
  }, [debouncedPersistedSearch, persistAlertsWorkspaceState]);

  const collectAlertsForExport = useCallback(
    async (statusesToInclude: AlertStatus[]): Promise<AlertItem[]> => {
      const collections = await Promise.all(statusesToInclude.map((statusItem) => listAlerts(statusItem)));

      return collections.flatMap((statusAlerts, index) => {
        const statusItem = statusesToInclude[index];
        const enhanced = applyAlertOverrides(applyAlertAssignments(statusAlerts));

        const filtered = filterAlerts(enhanced, {
          searchValue,
          sourceFilter,
          timeRange,
          unseenOnly,
          assignedToMeOnly,
          unassignedOnly,
          overriddenOnly,
          clinicianId,
          seenAlertMap,
          status: statusItem,
          skipTimeRange: true,
        });

        return filterAlertsForExportByRange(filtered, alertsExportRange);
      });
    },
    [
      alertsExportRange,
      applyAlertAssignments,
      applyAlertOverrides,
      assignedToMeOnly,
      clinicianId,
      overriddenOnly,
      searchValue,
      seenAlertMap,
      sourceFilter,
      timeRange,
      unassignedOnly,
      unseenOnly,
    ],
  );

  useEffect(() => {
    if (!alertsExportOpen) {
      return;
    }

    setAlertsExportError(null);

    if (alertsExportRangeError) {
      setAlertsExportPreviewCount(0);
      return;
    }

    if (selectedAlertsExportStatuses.length === 0) {
      setAlertsExportPreviewCount(0);
      return;
    }

    let cancelled = false;
    setAlertsExportPreviewLoading(true);

    void (async () => {
      try {
        const rows = await collectAlertsForExport(selectedAlertsExportStatuses);
        if (cancelled) {
          return;
        }

        setAlertsExportPreviewCount(rows.length);
      } catch (error) {
        if (cancelled) {
          return;
        }

        setAlertsExportPreviewCount(0);
        setAlertsExportError(toUserMessage(asAppError(error)));
      } finally {
        if (!cancelled) {
          setAlertsExportPreviewLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    alertsExportOpen,
    alertsExportRange,
    alertsExportRangeError,
    collectAlertsForExport,
    clinicianId,
    overriddenOnly,
    searchValue,
    seenAlertMap,
    selectedAlertsExportStatuses,
    sourceFilter,
    timeRange,
    unassignedOnly,
    unseenOnly,
  ]);

  const sourceAlerts = useMemo(
    () => applyAlertOverrides(applyAlertAssignments(alertsQuery.data ?? [])),
    [alertsQuery.data, applyAlertAssignments, applyAlertOverrides],
  );

  useEffect(() => {
    return () => {
      Object.values(highlightTimeoutsRef.current).forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
      highlightTimeoutsRef.current = {};
    };
  }, []);

  useEffect(() => {
    if (status !== 'open') {
      previousOpenAlertIdsRef.current = null;
      setHighlightedAlertIds([]);
      Object.values(highlightTimeoutsRef.current).forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
      highlightTimeoutsRef.current = {};
      return;
    }

    if (!alertsQuery.data) {
      return;
    }

    const currentIds = sourceAlerts.map((alert) => alert._id);
    const previousIds = previousOpenAlertIdsRef.current;

    if (!previousIds) {
      previousOpenAlertIdsRef.current = currentIds;
      return;
    }

    const incomingIds = findNewIds(previousIds, currentIds);
    if (incomingIds.length > 0) {
      setHighlightedAlertIds((current) => mergeUniqueIds(current, incomingIds));

      incomingIds.forEach((alertId) => {
        const existingTimeout = highlightTimeoutsRef.current[alertId];
        if (existingTimeout) {
          window.clearTimeout(existingTimeout);
        }

        highlightTimeoutsRef.current[alertId] = window.setTimeout(() => {
          setHighlightedAlertIds((current) => removeIds(current, [alertId]));
          delete highlightTimeoutsRef.current[alertId];
        }, NEW_ALERT_HIGHLIGHT_TTL_MS);
      });
    }

    previousOpenAlertIdsRef.current = currentIds;
  }, [alertsQuery.data, sourceAlerts, status]);

  const openAlertsForOverview = useMemo(() => {
    if (status === 'open') {
      return sourceAlerts;
    }

    const cachedOpenAlerts = queryClient.getQueryData<AlertItem[]>(clinicianQueryKeys.alerts('open')) ?? [];
    return applyAlertOverrides(applyAlertAssignments(cachedOpenAlerts));
  }, [applyAlertAssignments, applyAlertOverrides, queryClient, sourceAlerts, status]);

  const visibleAlerts = useMemo(() => {
    const filtered = filterAlerts(sourceAlerts, {
      searchValue,
      sourceFilter,
      timeRange,
      unseenOnly,
      assignedToMeOnly,
      unassignedOnly,
      overriddenOnly,
      clinicianId,
      seenAlertMap,
      status,
    });

    return sortAlerts(filtered, sortOrder);
  }, [
    assignedToMeOnly,
    clinicianId,
    searchValue,
    seenAlertMap,
    sortOrder,
    sourceAlerts,
    sourceFilter,
    status,
    timeRange,
    overriddenOnly,
    unassignedOnly,
    unseenOnly,
  ]);

  const unseenCount = useMemo(
    () => sourceAlerts.filter((alert) => isAlertUnseenForUi(alert, seenAlertMap)).length,
    [seenAlertMap, sourceAlerts],
  );

  const activeAlert = useMemo(() => {
    if (!selectedAlert) {
      return null;
    }

    const latest = sourceAlerts.find((item) => item._id === selectedAlert._id);
    return latest ?? selectedAlert;
  }, [selectedAlert, sourceAlerts]);

  const showInitialLoading = alertsQuery.isLoading && sourceAlerts.length === 0;
  const overviewLoading = status === 'open' && alertsQuery.isLoading && sourceAlerts.length === 0;
  const alertKpis = useMemo(
    () => computeAlertKpis(openAlertsForOverview, seenAlertMap, clinicianId),
    [clinicianId, openAlertsForOverview, seenAlertMap],
  );
  const allClear = !overviewLoading && !alertsQuery.error && connection.online && alertKpis.openCount === 0;
  const activeAlertSeen = activeAlert ? isAlertSeenForUi(activeAlert, seenAlertMap) : false;
  const fetchError = alertsQuery.error ? asAppError(alertsQuery.error) : null;
  const staleDataAvailable = sourceAlerts.length > 0;
  const staleErrorBannerVisible = Boolean(fetchError && staleDataAvailable);
  const blockingErrorVisible = Boolean(fetchError && !staleDataAvailable && connection.online);
  const blockingOfflineVisible = !connection.online && !staleDataAvailable && !fetchError;
  const errorView = fetchError ? toErrorView(fetchError) : null;
  const troubleshootingDetails =
    fetchError || !connection.online
      ? {
          endpoint: connection.lastEndpoint,
          status: connection.lastHttpStatus,
          timestamp: formatTroubleshootingTime(connection.lastErrorAt),
        }
      : undefined;

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

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const onRetry = (): void => {
      retryAlerts();
    };

    window.addEventListener(RETRY_EVENT, onRetry);
    return () => window.removeEventListener(RETRY_EVENT, onRetry);
  }, [retryAlerts]);

  function handleStatusChange(nextStatus: AlertStatus): void {
    setStatus(nextStatus);
    setSelectedAlert(null);

    if (nextStatus === 'open') {
      persistAlertsWorkspaceState({ status: nextStatus }, { persistSearch: false });
      return;
    }

    setUnseenOnly(false);
    setAssignedToMeOnly(false);
    setUnassignedOnly(false);
    setOverriddenOnly(false);
    persistAlertsWorkspaceState(
      {
        status: nextStatus,
        unseenOnly: false,
        assignedToMeOnly: false,
        unassignedOnly: false,
        overriddenOnly: false,
      },
      { persistSearch: false },
    );
  }

  function markSeen(alert: AlertItem): void {
    if (alert.status !== 'open') {
      return;
    }

    setSeenAlertMap((current) => {
      if (isAlertSeenForUi(alert, current)) {
        return current;
      }

      return markSeenInStore(alert._id, clinicianId);
    });
  }

  function openAlert(alert: AlertItem, triggerElement?: HTMLElement | null): void {
    if (triggerElement) {
      drawerFocusReturnRef.current = triggerElement;
    }

    markSeen(alert);
    setSelectedAlert(alert);
  }

  const queueFollowThroughText = useMemo(() => {
    if (status === 'open') {
      if (visibleAlerts.length > 0) {
        return `${visibleAlerts.length} open alert${
          visibleAlerts.length === 1 ? '' : 's'
        } still need review in this queue.`;
      }

      if (sourceAlerts.length === 0) {
        return 'Open triage is clear in this current view.';
      }

      return 'Current filters hide the remaining open alerts in this queue.';
    }

    if (visibleAlerts.length > 0) {
      return `${visibleAlerts.length} ${status} alert${
        visibleAlerts.length === 1 ? '' : 's'
      } remain available in this view.`;
    }

    return `No ${status} alerts are in this current view right now.`;
  }, [sourceAlerts.length, status, visibleAlerts.length]);

  const triageOutcomeTitle =
    lastTriageOutcome?.status === 'resolved' ? 'Alert resolved' : 'Alert acknowledged';
  const triageOutcomeDestinationLabel =
    lastTriageOutcome?.status === 'resolved' ? 'Resolved' : 'Acknowledged';
  const triageOutcomeFollowThrough =
    visibleAlerts.length > 0
      ? 'Open triage still needs review in this queue.'
      : 'Open triage is clear.';

  async function handleStatusUpdate(
    nextStatus: 'acknowledged' | 'resolved',
    alert: AlertItem,
  ): Promise<void> {
    setActionError(null);
    setLastTriageOutcome(null);
    assignments.clearAssignmentError();
    overrides.clearOverrideError();

    try {
      const updatedAlert = await updateAlertMutation.mutateAsync({
        id: alert._id,
        status: nextStatus,
      });

      setSelectedAlert((current) => {
        if (!current || current._id !== updatedAlert._id) {
          return current;
        }

        if (status === 'open') {
          return null;
        }

        return updatedAlert;
      });

      if (status !== 'open') {
        return;
      }

      const refreshedOpenResult = await alertsQuery.refetch();
      if (refreshedOpenResult.error || !Array.isArray(refreshedOpenResult.data)) {
        return;
      }

      const refreshedVisibleOpenAlerts = sortAlerts(
        filterAlerts(
          applyAlertOverrides(applyAlertAssignments(refreshedOpenResult.data)),
          {
            searchValue,
            sourceFilter,
            timeRange,
            unseenOnly,
            assignedToMeOnly,
            unassignedOnly,
            overriddenOnly,
            clinicianId,
            seenAlertMap,
            status: 'open',
          },
        ),
        sortOrder,
      );

      if (refreshedVisibleOpenAlerts.some((item) => item._id === updatedAlert._id)) {
        return;
      }

      setLastTriageOutcome({
        patientId: updatedAlert.patientId,
        status: nextStatus,
      });
    } catch (error) {
      setLastTriageOutcome(null);
      const appError = asAppError(error);
      setActionError(toUserMessage(appError));
    }
  }

  async function handleAssignToMe(alert: AlertItem): Promise<void> {
    setActionError(null);
    assignments.clearAssignmentError();
    overrides.clearOverrideError();
    const result = await assignments.assignToMe(alert);
    if (!result.ok && result.message) {
      setActionError(result.message);
    }
  }

  async function handleTakeOver(alert: AlertItem): Promise<void> {
    setActionError(null);
    assignments.clearAssignmentError();
    overrides.clearOverrideError();
    const result = await assignments.takeOver(alert);
    if (!result.ok && result.message) {
      setActionError(result.message);
    }
  }

  async function handleUnassign(alert: AlertItem): Promise<void> {
    setActionError(null);
    assignments.clearAssignmentError();
    overrides.clearOverrideError();
    const result = await assignments.unassignFromMe(alert);
    if (!result.ok && result.message) {
      setActionError(result.message);
    }
  }

  async function handleSaveRiskOverride(
    alert: AlertItem,
    payload: { riskFinal: string; overrideReason?: string },
  ): Promise<void> {
    setActionError(null);
    overrides.clearOverrideError();
    const result = await overrides.saveOverride(alert, payload);
    if (!result.ok && result.message) {
      setActionError(result.message);
    }
  }

  async function handleClearRiskOverride(alert: AlertItem): Promise<void> {
    setActionError(null);
    overrides.clearOverrideError();
    const result = await overrides.clearOverride(alert);
    if (!result.ok && result.message) {
      setActionError(result.message);
    }
  }

  function openAlertsExportModal(): void {
    setAlertsExportOpen(true);
    setAlertsExportRange(getPresetDateRange('last7'));
    setAlertsExportStatuses(createDefaultExportStatuses(status));
    setAlertsExportIncludeNotifications(true);
    setAlertsExportIncludeAdvancedFields(true);
    setAlertsExportPreviewCount(0);
    setAlertsExportError(null);
  }

  async function handleAlertsExportDownload(): Promise<void> {
    if (alertsExportRangeError) {
      setAlertsExportError(alertsExportRangeError);
      return;
    }

    if (selectedAlertsExportStatuses.length === 0) {
      setAlertsExportError('Select at least one status to export.');
      return;
    }

    setAlertsExportDownloadLoading(true);
    setAlertsExportError(null);

    try {
      const filteredAlerts = await collectAlertsForExport(selectedAlertsExportStatuses);
      if (filteredAlerts.length === 0) {
        setAlertsExportError('No data in selected range.');
        return;
      }

      const exportOptions = {
        includeNotificationFields: alertsExportIncludeNotifications,
        includeAdvancedFields: alertsExportIncludeAdvancedFields,
      };

      const rows = buildAlertExportRows(filteredAlerts, exportOptions);
      const columns = buildAlertExportColumns(exportOptions);
      const csv = toCsv(rows, columns);

      downloadCsv(createAlertsCsvFilename(alertsExportRange), csv);
      setAlertsExportOpen(false);
    } catch (error) {
      setAlertsExportError(toUserMessage(asAppError(error)));
    } finally {
      setAlertsExportDownloadLoading(false);
    }
  }

  const alertsExportSummary = alertsExportPreviewLoading
    ? `Calculating export preview for ${formatExportDateRangeSummary(alertsExportRange)}...`
    : `Exporting ${alertsExportPreviewCount} alerts from ${formatExportDateRangeSummary(alertsExportRange)}.`;

  const alertsExportDownloadDisabled =
    alertsExportPreviewLoading ||
    alertsExportDownloadLoading ||
    Boolean(alertsExportRangeError) ||
    selectedAlertsExportStatuses.length === 0 ||
    alertsExportPreviewCount === 0;
  const queueCountLabel = `${visibleAlerts.length} ${status} alert${
    visibleAlerts.length === 1 ? '' : 's'
  } in view`;
  const updatedAtLabel = `Updated ${formatLastUpdated(connection.lastSuccessAt)}`;
  const statusViewLabel = formatStatusViewLabel(status);
  const runtimeHighlightedAlertIds =
    notificationPreferences.effectiveSafetyCueMode === 'reduced' ? [] : highlightedAlertIds;
  const acknowledgedAlertsForOverview = useMemo(() => {
    if (status === 'acknowledged') {
      return sourceAlerts;
    }

    const cachedAcknowledgedAlerts =
      queryClient.getQueryData<AlertItem[]>(clinicianQueryKeys.alerts('acknowledged')) ?? [];
    return applyAlertOverrides(applyAlertAssignments(cachedAcknowledgedAlerts));
  }, [applyAlertAssignments, applyAlertOverrides, queryClient, sourceAlerts, status]);
  const resolvedAlertsForOverview = useMemo(() => {
    if (status === 'resolved') {
      return sourceAlerts;
    }

    const cachedResolvedAlerts =
      queryClient.getQueryData<AlertItem[]>(clinicianQueryKeys.alerts('resolved')) ?? [];
    return applyAlertOverrides(applyAlertAssignments(cachedResolvedAlerts));
  }, [applyAlertAssignments, applyAlertOverrides, queryClient, sourceAlerts, status]);
  const statusTabCounts = useMemo(
    () => ({
      open: alertKpis.openCount,
      acknowledged: acknowledgedAlertsForOverview.length,
      resolved: resolvedAlertsForOverview.length,
    }),
    [acknowledgedAlertsForOverview.length, alertKpis.openCount, resolvedAlertsForOverview.length],
  );
  const alertStatusNarrative = allClear
    ? 'No open safety issues currently need clinician review in this browser session.'
    : alertKpis.overdueCount > 0
      ? `${alertKpis.overdueCount} open alert${alertKpis.overdueCount === 1 ? '' : 's'} are older than 24h and should lead triage.`
      : alertKpis.unseenCount > 0
        ? `${alertKpis.unseenCount} alert${alertKpis.unseenCount === 1 ? '' : 's'} still need first clinician review.`
        : alertKpis.notifFailedCount > 0
          ? `${alertKpis.notifFailedCount} alert deliver${alertKpis.notifFailedCount === 1 ? 'y issue remains' : 'y issues remain'} while open triage continues.`
        : `${alertKpis.openCount} open alert${alertKpis.openCount === 1 ? '' : 's'} remain active in the current safety queue.`;
  const unassignedAlertsCount = useMemo(
    () => openAlertsForOverview.filter((alert) => alert.status === 'open' && !alert.assignedTo).length,
    [openAlertsForOverview],
  );
  const safetyBriefTitle = allClear
    ? 'Open triage is clear'
    : alertKpis.overdueCount > 0
      ? 'Aging alerts need review'
      : unassignedAlertsCount > 0
        ? 'Ownership needs a decision'
        : alertKpis.unseenCount > 0
          ? 'First review is still waiting'
          : 'Safety review is active';
  const safetyDetailTitle = activeAlert
    ? `Reviewing ${activeAlert.patientId}`
    : status === 'open'
      ? 'Select an alert to review'
      : `Select a ${status} alert to inspect`;
  const safetyDetailSupport = activeAlert
    ? reasonText(activeAlert.reason)
    : status === 'open'
      ? 'Keep patient context, ownership, and next actions visible while you work the queue.'
      : 'Use the queue to inspect earlier decisions without reopening the whole page.';
  const alertAgingComposition = useMemo(
    () => [
      {
        key: 'aged',
        label: 'Older than 24h',
        value: alertKpis.overdueCount,
      },
      {
        key: 'fresh',
        label: 'Last 24h',
        value: alertKpis.createdLast24hCount,
      },
    ],
    [alertKpis.createdLast24hCount, alertKpis.overdueCount],
  );

  return (
    <Stack
      className="page-stack dashboard-page-shell dashboard-page-shell--alerts alerts-page alerts-page--safety-phase4"
      gap="5"
    >
      {/*
        Acceptance test plan summary:
        1) Open /alerts and verify queue renders.
        2) Open a row and acknowledge in drawer (2-click path).
        3) Verify acknowledged item leaves Open and appears in Acknowledged tab.
        4) Observe last-updated timestamp changes while Open tab polling is active.
        5) Simulate offline and verify non-blocking banner while existing data remains.
        6) Verify search/source/time filters and mobile card layout.
      */}
      <Section
        className="dashboard-page-header dashboard-page-header--alerts alerts-page__header"
        eyebrow="Safety operations"
        title="Safety"
        subtitle="Triage active safety issues, confirm ownership quickly, and close escalations with grounded clinical context."
        meta={
          <span className="alerts-page__meta" aria-live="polite">
            <span className="alerts-page__meta-pill">{statusViewLabel}</span>
            <span className="alerts-page__meta-pill">{updatedAtLabel}</span>
          </span>
        }
      />

      {staleErrorBannerVisible ? (
        <AlertBanner
          variant="warning"
          title="Service temporarily unavailable"
          action={<RetryButton onRetry={retryAlerts} loading={alertsQuery.isFetching} />}
        >
          Showing last known data from {formatLastUpdated(connection.lastSuccessAt)}.
        </AlertBanner>
      ) : null}

      {actionError ? (
        <AlertBanner variant="error" title="Action failed">
          {actionError}
        </AlertBanner>
      ) : null}

      {assignments.assignmentError ? (
        <AlertBanner variant="error" title="Assignment update failed">
          {assignments.assignmentError}
        </AlertBanner>
      ) : null}

      {overrides.overrideError ? (
        <AlertBanner variant="error" title="Risk override update failed">
          {overrides.overrideError}
        </AlertBanner>
      ) : null}

      <section className="safety-brief" aria-label="Safety triage summary">
        <div className="safety-brief__lead">
          <div className="safety-brief__copy">
            <p className="safety-brief__eyebrow">Safety triage</p>
            <h3 className="safety-brief__title">{safetyBriefTitle}</h3>
            <p className="safety-brief__text">{alertStatusNarrative}</p>
          </div>
          <div className="safety-brief__mode">
            <p className="safety-brief__mode-label">Review mode</p>
            <StatusTabs value={status} onChange={handleStatusChange} counts={statusTabCounts} />
          </div>
        </div>
        <div className="safety-brief__facts" role="list" aria-label="Triage priorities">
          <article className="safety-brief__fact safety-brief__fact--open" role="listitem">
            <p className="safety-brief__fact-label">Open alerts</p>
            <p className="safety-brief__fact-value">{overviewLoading ? '...' : alertKpis.openCount}</p>
            <p className="safety-brief__fact-detail">{queueCountLabel}</p>
          </article>
          <article className="safety-brief__fact safety-brief__fact--aging" role="listitem">
            <p className="safety-brief__fact-label">Aging pressure</p>
            <p className="safety-brief__fact-value">{overviewLoading ? '...' : alertKpis.overdueCount}</p>
            <p className="safety-brief__fact-detail">
              {alertAgingComposition[1]?.value ?? 0} opened within the last 24h
            </p>
          </article>
          <article className="safety-brief__fact safety-brief__fact--ownership" role="listitem">
            <p className="safety-brief__fact-label">Assigned to me</p>
            <p className="safety-brief__fact-value">
              {overviewLoading ? '...' : alertKpis.assignedToMeCount}
            </p>
            <p className="safety-brief__fact-detail">
              {unassignedAlertsCount} without an owner
            </p>
          </article>
          <article className="safety-brief__fact safety-brief__fact--delivery" role="listitem">
            <p className="safety-brief__fact-label">Delivery issues</p>
            <p className="safety-brief__fact-value">
              {overviewLoading ? '...' : alertKpis.notifFailedCount}
            </p>
            <p className="safety-brief__fact-detail">
              {alertKpis.unseenCount} still need first review
            </p>
          </article>
        </div>
      </section>

      <div className="safety-layout">
        <section className="safety-queue-surface" aria-label="Safety triage workspace">
          <header className="safety-queue-surface__header">
            <div className="safety-queue-surface__intro">
              {openedFromChat ? (
                <p className="alerts-chat-origin-note" data-testid="alerts-chat-origin-note">
                  {chatOriginPatientId
                    ? `Opened from patient communication for ${chatOriginPatientId}. Keep alert review anchored to this patient context.`
                    : 'Opened from patient communication. Keep alert review anchored to the current patient context.'}
                </p>
              ) : null}
              <p className="safety-queue-surface__eyebrow">Triage workspace</p>
              <h3 className="safety-queue-surface__title">Alert list</h3>
              <p className="safety-queue-surface__text">{queueFollowThroughText}</p>
            </div>
            <div className="safety-queue-surface__meta" aria-live="polite">
              <span className="safety-queue-surface__meta-pill">{statusViewLabel}</span>
              <span className="safety-queue-surface__meta-pill">{queueCountLabel}</span>
              {isMobileLayout ? (
                <Button
                  className="safety-queue-surface__export"
                  variant="secondary"
                  size="sm"
                  onClick={openAlertsExportModal}
                >
                  Export CSV
                </Button>
              ) : null}
            </div>
          </header>

          <div className="safety-queue-surface__controls">
            <FiltersBar
              status={status}
              searchValue={searchValue}
              sourceFilter={sourceFilter}
              timeRange={timeRange}
              sortOrder={sortOrder}
              unseenOnly={unseenOnly}
              unseenCount={unseenCount}
              assignedToMeOnly={assignedToMeOnly}
              unassignedOnly={unassignedOnly}
              overriddenOnly={overriddenOnly}
              refreshing={alertsQuery.isFetching}
              onSearchValueChange={(value) => {
                searchPersistenceEnabledRef.current = true;
                setSearchValue(value);
              }}
              onSourceFilterChange={(value) => {
                setSourceFilter(value);
                persistAlertsWorkspaceState({ sourceFilter: value }, { persistSearch: false });
              }}
              onTimeRangeChange={(value) => {
                setTimeRange(value);
                persistAlertsWorkspaceState({ timeRange: value }, { persistSearch: false });
              }}
              onSortOrderChange={(value) => {
                setSortOrder(value);
                persistAlertsWorkspaceState({ sortOrder: value }, { persistSearch: false });
              }}
              onUnseenOnlyChange={(value) => {
                setUnseenOnly(value);
                persistAlertsWorkspaceState({ unseenOnly: value }, { persistSearch: false });
              }}
              onAssignedToMeOnlyChange={(value) => {
                setAssignedToMeOnly(value);
                const nextUnassignedOnly = value ? false : unassignedOnly;
                if (value) {
                  setUnassignedOnly(false);
                }
                persistAlertsWorkspaceState(
                  {
                    assignedToMeOnly: value,
                    unassignedOnly: nextUnassignedOnly,
                  },
                  { persistSearch: false },
                );
              }}
              onUnassignedOnlyChange={(value) => {
                setUnassignedOnly(value);
                const nextAssignedToMeOnly = value ? false : assignedToMeOnly;
                if (value) {
                  setAssignedToMeOnly(false);
                }
                persistAlertsWorkspaceState(
                  {
                    assignedToMeOnly: nextAssignedToMeOnly,
                    unassignedOnly: value,
                  },
                  { persistSearch: false },
                );
              }}
              onOverriddenOnlyChange={(value) => {
                setOverriddenOnly(value);
                persistAlertsWorkspaceState({ overriddenOnly: value }, { persistSearch: false });
              }}
              onRefresh={() => {
                void alertsQuery.refetch();
              }}
            />
          </div>

          <div className="safety-queue-surface__results">
            {status === 'open' && lastTriageOutcome && isMobileLayout ? (
              <div
                className={`alerts-triage-outcome alerts-triage-outcome--${lastTriageOutcome.status}`}
                data-testid="alerts-triage-outcome"
                role="status"
                aria-live="polite"
              >
                <div className="alerts-triage-outcome__copy">
                  <p className="alerts-triage-outcome__eyebrow">Latest triage</p>
                  <strong className="alerts-triage-outcome__title">{triageOutcomeTitle}</strong>
                  <p className="alerts-triage-outcome__text">
                    Alert for {lastTriageOutcome.patientId} moved out of Open and is now visible in{' '}
                    {triageOutcomeDestinationLabel}.
                  </p>
                  <p className="alerts-triage-outcome__next">{triageOutcomeFollowThrough}</p>
                </div>
                <div className="alerts-triage-outcome__actions">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      handleStatusChange(lastTriageOutcome.status);
                    }}
                  >
                    {lastTriageOutcome.status === 'resolved' ? 'View resolved' : 'View acknowledged'}
                  </Button>
                </div>
              </div>
            ) : null}

            {showInitialLoading ? (
              <div className="alerts-skeleton-stack" aria-label="Alerts loading placeholder">
                <Skeleton height={72} />
                <Skeleton height={72} />
                <Skeleton height={72} />
                <Skeleton height={72} />
              </div>
            ) : blockingErrorVisible && errorView ? (
              <StatusPanel
                variant={errorView.variant === 'warning' ? 'error' : errorView.variant}
                title="Unable to load alerts"
                description={errorView.description}
                actions={<RetryButton onRetry={retryAlerts} loading={alertsQuery.isFetching} />}
                details={troubleshootingDetails}
              />
            ) : blockingOfflineVisible ? (
              <StatusPanel
                variant="info"
                title="Offline"
                description="No cached alerts are available yet. Reconnect and retry."
                actions={<RetryButton onRetry={retryAlerts} loading={alertsQuery.isFetching} />}
                details={troubleshootingDetails}
              />
            ) : status === 'open' && sourceAlerts.length === 0 ? (
              <div className="alerts-empty-state alerts-empty-state--all-clear" role="status" aria-live="polite">
                <div className="alerts-empty-state__title-row">
                  <span className="alerts-empty-state__icon" aria-hidden="true">
                    ✓
                  </span>
                  <h3 className="alerts-empty-state__title">All clear</h3>
                </div>
                <p className="alerts-empty-state__description">No open alerts need attention right now.</p>
                <p className="alerts-empty-state__meta">
                  System monitoring is active. Last updated {formatLastUpdated(connection.lastSuccessAt)}.
                </p>
                <div className="alerts-empty-state__actions">
                  <Button
                    className="alerts-empty-state__refresh"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      void alertsQuery.refetch();
                    }}
                    disabled={alertsQuery.isFetching}
                  >
                    {alertsQuery.isFetching ? 'Refreshing...' : 'Refresh alerts'}
                  </Button>
                </div>
              </div>
            ) : sourceAlerts.length === 0 ? (
              <div className="alerts-empty-state" role="status" aria-live="polite">
                <div className="alerts-empty-state__title-row">
                  <span className="alerts-empty-state__icon" aria-hidden="true">
                    ○
                  </span>
                  <h3 className="alerts-empty-state__title">{`No ${status} alerts`}</h3>
                </div>
                <p className="alerts-empty-state__description">
                  Alerts in this queue will appear here as they are updated.
                </p>
                <p className="alerts-empty-state__meta">Switch queues or refresh when new triage work lands.</p>
              </div>
            ) : visibleAlerts.length === 0 ? (
              <div className="alerts-empty-state alerts-empty-state--filtered" role="status" aria-live="polite">
                <div className="alerts-empty-state__title-row">
                  <span className="alerts-empty-state__icon" aria-hidden="true">
                    ○
                  </span>
                  <h3 className="alerts-empty-state__title">No results</h3>
                </div>
                <p className="alerts-empty-state__description">Try clearing filters or searching by patient ID.</p>
                <p className="alerts-empty-state__meta">
                  The triage toolbar is currently narrowing every alert out of this view.
                </p>
              </div>
            ) : isMobileLayout ? (
              <AlertCardList
                alerts={visibleAlerts}
                seenAlertMap={seenAlertMap}
                highlightedAlertIds={runtimeHighlightedAlertIds}
                clinicianId={clinicianId}
                mutationPending={updateAlertMutation.isPending}
                assignmentPending={assignments.assignmentBusy}
                onOpen={openAlert}
                onAssignToMe={handleAssignToMe}
                onTakeOver={handleTakeOver}
                onAcknowledge={(alert) => {
                  void handleStatusUpdate('acknowledged', alert);
                }}
                onResolve={(alert) => {
                  void handleStatusUpdate('resolved', alert);
                }}
              />
            ) : (
              <AlertsTable
                alerts={visibleAlerts}
                seenAlertMap={seenAlertMap}
                highlightedAlertIds={runtimeHighlightedAlertIds}
                clinicianId={clinicianId}
                mutationPending={updateAlertMutation.isPending}
                assignmentPending={assignments.assignmentBusy}
                onOpen={openAlert}
                onAssignToMe={handleAssignToMe}
                onTakeOver={handleTakeOver}
                onAcknowledge={(alert) => {
                  void handleStatusUpdate('acknowledged', alert);
                }}
                onResolve={(alert) => {
                  void handleStatusUpdate('resolved', alert);
                }}
              />
            )}
          </div>
        </section>

        {!isMobileLayout ? (
          <aside className="safety-detail-rail" aria-label="Persistent alert detail">
            <section className="safety-detail-rail__support">
              <div className="safety-detail-rail__support-copy">
                <p className="safety-detail-rail__eyebrow">Detail context</p>
                <h3 className="safety-detail-rail__title">{safetyDetailTitle}</h3>
                <p className="safety-detail-rail__text">{safetyDetailSupport}</p>
              </div>
              <div className="safety-detail-rail__support-actions">
                <Button
                  className="safety-detail-rail__export"
                  variant="secondary"
                  size="sm"
                  onClick={openAlertsExportModal}
                >
                  Export CSV
                </Button>
                <div className="safety-detail-rail__support-facts" aria-live="polite">
                  <span className="safety-detail-rail__support-pill">{updatedAtLabel}</span>
                  <span className="safety-detail-rail__support-pill">{statusViewLabel}</span>
                </div>
              </div>
            </section>

            {status === 'open' && lastTriageOutcome && !activeAlert ? (
              <div
                className={`alerts-triage-outcome alerts-triage-outcome--${lastTriageOutcome.status} alerts-triage-outcome--side`}
                data-testid="alerts-triage-outcome"
                role="status"
                aria-live="polite"
              >
                <div className="alerts-triage-outcome__copy">
                  <p className="alerts-triage-outcome__eyebrow">Latest triage</p>
                  <strong className="alerts-triage-outcome__title">{triageOutcomeTitle}</strong>
                  <p className="alerts-triage-outcome__text">
                    Alert for {lastTriageOutcome.patientId} moved out of Open and is now visible in{' '}
                    {triageOutcomeDestinationLabel}.
                  </p>
                  <p className="alerts-triage-outcome__next">{triageOutcomeFollowThrough}</p>
                </div>
                <div className="alerts-triage-outcome__actions">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      handleStatusChange(lastTriageOutcome.status);
                    }}
                  >
                    {lastTriageOutcome.status === 'resolved' ? 'View resolved' : 'View acknowledged'}
                  </Button>
                </div>
              </div>
            ) : null}

            {activeAlert ? (
              <AlertDetailDrawer
                presentation="inline"
                open={Boolean(activeAlert)}
                alert={activeAlert}
                mutationPending={updateAlertMutation.isPending}
                assignmentPending={assignments.assignmentBusy}
                overridePending={overrides.overrideBusy}
                clinicianId={clinicianId}
                seen={activeAlertSeen}
                returnFocusRef={drawerFocusReturnRef}
                onOpenPatient={openPatientFromAlert}
                onClose={() => setSelectedAlert(null)}
                onAssignToMe={handleAssignToMe}
                onTakeOver={handleTakeOver}
                onUnassign={handleUnassign}
                onSaveRiskOverride={handleSaveRiskOverride}
                onClearRiskOverride={handleClearRiskOverride}
                onAcknowledge={(alert) => {
                  void handleStatusUpdate('acknowledged', alert);
                }}
                onResolve={(alert) => {
                  void handleStatusUpdate('resolved', alert);
                }}
              />
            ) : (
              <section className="safety-detail-empty" role="dialog" aria-modal="false" aria-label="Alert detail">
                <p className="safety-detail-empty__eyebrow">Persistent detail</p>
                <h3 className="safety-detail-empty__title">No alert selected</h3>
                <p className="safety-detail-empty__text">
                  Choose an alert from the list to keep patient context, ownership, and action controls visible beside the queue.
                </p>
              </section>
            )}
          </aside>
        ) : null}
      </div>

      <ExportCsvModal
        open={alertsExportOpen}
        title="Export Alerts CSV"
        description="Use the date range and status filters to export the alert review window."
        range={alertsExportRange}
        rangeError={alertsExportRangeError}
        summary={alertsExportError ?? alertsExportSummary}
        loading={alertsExportPreviewLoading || alertsExportDownloadLoading}
        downloadDisabled={alertsExportDownloadDisabled}
        disableReason={
          alertsExportRangeError ??
          (selectedAlertsExportStatuses.length === 0 ? 'Select at least one status.' : undefined) ??
          (alertsExportPreviewCount === 0 ? 'No data in selected range.' : undefined)
        }
        statusOptions={{
          selected: alertsExportStatuses,
          onChange: (statusValue, checked) => {
            setAlertsExportStatuses((current) => ({
              ...current,
              [statusValue]: checked,
            }));
          },
        }}
        toggles={[
          {
            id: 'export-alerts-notification-fields',
            label: 'Include notification fields',
            checked: alertsExportIncludeNotifications,
            onChange: setAlertsExportIncludeNotifications,
          },
          {
            id: 'export-alerts-advanced-fields',
            label: 'Include advanced alert fields',
            checked: alertsExportIncludeAdvancedFields,
            onChange: setAlertsExportIncludeAdvancedFields,
          },
        ]}
        onRangeChange={setAlertsExportRange}
        onClose={() => setAlertsExportOpen(false)}
        onDownload={() => {
          void handleAlertsExportDownload();
        }}
      />

      {isMobileLayout ? (
        <AlertDetailDrawer
          open={Boolean(activeAlert)}
          alert={activeAlert}
          mutationPending={updateAlertMutation.isPending}
          assignmentPending={assignments.assignmentBusy}
          overridePending={overrides.overrideBusy}
          clinicianId={clinicianId}
          seen={activeAlertSeen}
          returnFocusRef={drawerFocusReturnRef}
          onOpenPatient={openPatientFromAlert}
          onClose={() => setSelectedAlert(null)}
          onAssignToMe={handleAssignToMe}
          onTakeOver={handleTakeOver}
          onUnassign={handleUnassign}
          onSaveRiskOverride={handleSaveRiskOverride}
          onClearRiskOverride={handleClearRiskOverride}
          onAcknowledge={(alert) => {
            void handleStatusUpdate('acknowledged', alert);
          }}
          onResolve={(alert) => {
            void handleStatusUpdate('resolved', alert);
          }}
        />
      ) : null}
    </Stack>
  );
}
