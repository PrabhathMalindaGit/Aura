import { useEffect, useMemo, useState, useRef } from 'react';
import type { AlertItem, AlertStatus } from '../types/models';
import { AlertCardList } from '../components/alerts/AlertCardList';
import { AlertDetailDrawer } from '../components/alerts/AlertDetailDrawer';
import { AlertsTable } from '../components/alerts/AlertsTable';
import {
  FiltersBar,
  type SortOrder,
  type SourceFilter,
  type TimeRangeFilter,
} from '../components/alerts/FiltersBar';
import { StatusTabs } from '../components/alerts/StatusTabs';
import { AlertBanner } from '../components/ui/AlertBanner';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
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
import { useAlerts, useUpdateAlertStatus } from '../services/clinicianApi';
import { useConnectionStatus } from '../services/connection';
import { asAppError, toUserMessage } from '../utils/errors';
import { hasRiskOverride } from '../utils/risk';
import { isAlertSeenForUi, isAlertUnseenForUi } from '../utils/seen';
import { isAfterWithinDays } from '../utils/time';

const POLLING_INTERVAL_MS = 12_000;
const SEEN_PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000;

function reasonText(reason: string | string[]): string {
  return Array.isArray(reason) ? reason.join(' ') : reason;
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

function useMobileLayout(query: string = '(max-width: 960px)'): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === 'undefined' || !window.matchMedia ? false : window.matchMedia(query).matches,
  );

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return;
    }

    const media = window.matchMedia(query);
    const listener = (event: MediaQueryListEvent): void => {
      setMatches(event.matches);
    };

    setMatches(media.matches);

    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', listener);
      return () => media.removeEventListener('change', listener);
    }

    media.addListener(listener);
    return () => media.removeListener(listener);
  }, [query]);

  return matches;
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

    if (!isAfterWithinDays(alert.createdAt, toDays(options.timeRange))) {
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

  const drawerFocusReturnRef = useRef<HTMLElement | null>(null);

  const documentHidden = useDocumentHidden();
  const isMobileLayout = useMobileLayout();
  const connection = useConnectionStatus();

  const shouldPollOpenAlerts = status === 'open' && connection.online && !documentHidden;

  const alertsQuery = useAlerts(status, {
    pollingEnabled: shouldPollOpenAlerts,
    pollingIntervalMs: POLLING_INTERVAL_MS,
  });
  const updateAlertMutation = useUpdateAlertStatus();
  const assignments = useAssignment({ clinicianId, clinicianName });
  const overrides = useRiskOverride({ clinicianId, clinicianName });

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

  const sourceAlerts = useMemo(
    () => overrides.applyAlertOverrides(assignments.applyAlertAssignments(alertsQuery.data ?? [])),
    [alertsQuery.data, assignments.applyAlertAssignments, overrides.applyAlertOverrides],
  );

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
  const activeAlertSeen = activeAlert ? isAlertSeenForUi(activeAlert, seenAlertMap) : false;

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

  return (
    <div className="page-stack">
      {/*
        Acceptance test plan summary:
        1) Open /alerts and verify queue renders.
        2) Open a row and acknowledge in drawer (2-click path).
        3) Verify acknowledged item leaves Open and appears in Acknowledged tab.
        4) Observe last-updated timestamp changes while Open tab polling is active.
        5) Simulate offline and verify non-blocking banner while existing data remains.
        6) Verify search/source/time filters and mobile card layout.
      */}
      {!connection.online ? (
        <AlertBanner variant="warning" title="Offline mode detected">
          Polling is paused. Existing alerts remain visible until connection returns.
        </AlertBanner>
      ) : null}

      {alertsQuery.error ? (
        <AlertBanner variant="error" title="Could not refresh alerts">
          {toUserMessage(alertsQuery.error)}
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

      <Card title="Alerts Queue">
        <StatusTabs value={status} onChange={setStatus} />

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

        {showInitialLoading ? (
          <div className="alerts-skeleton-stack" aria-label="Alerts loading placeholder">
            <Skeleton height={72} />
            <Skeleton height={72} />
            <Skeleton height={72} />
            <Skeleton height={72} />
          </div>
        ) : visibleAlerts.length === 0 ? (
          <EmptyState
            title="No alerts match this view"
            description="Try changing status, search text, or filters to broaden the queue."
          />
        ) : isMobileLayout ? (
          <AlertCardList
            alerts={visibleAlerts}
            seenAlertMap={seenAlertMap}
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
    </div>
  );
}
