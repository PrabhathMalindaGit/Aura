import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { AlertItem, AlertStatus } from '../types/models';
import { AlertCardList } from '../components/alerts/AlertCardList';
import { AlertDetailDrawer } from '../components/alerts/AlertDetailDrawer';
import { AlertsTable } from '../components/alerts/AlertsTable';
import { KpiRow } from '../components/overview/KpiRow';
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
import { Card } from '../components/ui/Card';
import { Section } from '../components/ui/Section';
import { RetryButton } from '../components/system/RetryButton';
import { StatusPanel } from '../components/system/StatusPanel';
import { Skeleton } from '../components/ui/Skeleton';
import { Stack } from '../components/ui/Stack';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useAssignment } from '../hooks/useAssignment';
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
import { cn } from '../utils/cn';

const POLLING_INTERVAL_MS = 12_000;
const SEEN_PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const RETRY_EVENT = 'aura:retry';

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
  const [status, setStatus] = useState<AlertStatus>('open');
  const [selectedAlert, setSelectedAlert] = useState<AlertItem | null>(null);
  const [searchValue, setSearchValue] = useState('');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [timeRange, setTimeRange] = useState<TimeRangeFilter>('7d');
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');
  const [unseenOnly, setUnseenOnly] = useState(false);
  const [assignedToMeOnly, setAssignedToMeOnly] = useState(false);
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [overriddenOnly, setOverriddenOnly] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
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
    setSelectedAlert(null);
  }, [status]);

  useEffect(() => {
    if (status === 'open') {
      return;
    }

    setUnseenOnly(false);
    setAssignedToMeOnly(false);
    setUnassignedOnly(false);
    setOverriddenOnly(false);
  }, [status]);

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

  function handleStatusUpdate(nextStatus: 'acknowledged' | 'resolved', alert: AlertItem): void {
    setActionError(null);
    assignments.clearAssignmentError();
    overrides.clearOverrideError();

    updateAlertMutation.mutate(
      { id: alert._id, status: nextStatus },
      {
        onSuccess: (updatedAlert) => {
          setSelectedAlert((current) => {
            if (!current || current._id !== updatedAlert._id) {
              return current;
            }

            if (status === 'open') {
              return null;
            }

            return updatedAlert;
          });
        },
        onError: (error) => {
          const appError = asAppError(error);
          setActionError(toUserMessage(appError));
        },
      },
    );
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

  return (
    <Stack className="page-stack alerts-page" gap="5">
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
        className="dashboard-page-header alerts-page__header"
        eyebrow="Safety operations"
        title="Alerts"
        subtitle="Review active safety issues, confirm ownership, and close escalations with clear clinical context."
        meta={
          <span className="alerts-page__meta" aria-live="polite">
            <span className="alerts-page__meta-pill alerts-page__meta-pill--count">{queueCountLabel}</span>
            {status === 'open' ? (
              <span className="alerts-page__meta-pill">Unseen {unseenCount}</span>
            ) : null}
            {status === 'open' && alertKpis.assignedToMeCount > 0 ? (
              <span className="alerts-page__meta-pill">Assigned to you {alertKpis.assignedToMeCount}</span>
            ) : null}
            {alertKpis.notifFailedCount > 0 ? (
              <span className="alerts-page__meta-pill">Delivery issues {alertKpis.notifFailedCount}</span>
            ) : null}
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

      <section
        className={cn('alerts-summary-strip', allClear && 'alerts-summary-strip--all-clear')}
        aria-label="Alerts overview"
      >
        {allClear ? (
          <div className="alerts-all-clear" role="status" aria-live="polite">
            <div className="alerts-all-clear__heading">
              <span className="alerts-all-clear__icon" aria-hidden="true">
                ✓
              </span>
              <p className="alerts-all-clear__title">All clear</p>
            </div>
            <p className="alerts-all-clear__summary">No open alerts need attention right now.</p>
            <div className="alerts-all-clear__footer">
              <p className="alerts-all-clear__meta">Monitoring active · Last updated {formatLastUpdated(connection.lastSuccessAt)}</p>
              <Button
                className="alerts-all-clear__refresh"
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
        ) : (
          <>
            <div className="alerts-summary-strip__header">
              <h3 className="alerts-summary-strip__title">Attention now</h3>
              <p className="alerts-overview-note">
                Open workload, first-review visibility, ownership, and delivery follow-through at a glance.
              </p>
            </div>
            <KpiRow summary={alertKpis} loading={overviewLoading} />
          </>
        )}
      </section>

      <Card
        className="alerts-workspace-card"
        title={
          <span className="alerts-card-title">
            Alerts queue
            <span className="alerts-card-title__meta">Safety workspace</span>
          </span>
        }
        action={
          <Button className="alerts-workspace-card__export" variant="secondary" onClick={openAlertsExportModal}>
            Export CSV
          </Button>
        }
      >
        <div className="alerts-workspace-card__heading-row">
          <div className="alerts-workspace-card__heading-copy">
            <span className="alerts-workspace-card__eyebrow">Current queue</span>
            <p className="alerts-queue-intro">
              Review first visibility, ownership, and disposition from one tighter operational queue.
            </p>
          </div>
          <div className="alerts-workspace-card__heading-actions">
            <div className="alerts-workspace-card__queue-meta" aria-live="polite">
              <span className="alerts-workspace-card__queue-pill">{statusViewLabel}</span>
              <span className="alerts-workspace-card__queue-count">{queueCountLabel}</span>
            </div>
            <div className="alerts-status-tabs-wrap">
              <StatusTabs value={status} onChange={setStatus} />
            </div>
          </div>
        </div>

        <div className="alerts-workspace-card__controls">
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
            onSearchValueChange={setSearchValue}
            onSourceFilterChange={setSourceFilter}
            onTimeRangeChange={setTimeRange}
            onSortOrderChange={setSortOrder}
            onUnseenOnlyChange={setUnseenOnly}
            onAssignedToMeOnlyChange={(value) => {
              setAssignedToMeOnly(value);
              if (value) {
                setUnassignedOnly(false);
              }
            }}
            onUnassignedOnlyChange={(value) => {
              setUnassignedOnly(value);
              if (value) {
                setAssignedToMeOnly(false);
              }
            }}
            onOverriddenOnlyChange={setOverriddenOnly}
            onRefresh={() => {
              void alertsQuery.refetch();
            }}
          />
        </div>

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
          <div className="alerts-empty-state" role="status" aria-live="polite">
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
          <StatusPanel
            variant="empty"
            title={`No ${status} alerts`}
            description="Alerts in this queue will appear here as they are updated."
          />
        ) : visibleAlerts.length === 0 ? (
          <StatusPanel variant="empty" title="No results" description="Try clearing filters or searching by patient ID." />
        ) : isMobileLayout ? (
          <AlertCardList
            alerts={visibleAlerts}
            seenAlertMap={seenAlertMap}
            highlightedAlertIds={highlightedAlertIds}
            clinicianId={clinicianId}
            mutationPending={updateAlertMutation.isPending}
            assignmentPending={assignments.assignmentBusy}
            onOpen={openAlert}
            onAssignToMe={handleAssignToMe}
            onTakeOver={handleTakeOver}
            onAcknowledge={(alert) => handleStatusUpdate('acknowledged', alert)}
            onResolve={(alert) => handleStatusUpdate('resolved', alert)}
          />
        ) : (
          <AlertsTable
            alerts={visibleAlerts}
            seenAlertMap={seenAlertMap}
            highlightedAlertIds={highlightedAlertIds}
            clinicianId={clinicianId}
            mutationPending={updateAlertMutation.isPending}
            assignmentPending={assignments.assignmentBusy}
            onOpen={openAlert}
            onAssignToMe={handleAssignToMe}
            onTakeOver={handleTakeOver}
            onAcknowledge={(alert) => handleStatusUpdate('acknowledged', alert)}
            onResolve={(alert) => handleStatusUpdate('resolved', alert)}
          />
        )}
      </Card>

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

      <AlertDetailDrawer
        open={Boolean(activeAlert)}
        alert={activeAlert}
        mutationPending={updateAlertMutation.isPending}
        assignmentPending={assignments.assignmentBusy}
        overridePending={overrides.overrideBusy}
        clinicianId={clinicianId}
        seen={activeAlertSeen}
        returnFocusRef={drawerFocusReturnRef}
        onClose={() => setSelectedAlert(null)}
        onAssignToMe={handleAssignToMe}
        onTakeOver={handleTakeOver}
        onUnassign={handleUnassign}
        onSaveRiskOverride={handleSaveRiskOverride}
        onClearRiskOverride={handleClearRiskOverride}
        onAcknowledge={(alert) => handleStatusUpdate('acknowledged', alert)}
        onResolve={(alert) => handleStatusUpdate('resolved', alert)}
      />
    </Stack>
  );
}
