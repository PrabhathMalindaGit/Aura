import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { Tabs } from '../components/ui/Tabs';
import { AlertBanner } from '../components/ui/AlertBanner';
import { ExportCsvModal } from '../components/export/ExportCsvModal';
import { DayDetailPanel } from '../components/patients/DayDetailPanel';
import { PatientSummaryCards } from '../components/patients/PatientSummaryCards';
import { RecentAlertsPanel } from '../components/patients/RecentAlertsPanel';
import { TrendCharts } from '../components/patients/TrendCharts';
import {
  assignPromToPatient,
  getPatientExerciseSessions,
  getPatientProms,
  getRehabPhases,
  getPatientTrendsEndpointHint,
  isPatientTrendsEndpointMissing,
  listAlerts,
  setCurrentRehabPhase,
  tryGetPatientCheckinsRange,
  usePatients,
  usePatientTrends,
  useUpdateAlertStatus,
} from '../services/clinicianApi';
import { useConnectionStatus } from '../services/connection';
import { getSeenMap, getSeenStorageKey, pruneSeenMap, type SeenAlertMap } from '../services/seenStore';
import type {
  AlertItem,
  AlertStatus,
  PatientSummary,
  PromDueCard,
  PromHistoryRow,
  RehabPayload,
  TrendPointRaw,
} from '../types/models';
import { toCsv, downloadCsv } from '../utils/csv';
import {
  getPresetDateRange,
  type DateRangeValue,
  validateDateRange,
} from '../utils/datesRange';
import { asAppError, isRetryable, toUserMessage } from '../utils/errors';
import {
  buildAlertExportColumns,
  buildAlertExportRows,
  buildPatientTrendExportColumns,
  buildPatientTrendExportRows,
  createPatientAlertsCsvFilename,
  createPatientCheckinsCsvFilename,
  filterAlertsForExportByRange,
  filterTrendPointsForExportByRange,
  formatExportDateRangeSummary,
  normalizeTrendPointsForExport,
} from '../services/exportService';
import {
  alertsForDate,
  deriveTrendSummary,
  filterAlertsForPatient,
  normalizeTrendPoints,
  trendPointHasAnyData,
} from '../utils/trends';

const ALERT_STATUSES: AlertStatus[] = ['open', 'acknowledged', 'resolved'];
const CLINICIAN_BUCKET = 'anon';
type PatientExportDataset = 'trends' | 'alerts';

function parseDays(value: string | null): 14 | 30 {
  return value === '30' ? 30 : 14;
}

