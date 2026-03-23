import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { WorklistCardList } from '../components/worklist/WorklistCardList';
import { WorklistFilters } from '../components/worklist/WorklistFilters';
import { WorklistTable } from '../components/worklist/WorklistTable';
import { RetryButton } from '../components/system/RetryButton';
import { StatusPanel } from '../components/system/StatusPanel';
import { AlertBanner } from '../components/ui/AlertBanner';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Section } from '../components/ui/Section';
import { Skeleton } from '../components/ui/Skeleton';
import { Stack } from '../components/ui/Stack';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useConnectionStatus } from '../services/connection';
import { useClinicianWorklist } from '../services/clinicianApi';
import {
  clearWorkspaceState,
  normalizeWorkspaceSearch,
  readWorkspaceState,
  writeWorkspaceState,
} from '../services/workspaceState';
import { MEDIA_QUERIES } from '../styles/breakpoints';
import { asAppError } from '../utils/errors';
import { toErrorView } from '../utils/errorView';
import { createPatientEntryState } from '../utils/patientEntryContext';
import {
  defaultWorklistFilters,
  hasWorklistFilterConstraints,
  type WorklistFilters as WorklistFiltersState,
} from '../utils/worklist';

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

function normalizeWorklistWorkspaceState(value: unknown): WorklistFiltersState {
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
    assignedToMe: candidate.assignedToMe === true,
    status: WORKLIST_STATUS_FILTERS.includes(candidate.status ?? 'all')
      ? (candidate.status as WorklistFiltersState['status'])
      : fallback.status,
    sort: WORKLIST_SORT_OPTIONS.includes(candidate.sort ?? 'priority')
      ? (candidate.sort as WorklistFiltersState['sort'])
      : fallback.sort,
  };
}