function toIsoDatetimeInput(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const parsed = new Date(trimmed);
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error('Due date must be a valid date/time.');
  }

  return parsed.toISOString();
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${String(secs).padStart(2, '0')}s`;
}

function formatLastUpdated(lastSuccessAt: number | null): string {
  if (!lastSuccessAt) {
    return '--';
  }

  return new Date(lastSuccessAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function statusBadgeVariant(status: PatientSummary['status']): 'default' | 'success' | 'warning' | 'danger' {
  if (status === 'active') {
    return 'success';
  }

  if (status === 'on_hold') {
    return 'warning';
  }

  if (status === 'discharged') {
    return 'default';
  }

  if (status === 'inactive') {
    return 'danger';
  }

  return 'default';
}

function statusLabel(status: PatientSummary['status']): string {
  if (status === 'on_hold') {
    return 'On hold';
  }

  if (status === 'discharged') {
    return 'Discharged';
  }

  if (status === 'inactive') {
    return 'Inactive';
  }

  return 'Active';
}

function rehabStatusIcon(status: RehabPayload['phases'][number]['status']): string {
  if (status === 'done') {
    return '✓';
  }
  if (status === 'current') {
    return '●';
  }
  return '🔒';
}

async function fetchPatientAlerts(patientId: string): Promise<AlertItem[]> {
  const collections = await Promise.all(ALERT_STATUSES.map((status) => listAlerts(status)));
  const merged = collections.flat();
  const filtered = filterAlertsForPatient(merged, patientId);

  return filtered.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}

export function PatientDetailPage(): JSX.Element {
  const { patientId } = useParams<{ patientId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedDays = parseDays(searchParams.get('days'));

  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedRehabKey, setSelectedRehabKey] = useState('');
  const [rehabSaveError, setRehabSaveError] = useState<string | null>(null);
  const [isSavingRehab, setIsSavingRehab] = useState(false);
  const [promTemplateKey, setPromTemplateKey] = useState('AURA_RECOVERY_5');
  const [promDueAt, setPromDueAt] = useState('');
  const [promSaveError, setPromSaveError] = useState<string | null>(null);
  const [isAssigningProm, setIsAssigningProm] = useState(false);
  const [seenAlertMap, setSeenAlertMap] = useState<SeenAlertMap>(() => getSeenMap(CLINICIAN_BUCKET));
  const [patientExportOpen, setPatientExportOpen] = useState(false);
  const [patientExportRange, setPatientExportRange] = useState<DateRangeValue>(() =>
    getPresetDateRange('last30'),
  );
  const [patientExportDataset, setPatientExportDataset] = useState<PatientExportDataset>('trends');
  const [patientExportIncludeNotes, setPatientExportIncludeNotes] = useState(false);
  const [patientExportIncludeAdvancedAlertFields, setPatientExportIncludeAdvancedAlertFields] =
    useState(false);
  const [patientExportIncludeNotificationFields, setPatientExportIncludeNotificationFields] =
    useState(false);
  const [patientExportLoading, setPatientExportLoading] = useState(false);
  const [patientExportMessage, setPatientExportMessage] = useState<string | null>(null);
  const dayDetailFocusRef = useRef<HTMLElement | null>(null);

  const connection = useConnectionStatus();

  const patientsQuery = usePatients();
  const patientContext = useMemo(
    () => patientsQuery.data?.find((patient) => patient.id === patientId),
    [patientId, patientsQuery.data],
  );

  const trendsQuery = usePatientTrends(patientId, selectedDays);

  const patientAlertsQuery = useQuery({
    queryKey: ['patient-alerts', patientId],
    queryFn: () => fetchPatientAlerts(patientId ?? ''),
    enabled: Boolean(patientId),
    staleTime: 7_000,
    retry: (failureCount, error) => failureCount < 2 && isRetryable(asAppError(error)),
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });

  const patientSessionsQuery = useQuery({
    queryKey: ['patient-sessions', patientId],
    queryFn: () => getPatientExerciseSessions(patientId ?? '', 5),
    enabled: Boolean(patientId),
    staleTime: 7_000,
    retry: (failureCount, error) => failureCount < 2 && isRetryable(asAppError(error)),
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });

  const patientRehabQuery = useQuery({
    queryKey: ['patient-rehab', patientId],
    queryFn: () => getRehabPhases(patientId ?? ''),
    enabled: Boolean(patientId),
    staleTime: 7_000,
    retry: (failureCount, error) => failureCount < 2 && isRetryable(asAppError(error)),
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });

  const patientPromsQuery = useQuery({
    queryKey: ['patient-proms', patientId],
    queryFn: () => getPatientProms(patientId ?? '', 50),
    enabled: Boolean(patientId),
    staleTime: 7_000,
    retry: (failureCount, error) => failureCount < 2 && isRetryable(asAppError(error)),
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });

  const updateAlertMutation = useUpdateAlertStatus();

  useEffect(() => {
    setSeenAlertMap(pruneSeenMap(CLINICIAN_BUCKET));

    if (typeof window === 'undefined') {
      return;
    }

    const seenStorageKey = getSeenStorageKey(CLINICIAN_BUCKET);
    const onStorage = (event: StorageEvent): void => {
      if (event.key === seenStorageKey) {
        setSeenAlertMap(getSeenMap(CLINICIAN_BUCKET));
      }
    };

    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    setSelectedDateKey(null);
  }, [selectedDays]);

  useEffect(() => {
    const phases = patientRehabQuery.data?.phases ?? [];
    if (phases.length === 0) {
      setSelectedRehabKey('');
      return;
    }

    const preferredKey =
      patientRehabQuery.data?.currentKey ??
      phases.find((phase) => phase.status === 'current')?.key ??
      phases[0].key;
    setSelectedRehabKey(preferredKey);
  }, [patientRehabQuery.data]);

  const trendData = useMemo(
    () => (trendsQuery.data ?? []) as TrendPointRaw[],
    [trendsQuery.data],
  );

  const normalizedTrends = useMemo(
    () => normalizeTrendPoints(trendData, selectedDays),
    [selectedDays, trendData],
  );

  const trendSummary = useMemo(() => deriveTrendSummary(normalizedTrends), [normalizedTrends]);

  const patientAlerts = useMemo(() => patientAlertsQuery.data ?? [], [patientAlertsQuery.data]);
  const patientSessions = useMemo(
    () => patientSessionsQuery.data ?? [],
    [patientSessionsQuery.data],
  );
  const patientRehab = useMemo(
    () => patientRehabQuery.data ?? null,
    [patientRehabQuery.data],
  );
  const patientPromDue = useMemo<PromDueCard[]>(
    () => patientPromsQuery.data?.due ?? [],
    [patientPromsQuery.data?.due],
  );
  const patientPromCompleted = useMemo<PromHistoryRow[]>(
    () => patientPromsQuery.data?.completed ?? [],
    [patientPromsQuery.data?.completed],
  );

  const openAlertCount = useMemo(
    () => patientAlerts.filter((alert) => alert.status === 'open').length,
    [patientAlerts],
  );

  const selectedDayPoint = useMemo(
    () => normalizedTrends.find((point) => point.date === selectedDateKey) ?? null,
    [normalizedTrends, selectedDateKey],
  );

  const selectedDayAlerts = useMemo(
    () => (selectedDayPoint ? alertsForDate(patientAlerts, selectedDayPoint.date) : []),
    [patientAlerts, selectedDayPoint],
  );

  const trendsEndpointMissing = isPatientTrendsEndpointMissing(patientId, selectedDays);
  const hasTrendData = normalizedTrends.some((point) => trendPointHasAnyData(point));
  const patientExportRangeError = validateDateRange(patientExportRange);

  const showTrendsLoading = trendsQuery.isLoading && trendData.length === 0;

  function handleDaySelect(date: string, triggerElement?: HTMLElement | null): void {
    if (triggerElement) {
      dayDetailFocusRef.current = triggerElement;
    }

    setSelectedDateKey(date);
  }

  function handleStatusUpdate(nextStatus: 'acknowledged' | 'resolved', alert: AlertItem): void {
    setActionError(null);

    updateAlertMutation.mutate(
      { id: alert._id, status: nextStatus },
      {
        onError: (error) => {
          setActionError(toUserMessage(asAppError(error)));
        },
        onSuccess: () => {
          void patientAlertsQuery.refetch();
        },
      },
    );
  }

  async function handleRehabSave(): Promise<void> {
    if (!patientId || !selectedRehabKey) {
      return;
    }

    setRehabSaveError(null);
    setIsSavingRehab(true);
    try {
      const updated = await setCurrentRehabPhase(patientId, selectedRehabKey);
      setSelectedRehabKey(
        updated.currentKey ??
          updated.phases.find((phase) => phase.status === 'current')?.key ??
          '',
      );
      await patientRehabQuery.refetch();
    } catch (error) {
      setRehabSaveError(toUserMessage(asAppError(error)));
    } finally {
      setIsSavingRehab(false);
    }
  }

  async function handleAssignProm(): Promise<void> {
    if (!patientId || !promTemplateKey) {
      return;
    }

    setPromSaveError(null);
    setIsAssigningProm(true);
    try {
      const dueAtIso = toIsoDatetimeInput(promDueAt);
      await assignPromToPatient(patientId, promTemplateKey, dueAtIso);
      setPromDueAt('');
      await patientPromsQuery.refetch();
    } catch (error) {
      setPromSaveError(toUserMessage(asAppError(error)));
    } finally {
      setIsAssigningProm(false);
    }
  }

  const patientExportPreviewCount = useMemo(() => {
    if (patientExportRangeError) {
      return 0;
    }

    if (patientExportDataset === 'alerts') {
      return filterAlertsForExportByRange(patientAlerts, patientExportRange).length;
    }

    const rangePoints = filterTrendPointsForExportByRange(normalizedTrends, patientExportRange);
    return rangePoints.filter(
      (point) => trendPointHasAnyData(point) || alertsForDate(patientAlerts, point.date).length > 0,
    ).length;
  }, [
    normalizedTrends,
    patientAlerts,
    patientExportDataset,
    patientExportRange,
    patientExportRangeError,
  ]);

  const loadedTrendWindowStart = normalizedTrends[0]?.date ?? null;
  const loadedTrendWindowEnd = normalizedTrends[normalizedTrends.length - 1]?.date ?? null;
  const rangeOutsideLoadedTrendWindow = Boolean(
    loadedTrendWindowStart &&
      loadedTrendWindowEnd &&
      (patientExportRange.from < loadedTrendWindowStart || patientExportRange.to > loadedTrendWindowEnd),
  );

  const patientExportSummary =
    patientExportMessage ??
    `Exporting ${patientExportPreviewCount} ${
      patientExportDataset === 'alerts' ? 'alerts' : 'check-in rows'
    } from ${formatExportDateRangeSummary(patientExportRange)}.`;

  const patientExportDownloadDisabled =
    patientExportLoading ||
    Boolean(patientExportRangeError) ||
    patientExportPreviewCount === 0;

  function openPatientExportModal(): void {
    setPatientExportOpen(true);
    setPatientExportRange(getPresetDateRange('last30'));
    setPatientExportDataset('trends');
    setPatientExportIncludeNotes(false);
    setPatientExportIncludeAdvancedAlertFields(false);
    setPatientExportIncludeNotificationFields(false);
    setPatientExportMessage(null);
  }

  async function handlePatientExportDownload(): Promise<void> {
    if (!patientId) {
      setPatientExportMessage('Patient not found.');
      return;
    }

    if (patientExportRangeError) {
      setPatientExportMessage(patientExportRangeError);
      return;
    }

    setPatientExportLoading(true);
    setPatientExportMessage(null);

    try {
      if (patientExportDataset === 'alerts') {
        const exportOptions = {
          includeNotificationFields: patientExportIncludeNotificationFields,
          includeAdvancedFields: patientExportIncludeAdvancedAlertFields,
        };
        const alertsInRange = filterAlertsForExportByRange(patientAlerts, patientExportRange);

        if (alertsInRange.length === 0) {
          setPatientExportMessage('No data in selected range.');
          return;
        }

        const rows = buildAlertExportRows(alertsInRange, exportOptions);
        const columns = buildAlertExportColumns(exportOptions);
        const csv = toCsv(rows, columns);

        downloadCsv(createPatientAlertsCsvFilename(patientId, patientExportRange), csv);
        setPatientExportOpen(false);
        return;
      }

      const checkinsRangeData = await tryGetPatientCheckinsRange(
        patientId,
        patientExportRange.from,
        patientExportRange.to,
      );

      let exportPoints = filterTrendPointsForExportByRange(normalizedTrends, patientExportRange);
      if (checkinsRangeData) {
        exportPoints = filterTrendPointsForExportByRange(
          normalizeTrendPointsForExport(checkinsRangeData),
          patientExportRange,
        );
      } else if (rangeOutsideLoadedTrendWindow) {
        setPatientExportMessage(
          'Range exceeds loaded window. Switch to 30 days or add GET /clinician/patients/:id/checkins?from&to.',
        );
      }

      exportPoints = exportPoints.filter(
        (point) => trendPointHasAnyData(point) || alertsForDate(patientAlerts, point.date).length > 0,
      );

      if (exportPoints.length === 0) {
        setPatientExportMessage('No data in selected range.');
        return;
      }

      const rows = buildPatientTrendExportRows(exportPoints, patientAlerts, {
        includeNotes: patientExportIncludeNotes,
        includeAdvancedAlertFields: patientExportIncludeAdvancedAlertFields,
      });
      const columns = buildPatientTrendExportColumns({
        includeNotes: patientExportIncludeNotes,
        includeAdvancedAlertFields: patientExportIncludeAdvancedAlertFields,
      });
      const csv = toCsv(rows, columns);

      downloadCsv(createPatientCheckinsCsvFilename(patientId, patientExportRange), csv);
      setPatientExportOpen(false);
    } catch (error) {
      setPatientExportMessage(toUserMessage(asAppError(error)));
    } finally {
      setPatientExportLoading(false);
    }
  }

  if (!patientId) {
    return (
      <EmptyState title="Patient not found" description="No patient identifier was provided in the route." />
    );
  }

  const patientDisplayName = patientContext?.displayName?.trim() || patientId;

  return (
    <div className="page-stack">
      <Card
        title={
          <div className="patient-detail-title">
            <Link to="/patients" className="patient-detail-back-link">
              Back to patients
            </Link>
            <span className="patient-detail-title__text">Patient {patientDisplayName}</span>
            {patientDisplayName !== patientId ? <span className="patient-id-text">ID: {patientId}</span> : null}
            {patientContext?.status ? (
              <Badge variant={statusBadgeVariant(patientContext.status)} icon>
                {statusLabel(patientContext.status)}
              </Badge>
            ) : null}
          </div>
        }
        action={
          <div className="patient-detail-actions">
            <Tabs
              tabs={[
                { id: '14', label: '14 days' },
                { id: '30', label: '30 days' },
              ]}
              value={String(selectedDays)}
              getTabTestId={(tabId) => `days-toggle-${tabId}`}
              onValueChange={(value) => {
                const nextDays = value === '30' ? '30' : '14';
                setSearchParams((current) => {
                  const next = new URLSearchParams(current);
                  next.set('days', nextDays);
                  return next;
                });
              }}
            />
            <Button
              variant="secondary"
              onClick={() => {
                void Promise.all([trendsQuery.refetch(), patientAlertsQuery.refetch()]);
              }}
            >
              Refresh
            </Button>
            <Button variant="secondary" onClick={openPatientExportModal}>
              Export CSV
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                navigate(`/patients/${patientId}/plan`);
              }}
            >
              Exercise Plan
            </Button>
          </div>
        }
      >
        <div className="patient-detail-meta">
          <Badge variant={connection.online ? 'success' : 'danger'} icon>
            {connection.online ? 'Online' : 'Offline'}
          </Badge>
          <span className="muted-text">Last updated: {formatLastUpdated(connection.lastSuccessAt)}</span>
        </div>
      </Card>

      {actionError ? (
        <AlertBanner variant="error" title="Alert action failed">
          {actionError}
        </AlertBanner>
      ) : null}

      {trendsEndpointMissing ? (
        <AlertBanner variant="warning" title="Trends endpoint not ready">
          {getPatientTrendsEndpointHint()}
        </AlertBanner>
      ) : null}

      {trendsQuery.error ? (
        <div className="patient-detail-error-state">
          <AlertBanner variant="error" title="Could not load trends">
            {toUserMessage(trendsQuery.error)}
          </AlertBanner>
          <Button
            variant="secondary"
            onClick={() => {
              void trendsQuery.refetch();
            }}
          >
            Retry
          </Button>
        </div>
      ) : null}

      {patientAlertsQuery.error ? (
        <AlertBanner variant="error" title="Could not load recent alerts">
          {toUserMessage(patientAlertsQuery.error)}
        </AlertBanner>
      ) : null}

      {patientSessionsQuery.error ? (
        <AlertBanner variant="error" title="Could not load exercise sessions">
          {toUserMessage(patientSessionsQuery.error)}
        </AlertBanner>
      ) : null}

      {patientRehabQuery.error ? (
        <AlertBanner variant="error" title="Could not load rehab phases">
          {toUserMessage(patientRehabQuery.error)}
        </AlertBanner>
      ) : null}

      {patientPromsQuery.error ? (
        <AlertBanner variant="error" title="Could not load PROMs">
          {toUserMessage(patientPromsQuery.error)}
        </AlertBanner>
      ) : null}

      {rehabSaveError ? (
        <AlertBanner variant="error" title="Could not update rehab phase">
          {rehabSaveError}
        </AlertBanner>
      ) : null}

      {promSaveError ? (
        <AlertBanner variant="error" title="Could not assign PROM">
          {promSaveError}
        </AlertBanner>
      ) : null}

      <PatientSummaryCards metrics={trendSummary} openAlertCount={openAlertCount} />

      <Card
        title="Rehab phase"
        action={
          <div className="patient-detail-actions">
            <Button
              variant="secondary"
              onClick={() => {
                void patientRehabQuery.refetch();
              }}
            >
              Refresh
            </Button>
            <Button
              variant="secondary"
              disabled={!selectedRehabKey || isSavingRehab}
              onClick={() => {
                void handleRehabSave();
              }}
            >
              {isSavingRehab ? 'Saving...' : 'Save'}
            </Button>
          </div>
        }
      >
        {patientRehabQuery.isLoading && !patientRehab ? (
          <div className="patient-detail-skeleton-grid" aria-label="Rehab phases loading placeholder">
            <Skeleton height={44} />
            <Skeleton height={80} />
          </div>
        ) : !patientRehab || patientRehab.phases.length === 0 ? (
          <EmptyState
            title="No rehab phases configured"
            description="Initialize rehab phases by refreshing this panel."
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  void patientRehabQuery.refetch();
                }}
              >
                Retry
              </Button>
            }
          />
        ) : (
          <div className="stack stack--3">
            <p className="muted-text">
              Current phase:{' '}
              <strong>
                {patientRehab.phases.find((phase) => phase.key === patientRehab.currentKey)?.title ??
                  'Not set'}
              </strong>
            </p>
            <label className="form-field" htmlFor="rehab-current-select">
              <span>Current phase</span>
              <select
                id="rehab-current-select"
                value={selectedRehabKey}
                onChange={(event) => {
                  setSelectedRehabKey(event.currentTarget.value);
                }}
              >
                {patientRehab.phases.map((phase) => (
                  <option key={phase.key} value={phase.key}>
                    {phase.title}
                  </option>
                ))}
              </select>
            </label>
            <div className="stack stack--2">
              {patientRehab.phases
                .slice()
                .sort((left, right) => left.order - right.order)
                .map((phase) => (
                  <div key={phase.key}>
                    <strong>
                      {rehabStatusIcon(phase.status)} {phase.title}
                    </strong>
                    <p className="muted-text">
                      {phase.status === 'done'
                        ? 'Done'
                        : phase.status === 'current'
                          ? 'Current'
                          : 'Locked'}
                      {phase.completedAt ? ` · Completed ${new Date(phase.completedAt).toLocaleDateString()}` : ''}
                    </p>
                    {phase.description ? <p className="muted-text">{phase.description}</p> : null}
                  </div>
                ))}
            </div>
          </div>
        )}
      </Card>

      <Card
        title="Questionnaires (PROMs)"
        action={
          <Button
            variant="secondary"
            onClick={() => {
              void patientPromsQuery.refetch();
            }}
          >
            Refresh
          </Button>
        }
      >
        {patientPromsQuery.isLoading && patientPromDue.length === 0 && patientPromCompleted.length === 0 ? (
          <div className="patient-detail-skeleton-grid" aria-label="PROM list loading placeholder">
            <Skeleton height={54} />
            <Skeleton height={54} />
          </div>
        ) : (
          <div className="stack stack--3">
            <div className="patient-prom-assign">
              <label className="form-field" htmlFor="prom-template-select">
                <span>Template</span>
                <select
                  id="prom-template-select"
                  value={promTemplateKey}
                  onChange={(event) => {
                    setPromTemplateKey(event.currentTarget.value);
                  }}
                >
                  <option value="AURA_RECOVERY_5">AURA_RECOVERY_5</option>
                </select>
              </label>
              <label className="form-field" htmlFor="prom-due-input">
                <span>Due at (optional)</span>
                <input
                  id="prom-due-input"
                  type="datetime-local"
                  value={promDueAt}
                  onChange={(event) => {
                    setPromDueAt(event.currentTarget.value);
                  }}
                />
              </label>
              <Button
                variant="secondary"
                disabled={isAssigningProm}
                onClick={() => {
                  void handleAssignProm();
                }}
              >
                {isAssigningProm ? 'Assigning...' : 'Assign'}
              </Button>
            </div>

            <div className="stack stack--2">
              <strong>Due</strong>
              {patientPromDue.length === 0 ? (
                <p className="muted-text">No questionnaires due.</p>
              ) : (
                <div className="patient-prom-list">
                  {patientPromDue.map((prom) => (
                    <button
                      key={prom.id}
                      type="button"
                      className="unstyled-button patient-prom-item"
                      onClick={() => navigate(`/proms/${prom.id}`)}
                    >
                      <div>
                        <strong>{prom.title}</strong>
                        <p className="muted-text">
                          Due {new Date(prom.dueAt).toLocaleString()}
                        </p>
                      </div>
                      <span className="patient-prom-meta">Open</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="stack stack--2">
              <strong>Completed</strong>
              {patientPromCompleted.length === 0 ? (
                <p className="muted-text">No completed questionnaires yet.</p>
              ) : (
                <div className="patient-prom-list">
                  {patientPromCompleted.map((prom) => (
                    <button
                      key={prom.id}
                      type="button"
                      className="unstyled-button patient-prom-item"
                      onClick={() => navigate(`/proms/${prom.id}`)}
                    >
                      <div>
                        <strong>{prom.title}</strong>
                        <p className="muted-text">
                          Completed {new Date(prom.completedAt).toLocaleString()}
                        </p>
                      </div>
                      <span className="patient-prom-score">
                        {prom.score
                          ? `${prom.score.normalized} · ${prom.score.bandLabel}`
                          : 'No score'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Card>

      <Card
        title="Exercise sessions"
        action={
          <div className="patient-detail-actions">
            <Button
              variant="secondary"
              onClick={() => {
                void patientSessionsQuery.refetch();
              }}
            >
              Refresh
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                navigate(`/patients/${patientId}/sessions`);
              }}
            >
              View all
            </Button>
          </div>
        }
      >
        {patientSessionsQuery.isLoading && patientSessions.length === 0 ? (
          <div className="patient-detail-skeleton-grid" aria-label="Session list loading placeholder">
            <Skeleton height={54} />
            <Skeleton height={54} />
          </div>
        ) : patientSessions.length === 0 ? (
          <EmptyState
            title="No sessions yet"
            description="Once the patient runs a session in mobile, it will appear here."
          />
        ) : (
          <div className="patient-sessions-list">
            {patientSessions.map((session) => (
              <button
                key={session.id}
                type="button"
                className="unstyled-button patient-sessions-item"
                onClick={() => navigate(`/patients/${patientId}/sessions/${session.id}`)}
              >
                <div>
                  <strong>{new Date(session.startedAt).toLocaleString()}</strong>
                  <p className="muted-text">
                    {session.planTitle ?? 'Exercise session'} · {formatDuration(session.durationSeconds)}
                  </p>
                </div>
                <div className="patient-sessions-metrics">
                  <span>
                    {session.completedCount}/{session.exerciseCount} complete
                  </span>
                  <span>
                    Avg pain:{' '}
                    {typeof session.avgPainDuring === 'number' ? `${session.avgPainDuring}/5` : '—'}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>

      {showTrendsLoading ? (
        <Card title="Trend charts">
          <div className="patient-detail-skeleton-grid" aria-label="Trend charts loading placeholder">
            <Skeleton height={260} />
            <Skeleton height={260} />
            <Skeleton height={260} />
          </div>
        </Card>
      ) : hasTrendData ? (
        <TrendCharts points={normalizedTrends} onSelectDate={handleDaySelect} />
      ) : (
        <Card title="Trend charts">
          <EmptyState
            title="No check-ins yet for this patient"
            description="Trend charts will appear once check-ins are available for the selected window."
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  void trendsQuery.refetch();
                }}
              >
                Retry
              </Button>
            }
          />
        </Card>
      )}

      <RecentAlertsPanel
        alerts={patientAlerts}
        seenAlertMap={seenAlertMap}
        mutationPending={updateAlertMutation.isPending}
        onAcknowledge={(alert) => handleStatusUpdate('acknowledged', alert)}
        onResolve={(alert) => handleStatusUpdate('resolved', alert)}
        onViewAll={() => navigate(`/alerts?patientId=${encodeURIComponent(patientId)}`)}
      />

      <ExportCsvModal
        open={patientExportOpen}
        title="Export Patient CSV"
        description={
          patientExportDataset === 'alerts'
            ? 'Export alert history for the selected date range.'
            : 'Export check-ins/trends for the selected date range.'
        }
        range={patientExportRange}
        rangeError={patientExportRangeError}
        summary={patientExportSummary}
        loading={patientExportLoading}
        downloadDisabled={patientExportDownloadDisabled}
        disableReason={patientExportRangeError ?? (patientExportPreviewCount === 0 ? 'No data in selected range.' : undefined)}
        datasetOptions={[
          { value: 'trends', label: 'Check-ins/Trends' },
          { value: 'alerts', label: 'Alerts' },
        ]}
        datasetValue={patientExportDataset}
        onDatasetChange={(value) => {
          setPatientExportDataset(value === 'alerts' ? 'alerts' : 'trends');
          setPatientExportMessage(null);
        }}
        toggles={[
          {
            id: 'patient-export-include-notes',
            label: 'Include notes (sensitive)',
            checked: patientExportIncludeNotes,
            onChange: setPatientExportIncludeNotes,
            disabled: patientExportDataset !== 'trends',
          },
          {
            id: 'patient-export-include-advanced-alert-fields',
            label: 'Include advanced alert fields',
            checked: patientExportIncludeAdvancedAlertFields,
            onChange: setPatientExportIncludeAdvancedAlertFields,
          },
          {
            id: 'patient-export-include-notification-fields',
            label: 'Include notification fields',
            checked: patientExportIncludeNotificationFields,
            onChange: setPatientExportIncludeNotificationFields,
            disabled: patientExportDataset !== 'alerts',
          },
        ]}
        onRangeChange={(nextRange) => {
          setPatientExportRange(nextRange);
          setPatientExportMessage(null);
        }}
        onClose={() => setPatientExportOpen(false)}
        onDownload={() => {
          void handlePatientExportDownload();
        }}
      />

      <DayDetailPanel
        open={Boolean(selectedDayPoint)}
        dayPoint={selectedDayPoint}
        dayAlerts={selectedDayAlerts}
        returnFocusRef={dayDetailFocusRef}
        onClose={() => setSelectedDateKey(null)}
      />
    </div>
  );
}