export function WorklistPage(): JSX.Element {
  const navigate = useNavigate();
  const connection = useConnectionStatus();
  const isCompactLayout = useMediaQuery(MEDIA_QUERIES.lgDown);
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

  const summary = useMemo(() => {
    return {
      highRisk: items.filter((item) => item.latestRiskLevel === 'high').length,
      needsResponse: items.filter((item) => item.communicationNeedsResponse).length,
      openAlerts: items.filter((item) => item.openAlertsCount > 0).length,
      activeTasks: items.filter((item) => item.activeTaskCount > 0).length,
    };
  }, [items]);
  const queueViewLabel = activeFilterConstraints ? 'Focused queue view' : 'Full review queue';
  const worklistGuidanceLine =
    items.length === 0
      ? activeFilterConstraints
        ? 'No patients match this current queue view.'
        : 'Active review is clear right now.'
      : summary.highRisk > 0
        ? 'High-risk review still leads this current queue.'
        : summary.needsResponse > 0
          ? 'Response follow-up still leads this current queue.'
          : summary.openAlerts > 0
            ? 'Alert-linked review still remains in this current queue.'
            : 'Continue with the next patient in this queue.';

  const updatedAtLabel = connection.lastSuccessAt
    ? new Date(connection.lastSuccessAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '--';

  const showInitialLoading = worklistQuery.isLoading && items.length === 0;
  const genericError = worklistQuery.error ? asAppError(worklistQuery.error) : null;
  const staleDataAvailable = items.length > 0;
  const staleErrorBannerVisible = Boolean(genericError && staleDataAvailable);
  const blockingOfflineVisible = !connection.online && !staleDataAvailable && !worklistQuery.error;
  const errorView = genericError ? toErrorView(genericError) : null;

  const retryWorklist = useCallback((): void => {
    void worklistQuery.refetch();
  }, [worklistQuery]);

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
    liveFiltersRef.current = filters;
  }, [filters]);

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
    if (!searchPersistenceEnabledRef.current) {
      return;
    }

    persistWorklistState({
      ...liveFiltersRef.current,
      search: debouncedPersistedSearch,
    });
  }, [debouncedPersistedSearch, persistWorklistState]);

  return (
    <Stack className="page-stack worklist-page" gap="5">
      <Section
        className="dashboard-page-header worklist-page-header"
        eyebrow="Operational roster"
        title="Worklist"
        subtitle="Review active follow-up needs across safety, adherence, communication, tasks, and appointments."
        meta={
          <span className="worklist-page__meta" aria-live="polite">
            <span className="worklist-page__meta-pill worklist-page__meta-pill--count">
              {total} in view
            </span>
            <span className="worklist-page__meta-pill worklist-page__meta-pill--updated">Updated {updatedAtLabel}</span>
          </span>
        }
        actions={
          <Button variant="secondary" size="sm" onClick={retryWorklist} disabled={worklistQuery.isFetching}>
            {worklistQuery.isFetching ? 'Refreshing...' : 'Refresh'}
          </Button>
        }
      />

      {staleErrorBannerVisible ? (
        <AlertBanner
          variant="warning"
          title="Service temporarily unavailable"
          action={<RetryButton onRetry={retryWorklist} loading={worklistQuery.isFetching} />}
        >
          Showing the last known worklist snapshot from {updatedAtLabel}.
        </AlertBanner>
      ) : null}

      <section className="worklist-summary-strip" aria-label="Worklist summary">
        <article className="worklist-summary-strip__item worklist-summary-strip__item--total">
          <p className="worklist-summary-strip__label">In view</p>
          <p className="worklist-summary-strip__value">{total}</p>
          <p className="worklist-summary-strip__hint">{items.length} rows loaded in the current queue</p>
        </article>
        <article
          className={`worklist-summary-strip__item worklist-summary-strip__item--risk${
            summary.highRisk > 0 ? ' worklist-summary-strip__item--risk-hot' : ''
          }`}
        >
          <p className="worklist-summary-strip__label">High risk</p>
          <p className="worklist-summary-strip__value">{summary.highRisk}</p>
          <p className="worklist-summary-strip__hint">Latest patient risk currently marked high</p>
        </article>
        <article className="worklist-summary-strip__item worklist-summary-strip__item--response">
          <p className="worklist-summary-strip__label">Needs response</p>
          <p className="worklist-summary-strip__value">{summary.needsResponse}</p>
          <p className="worklist-summary-strip__hint">Communication follow-up still waiting</p>
        </article>
        <article className="worklist-summary-strip__item worklist-summary-strip__item--alerts">
          <p className="worklist-summary-strip__label">With alerts</p>
          <p className="worklist-summary-strip__value">{summary.openAlerts}</p>
          <p className="worklist-summary-strip__hint">Patients with open alert burden</p>
        </article>
        <article className="worklist-summary-strip__item worklist-summary-strip__item--tasks">
          <p className="worklist-summary-strip__label">With tasks</p>
          <p className="worklist-summary-strip__value">{summary.activeTasks}</p>
          <p className="worklist-summary-strip__hint">Linked follow-up work still active</p>
        </article>
      </section>

      <section className="worklist-workspace-note" aria-label="Worklist workspace guidance">
        <div className="worklist-workspace-note__copy">
          <p className="worklist-workspace-note__eyebrow">Active review workspace</p>
          <p className="worklist-workspace-note__text">{worklistGuidanceLine}</p>
        </div>
        <div className="worklist-workspace-note__facts" aria-live="polite">
          <span className="worklist-workspace-note__fact">{queueViewLabel}</span>
          <span className="worklist-workspace-note__fact">{summary.highRisk} high risk</span>
          <span className="worklist-workspace-note__fact">{summary.needsResponse} need response</span>
        </div>
      </section>

      <Card
        className="worklist-workspace-card"
        title={
          <span className="worklist-card-title">
            Active review queue
            <span className="worklist-card-title__meta">Attention workspace</span>
          </span>
        }
        action={
          <Button variant="ghost" size="sm" onClick={clearSavedWorklistState} disabled={worklistQuery.isFetching}>
            Clear view
          </Button>
        }
      >
        <Stack gap="4">
          <div className="worklist-workspace-card__controls">
            <WorklistFilters
              filters={filters}
              disabled={worklistQuery.isFetching && items.length === 0}
              onSearchChange={(search) => {
                searchPersistenceEnabledRef.current = true;
                setFilters((current) => ({ ...current, search }));
              }}
              onToggleFilter={(key) =>
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
                })
              }
              onStatusChange={(status) =>
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
                })
              }
              onSortChange={(sort) =>
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
                })
              }
              onReset={clearSavedWorklistState}
            />
          </div>

          {showInitialLoading ? (
            <div className="worklist-skeleton" aria-label="Worklist loading placeholder">
              <Skeleton height={80} />
              <Skeleton height={80} />
              <Skeleton height={80} />
            </div>
          ) : genericError && !staleDataAvailable && errorView ? (
            <StatusPanel
              variant={errorView.variant === 'warning' ? 'error' : errorView.variant}
              title="Unable to load worklist"
              description={errorView.description}
              actions={<RetryButton onRetry={retryWorklist} loading={worklistQuery.isFetching} />}
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
              description="No cached worklist snapshot is available yet. Reconnect and retry."
              actions={<RetryButton onRetry={retryWorklist} loading={worklistQuery.isFetching} />}
            />
          ) : items.length === 0 ? (
            activeFilterConstraints ? (
              <EmptyState
                title="No patients match this view"
                description="Clear filters to return to the active review queue."
                tone="warning"
                action={
                  <Button variant="secondary" size="sm" onClick={clearSavedWorklistState}>
                    Reset filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                title="No patients need active review"
                description="Safety, adherence, communication, and appointment follow-up items will appear here."
                tone="success"
                action={
                  <Button variant="secondary" size="sm" onClick={retryWorklist} disabled={worklistQuery.isFetching}>
                    {worklistQuery.isFetching ? 'Refreshing...' : 'Refresh queue'}
                  </Button>
                }
              />
            )
          ) : isCompactLayout ? (
            <WorklistCardList
              items={items}
              onOpenPatient={openPatientFromWorklist}
              onOpenCommunication={openCommunicationFromWorklist}
              onOpenAlerts={openAlertsWorkspace}
              onOpenAppointments={() => navigate('/appointments')}
            />
          ) : (
            <WorklistTable
              items={items}
              onOpenPatient={openPatientFromWorklist}
              onOpenCommunication={openCommunicationFromWorklist}
              onOpenAlerts={openAlertsWorkspace}
              onOpenAppointments={() => navigate('/appointments')}
            />
          )}
        </Stack>
      </Card>
    </Stack>
  );
}
