import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { Tabs } from '../components/ui/Tabs';
import { Section } from '../components/ui/Section';
import { ExportCsvModal } from '../components/export/ExportCsvModal';
import { DayDetailPanel } from '../components/patients/DayDetailPanel';
import { PatientAppointmentsPanel } from '../components/patients/PatientAppointmentsPanel';
import { PatientCommunicationPanel } from '../components/patients/PatientCommunicationPanel';
import { PatientDecisionSurface } from '../components/patients/PatientDecisionSurface';
import { PatientHandoffPanel } from '../components/patients/PatientHandoffPanel';
import { PatientSummaryCards } from '../components/patients/PatientSummaryCards';
import { PatientTasksPanel } from '../components/patients/PatientTasksPanel';
import { RecentAlertsPanel } from '../components/patients/RecentAlertsPanel';
import { TrendCharts } from '../components/patients/TrendCharts';
import { useCommunicationAuthoring } from '../hooks/useCommunicationAuthoring';
import { useClinicianIdentity } from '../hooks/useClinicianIdentity';
import { useMediaQuery } from '../hooks/useMediaQuery';
import {
  assignPromToPatient,
  completeClinicianTask,
  fetchPhotoBlob,
  generatePatientInsights,
  getDashboardCommunicationOverview,
  getPatientMedicationAdherence,
  getPatientPhotos,
  getPatientInsights,
  getPatientExerciseSessions,
  getPatientHydrationRange,
  getPatientNutritionRange,
  getPatientWearablesDaily,
  getPatientWearablesSummary,
  getPatientProms,
  getRehabPhases,
  listAppointmentRequests,
  listAlerts,
  listClinicianTasks,
  reviewInsight,
  setCurrentRehabPhase,
  tryGetPatientCheckinsRange,
  useClinicianWorklist,
  usePatients,
  usePatientTrends,
  useUpdateAlertStatus,
} from '../services/clinicianApi';
import {
  addCommunicationThreadReply,
  deriveCommunicationThreadForPatient,
  readCommunicationWorkspaceLocalState,
  type CommunicationTimelineEvent,
} from '../services/communicationWorkspace';
import {
  insertSignatureIntoDraft,
  insertTemplateIntoDraft,
} from '../services/communicationAuthoring';
import { getSeenMap, getSeenStorageKey, pruneSeenMap, type SeenAlertMap } from '../services/seenStore';
import type {
  AlertItem,
  InsightItem,
  AlertStatus,
  AppointmentRequestItem,
  ClinicianTaskItem,
  DashboardCommunicationOverviewItem,
  PatientSummary,
  PromDueCard,
  PromHistoryRow,
  RehabPayload,
  SymptomPhotoItem,
  TrendPointRaw,
  WorklistRecord,
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
  derivePatientCurrentPriorities,
  derivePatientRecommendedActions,
  type PatientActionKey,
  appointmentWorkflowLabel,
  appointmentWorkflowTone,
} from '../utils/patientDetail';
import {
  alertsForDate,
  deriveTrendSummary,
  filterAlertsForPatient,
  normalizeTrendPoints,
  trendPointHasAnyData,
} from '../utils/trends';
import { bodyMapRegionLabel } from '../utils/bodyMap';
import { formatDashboardRelativeTime } from '../utils/dashboard';
import type { PatientEntryContext } from '../utils/patientEntryContext';
import {
  formatPatientEntryReturnLabel,
  formatPatientEntryReviewHint,
  formatPatientEntrySourceCue,
  readPatientEntryContextFromState,
} from '../utils/patientEntryContext';

const ALERT_STATUSES: AlertStatus[] = ['open', 'acknowledged', 'resolved'];
const CLINICIAN_BUCKET = 'anon';
type PatientExportDataset = 'trends' | 'alerts';
type PatientDetailSectionId =
  | 'patient-priorities-section'
  | 'patient-summary-section'
  | 'patient-trends-section'
  | 'patient-operations-section'
  | 'patient-care-review-section'
  | 'patient-reference-section';
type TrendChartMetric = 'pain' | 'mood' | 'adherence';

const PATIENT_DETAIL_SECTIONS: Array<{ id: PatientDetailSectionId; label: string }> = [
  { id: 'patient-priorities-section', label: 'Priorities' },
  { id: 'patient-summary-section', label: 'Summary' },
  { id: 'patient-trends-section', label: 'Trends' },
  { id: 'patient-operations-section', label: 'Operations' },
  { id: 'patient-care-review-section', label: 'Care review' },
  { id: 'patient-reference-section', label: 'Reference' },
];

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

function toDateOnlyUTC(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(
    date.getUTCDate(),
  ).padStart(2, '0')}`;
}

function parseDateOnly(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [yearString, monthString, dayString] = value.split('-');
  const year = Number.parseInt(yearString, 10);
  const month = Number.parseInt(monthString, 10);
  const day = Number.parseInt(dayString, 10);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return parsed;
}

function mondayWeekStartForCurrentTimezone(): string {
  const tzOffsetMinutes = -new Date().getTimezoneOffset();
  const shiftedNow = new Date(Date.now() + tzOffsetMinutes * 60_000);
  const day = shiftedNow.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  const monday = new Date(
    Date.UTC(
      shiftedNow.getUTCFullYear(),
      shiftedNow.getUTCMonth(),
      shiftedNow.getUTCDate() - daysSinceMonday,
    ),
  );

  return toDateOnlyUTC(monday);
}

function addDaysToWeekStart(weekStart: string, deltaDays: number): string {
  const parsed = parseDateOnly(weekStart);
  if (!parsed) {
    return weekStart;
  }

  const next = new Date(parsed.getTime() + deltaDays * 24 * 60 * 60 * 1000);
  return toDateOnlyUTC(next);
}

function formatCountLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
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

function insightCategoryLabel(category: string): string {
  if (category === 'questionnaires') {
    return 'Questionnaires';
  }
  if (category === 'recovery') {
    return 'Recovery';
  }
  if (category === 'adherence') {
    return 'Adherence';
  }
  if (category === 'safety') {
    return 'Safety';
  }
  if (category === 'symptoms') {
    return 'Symptoms';
  }
  return 'Habits';
}

function insightConfidenceVariant(value: string): 'default' | 'success' | 'warning' | 'danger' {
  if (value === 'high') {
    return 'success';
  }
  if (value === 'medium') {
    return 'warning';
  }
  return 'default';
}

async function fetchPatientAlerts(patientId: string): Promise<AlertItem[]> {
  const collections = await Promise.all(ALERT_STATUSES.map((status) => listAlerts(status)));
  const merged = collections.flat();
  const filtered = filterAlertsForPatient(merged, patientId);

  return filtered.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}

function NoticeMessageList({
  messages,
}: {
  messages: string[];
}): JSX.Element {
  return (
    <>
      {messages.map((message, index) => (
        <Fragment key={`${index}-${message}`}>
          {index > 0 ? <br /> : null}
          <span>{message}</span>
        </Fragment>
      ))}
    </>
  );
}

export function PatientDetailPage(): JSX.Element {
  const { patientId } = useParams<{ patientId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const clinicianIdentity = useClinicianIdentity();
  const communicationAuthoring = useCommunicationAuthoring();
  const communicationScopeKey = clinicianIdentity.authScopeId ?? clinicianIdentity.clinicianId;
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedDays = parseDays(searchParams.get('days'));
  const isPrioritySupportResponsive = useMediaQuery('(max-width: 1320px)');

  const [entryContext, setEntryContext] = useState<PatientEntryContext | null>(null);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedRehabKey, setSelectedRehabKey] = useState('');
  const [rehabSaveError, setRehabSaveError] = useState<string | null>(null);
  const [isSavingRehab, setIsSavingRehab] = useState(false);
  const [promTemplateKey, setPromTemplateKey] = useState('AURA_RECOVERY_5');
  const [promDueAt, setPromDueAt] = useState('');
  const [promSaveError, setPromSaveError] = useState<string | null>(null);
  const [isAssigningProm, setIsAssigningProm] = useState(false);
  const [isGeneratingInsights, setIsGeneratingInsights] = useState(false);
  const [insightReviewingId, setInsightReviewingId] = useState<string | null>(null);
  const [insightActionError, setInsightActionError] = useState<string | null>(null);
  const [insightActionNotice, setInsightActionNotice] = useState<string | null>(null);
  const [operationsError, setOperationsError] = useState<string | null>(null);
  const [operationsNotice, setOperationsNotice] = useState<string | null>(null);
  const [openingPhotoId, setOpeningPhotoId] = useState<string | null>(null);
  const [photoOpenError, setPhotoOpenError] = useState<string | null>(null);
  const [seenAlertMap, setSeenAlertMap] = useState<SeenAlertMap>(() => getSeenMap(CLINICIAN_BUCKET));
  const [communicationLocalState, setCommunicationLocalState] = useState(() =>
    readCommunicationWorkspaceLocalState(communicationScopeKey),
  );
  const [patientQuickReply, setPatientQuickReply] = useState('');
  const [selectedQuickReplyTemplateId, setSelectedQuickReplyTemplateId] = useState('');
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
  const [isSymptomSignalsOpen, setIsSymptomSignalsOpen] = useState(false);
  const [isSupportSignalsOpen, setIsSupportSignalsOpen] = useState(false);
  const [activeSectionId, setActiveSectionId] =
    useState<PatientDetailSectionId>('patient-priorities-section');
  const [expandedTrendMetric, setExpandedTrendMetric] = useState<TrendChartMetric | null>(null);
  const dayDetailFocusRef = useRef<HTMLElement | null>(null);
  const entryContextConsumedRef = useRef(false);

  const pendingEntryContext = useMemo(
    () => readPatientEntryContextFromState(location.state, patientId),
    [location.state, patientId],
  );

  const patientsQuery = usePatients();
  const patientContext = useMemo(
    () => patientsQuery.data?.find((patient) => patient.id === patientId),
    [patientId, patientsQuery.data],
  );

  const trendsQuery = usePatientTrends(patientId, selectedDays);
  const recentSleepTo = useMemo(() => toDateOnlyUTC(new Date()), []);
  const recentSleepFrom = useMemo(
    () => addDaysToWeekStart(recentSleepTo, -6),
    [recentSleepTo],
  );

  const patientRecentCheckinsQuery = useQuery({
    queryKey: ['patient-recent-checkins', patientId, recentSleepFrom, recentSleepTo],
    queryFn: async () => {
      const rows = await tryGetPatientCheckinsRange(patientId ?? '', recentSleepFrom, recentSleepTo);
      return rows ?? [];
    },
    enabled: Boolean(patientId),
    staleTime: 7_000,
    retry: (failureCount, error) => failureCount < 2 && isRetryable(asAppError(error)),
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });

  const patientHydrationQuery = useQuery({
    queryKey: ['patient-hydration', patientId, recentSleepFrom, recentSleepTo],
    queryFn: () => getPatientHydrationRange(patientId ?? '', recentSleepFrom, recentSleepTo),
    enabled: Boolean(patientId),
    staleTime: 7_000,
    retry: (failureCount, error) => failureCount < 2 && isRetryable(asAppError(error)),
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });

  const patientNutritionQuery = useQuery({
    queryKey: ['patient-nutrition', patientId, recentSleepFrom, recentSleepTo],
    queryFn: () => getPatientNutritionRange(patientId ?? '', recentSleepFrom, recentSleepTo),
    enabled: Boolean(patientId),
    staleTime: 7_000,
    retry: (failureCount, error) => failureCount < 2 && isRetryable(asAppError(error)),
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });

  const patientWearablesSummaryQuery = useQuery({
    queryKey: ['patient-wearables-summary', patientId, recentSleepFrom, recentSleepTo],
    queryFn: () =>
      getPatientWearablesSummary(patientId ?? '', recentSleepFrom, recentSleepTo, 'mock'),
    enabled: Boolean(patientId),
    staleTime: 7_000,
    retry: (failureCount, error) => failureCount < 2 && isRetryable(asAppError(error)),
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });

  const patientWearablesDailyQuery = useQuery({
    queryKey: ['patient-wearables-daily', patientId, recentSleepFrom, recentSleepTo],
    queryFn: () =>
      getPatientWearablesDaily(patientId ?? '', recentSleepFrom, recentSleepTo, 'mock'),
    enabled: Boolean(patientId),
    staleTime: 7_000,
    retry: (failureCount, error) => failureCount < 2 && isRetryable(asAppError(error)),
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });

  const patientMedicationAdherenceQuery = useQuery({
    queryKey: ['patient-medications-adherence', patientId, recentSleepFrom, recentSleepTo],
    queryFn: () =>
      getPatientMedicationAdherence(patientId ?? '', recentSleepFrom, recentSleepTo),
    enabled: Boolean(patientId),
    staleTime: 7_000,
    retry: (failureCount, error) => failureCount < 2 && isRetryable(asAppError(error)),
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });

  const patientPhotosQuery = useQuery({
    queryKey: ['patient-photos', patientId, recentSleepFrom, recentSleepTo],
    queryFn: () =>
      getPatientPhotos(patientId ?? '', {
        limit: 20,
        from: recentSleepFrom,
        to: recentSleepTo,
      }),
    enabled: Boolean(patientId),
    staleTime: 7_000,
    retry: (failureCount, error) => failureCount < 2 && isRetryable(asAppError(error)),
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });

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

  const patientInsightsQuery = useQuery({
    queryKey: ['patient-insights', patientId],
    queryFn: async () => {
      const [pending, approved] = await Promise.all([
        getPatientInsights(patientId ?? '', 'pending', 20),
        getPatientInsights(patientId ?? '', 'approved', 20),
      ]);
      return { pending, approved };
    },
    enabled: Boolean(patientId),
    staleTime: 7_000,
    retry: (failureCount, error) => failureCount < 2 && isRetryable(asAppError(error)),
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });

  const patientWorklistQuery = useClinicianWorklist({
    search: patientId,
    sort: 'priority',
  });
  const appointmentWindowFrom = useMemo(() => addDaysToWeekStart(recentSleepTo, -30), [recentSleepTo]);
  const appointmentWindowTo = useMemo(() => addDaysToWeekStart(recentSleepTo, 60), [recentSleepTo]);

  const patientCommunicationQuery = useQuery({
    queryKey: ['patient-communication-overview', patientId],
    queryFn: () => getDashboardCommunicationOverview(100),
    enabled: Boolean(patientId),
    staleTime: 7_000,
    retry: (failureCount, error) => failureCount < 2 && isRetryable(asAppError(error)),
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });

  const patientTasksQuery = useQuery({
    queryKey: ['patient-tasks', patientId],
    queryFn: () =>
      listClinicianTasks({
        patientId: patientId ?? '',
        status: ['open', 'in_progress', 'completed'],
        sortBy: 'createdAt',
        sortDirection: 'desc',
      }),
    enabled: Boolean(patientId),
    staleTime: 7_000,
    retry: (failureCount, error) => failureCount < 2 && isRetryable(asAppError(error)),
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });

  const patientAppointmentsQuery = useQuery({
    queryKey: ['patient-appointments', patientId, appointmentWindowFrom, appointmentWindowTo],
    queryFn: () =>
      listAppointmentRequests({
        from: appointmentWindowFrom,
        to: appointmentWindowTo,
        limit: 100,
      }),
    enabled: Boolean(patientId),
    staleTime: 7_000,
    retry: (failureCount, error) => failureCount < 2 && isRetryable(asAppError(error)),
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });

  const updateAlertMutation = useUpdateAlertStatus();
  const completeTaskMutation = useMutation({
    mutationFn: (taskId: string) => completeClinicianTask(taskId),
    onSuccess: async () => {
      setOperationsError(null);
      setOperationsNotice('Task marked complete.');
      await Promise.allSettled([
        patientTasksQuery.refetch(),
        patientWorklistQuery.refetch(),
        patientCommunicationQuery.refetch(),
      ]);
    },
    onError: (error) => {
      setOperationsNotice(null);
      setOperationsError(toUserMessage(asAppError(error)));
    },
  });

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
    setIsSymptomSignalsOpen(false);
    setIsSupportSignalsOpen(false);
  }, [patientId]);

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
  const recentSleepRows = useMemo(
    () =>
      ((patientRecentCheckinsQuery.data ?? []) as TrendPointRaw[])
        .map((row) => {
          const hours = typeof row.sleep?.hours === 'number' ? row.sleep.hours : null;
          const quality = typeof row.sleep?.quality === 'number' ? row.sleep.quality : null;
          const disturbances =
            typeof row.sleep?.disturbances === 'number' ? row.sleep.disturbances : null;
          if (hours === null && quality === null && disturbances === null) {
            return null;
          }
          return {
            date: row.date,
            hours,
            quality,
            disturbances,
          };
        })
        .filter(
          (
            row,
          ): row is { date: string; hours: number | null; quality: number | null; disturbances: number | null } =>
            Boolean(row),
        )
        .sort((left, right) => Date.parse(right.date) - Date.parse(left.date)),
    [patientRecentCheckinsQuery.data],
  );
  const recentSleepSummary = useMemo(() => {
    const hours = recentSleepRows
      .map((row) => row.hours)
      .filter((value): value is number => value !== null);
    const quality = recentSleepRows
      .map((row) => row.quality)
      .filter((value): value is number => value !== null);
    const avgHours =
      hours.length > 0
        ? Math.round((hours.reduce((sum, value) => sum + value, 0) / hours.length) * 10) / 10
        : null;
    const avgQuality =
      quality.length > 0
        ? Math.round((quality.reduce((sum, value) => sum + value, 0) / quality.length) * 10) / 10
        : null;
    return {
      avgHours,
      avgQuality,
      trackedCount: recentSleepRows.length,
    };
  }, [recentSleepRows]);
  const recentBodyMapRows = useMemo(
    () =>
      ((patientRecentCheckinsQuery.data ?? []) as TrendPointRaw[])
        .map((row) => {
          const regions = Array.isArray(row.bodyMap?.regions)
            ? row.bodyMap.regions
                .map((entry) => {
                  const region = typeof entry.region === 'string' ? entry.region : null;
                  const intensity =
                    typeof entry.intensity === 'number' && Number.isFinite(entry.intensity)
                      ? entry.intensity
                      : null;
                  if (!region || intensity === null) {
                    return null;
                  }
                  return {
                    region,
                    intensity,
                    type: typeof entry.type === 'string' ? entry.type : undefined,
                  };
                })
                .filter(
                  (
                    entry,
                  ): entry is { region: string; intensity: number; type?: string } =>
                    Boolean(entry),
                )
            : [];
          if (regions.length === 0) {
            return null;
          }
          return {
            date: row.date,
            regions,
          };
        })
        .filter((row): row is { date: string; regions: Array<{ region: string; intensity: number; type?: string }> } =>
          Boolean(row),
        )
        .sort((left, right) => Date.parse(right.date) - Date.parse(left.date)),
    [patientRecentCheckinsQuery.data],
  );
  const recentBodyMapSummary = useMemo(() => {
    const byRegion = new Map<string, number>();
    for (const row of recentBodyMapRows) {
      for (const region of row.regions) {
        byRegion.set(region.region, (byRegion.get(region.region) ?? 0) + 1);
      }
    }
    return [...byRegion.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 3)
      .map(([region, count]) => ({
        region,
        label: bodyMapRegionLabel(region),
        count,
      }));
  }, [recentBodyMapRows]);
  const recentHydrationDays = useMemo(
    () =>
      (patientHydrationQuery.data?.days ?? [])
        .map((day) => ({
          date: day.date,
          totalMl: typeof day.totalMl === 'number' ? day.totalMl : 0,
          metTarget:
            typeof day.metTarget === 'boolean'
              ? day.metTarget
              : typeof day.totalMl === 'number'
                ? day.totalMl >= 2000
                : false,
        }))
        .sort((left, right) => Date.parse(right.date) - Date.parse(left.date)),
    [patientHydrationQuery.data?.days],
  );
  const recentHydrationSummary = useMemo(() => {
    if (recentHydrationDays.length === 0) {
      return {
        avgDailyMl: null as number | null,
        daysMeetingTarget: 0,
      };
    }

    const total = recentHydrationDays.reduce((sum, day) => sum + day.totalMl, 0);
    const avgDailyMl = Math.round((total / recentHydrationDays.length) * 10) / 10;
    const daysMeetingTarget = recentHydrationDays.filter((day) => day.totalMl >= 2000).length;
    return {
      avgDailyMl,
      daysMeetingTarget,
    };
  }, [recentHydrationDays]);
  const recentNutritionDays = useMemo(
    () =>
      (patientNutritionQuery.data?.days ?? [])
        .map((day) => ({
          date: day.date,
          entry: day.entry
            ? {
                ...day.entry,
                fruitVegServings:
                  typeof day.entry.fruitVegServings === 'number' ? day.entry.fruitVegServings : 0,
              }
            : null,
        }))
        .sort((left, right) => Date.parse(right.date) - Date.parse(left.date)),
    [patientNutritionQuery.data?.days],
  );
  const recentNutritionSummary = useMemo(() => {
    const withEntry = recentNutritionDays.filter((day) => day.entry !== null);
    if (withEntry.length === 0) {
      return {
        trackedDays: 0,
        avgFruitVeg: null as number | null,
        proteinOkHighDays: 0,
      };
    }

    const fruitVegTotal = withEntry.reduce((sum, day) => sum + (day.entry?.fruitVegServings ?? 0), 0);
    const avgFruitVeg = Math.round((fruitVegTotal / withEntry.length) * 10) / 10;
    const proteinOkHighDays = withEntry.filter((day) => {
      const protein = day.entry?.protein;
      return protein === 'ok' || protein === 'high';
    }).length;

    return {
      trackedDays: withEntry.length,
      avgFruitVeg,
      proteinOkHighDays,
    };
  }, [recentNutritionDays]);
  const recentWearablesDays = useMemo(
    () =>
      (patientWearablesDailyQuery.data?.days ?? [])
        .map((day) => ({
          date: day.date,
          steps: typeof day.steps === 'number' ? day.steps : null,
          activeMinutes: typeof day.activeMinutes === 'number' ? day.activeMinutes : null,
          restingHr: typeof day.restingHr === 'number' ? day.restingHr : null,
        }))
        .sort((left, right) => Date.parse(right.date) - Date.parse(left.date)),
    [patientWearablesDailyQuery.data?.days],
  );
  const recentWearablesSummary = useMemo(
    () => ({
      trackedDays: patientWearablesSummaryQuery.data?.trackedDays ?? 0,
      avgSteps: patientWearablesSummaryQuery.data?.avgSteps ?? null,
      avgActiveMinutes: patientWearablesSummaryQuery.data?.avgActiveMinutes ?? null,
      avgRestingHr: patientWearablesSummaryQuery.data?.avgRestingHr ?? null,
      source: patientWearablesSummaryQuery.data?.source ?? 'mock',
    }),
    [
      patientWearablesSummaryQuery.data?.avgActiveMinutes,
      patientWearablesSummaryQuery.data?.avgRestingHr,
      patientWearablesSummaryQuery.data?.avgSteps,
      patientWearablesSummaryQuery.data?.source,
      patientWearablesSummaryQuery.data?.trackedDays,
    ],
  );
  const recentMedicationDays = useMemo(
    () =>
      (patientMedicationAdherenceQuery.data?.days ?? [])
        .map((day) => ({
          date: day.date,
          taken: typeof day.taken === 'number' ? day.taken : 0,
          skipped: typeof day.skipped === 'number' ? day.skipped : 0,
          totalScheduled:
            typeof day.totalScheduled === 'number' ? day.totalScheduled : 0,
        }))
        .sort((left, right) => Date.parse(right.date) - Date.parse(left.date)),
    [patientMedicationAdherenceQuery.data?.days],
  );
  const recentMedicationSummary = useMemo(() => {
    if (recentMedicationDays.length === 0) {
      return {
        scheduled: 0,
        taken: 0,
        skipped: 0,
        adherencePct: null as number | null,
      };
    }

    const scheduled = recentMedicationDays.reduce((sum, day) => sum + day.totalScheduled, 0);
    const taken = recentMedicationDays.reduce((sum, day) => sum + day.taken, 0);
    const skipped = recentMedicationDays.reduce((sum, day) => sum + day.skipped, 0);
    const adherencePct =
      scheduled > 0 ? Math.round((taken / scheduled) * 100) : null;

    return {
      scheduled,
      taken,
      skipped,
      adherencePct,
    };
  }, [recentMedicationDays]);
  const recentPhotos = useMemo<SymptomPhotoItem[]>(
    () => (patientPhotosQuery.data?.items ?? []).slice(0, 7),
    [patientPhotosQuery.data?.items],
  );
  const recentPhotoSummary = useMemo(() => {
    if (recentPhotos.length === 0) {
      return {
        total: 0,
        swelling: 0,
        wound: 0,
        rash: 0,
        other: 0,
      };
    }

    let swelling = 0;
    let wound = 0;
    let rash = 0;
    let other = 0;
    for (const item of recentPhotos) {
      if (item.kind === 'swelling') {
        swelling += 1;
      } else if (item.kind === 'wound') {
        wound += 1;
      } else if (item.kind === 'rash') {
        rash += 1;
      } else {
        other += 1;
      }
    }

    return {
      total: recentPhotos.length,
      swelling,
      wound,
      rash,
      other,
    };
  }, [recentPhotos]);

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
  const patientPendingInsights = useMemo<InsightItem[]>(
    () => patientInsightsQuery.data?.pending ?? [],
    [patientInsightsQuery.data?.pending],
  );
  const patientApprovedInsights = useMemo<InsightItem[]>(
    () => patientInsightsQuery.data?.approved ?? [],
    [patientInsightsQuery.data?.approved],
  );
  const hasSymptomReference =
    recentSleepRows.length > 0 || recentBodyMapRows.length > 0 || recentPhotos.length > 0;
  const hasSupportSignals =
    recentHydrationDays.length > 0 ||
    recentNutritionDays.length > 0 ||
    recentWearablesSummary.trackedDays > 0 ||
    recentMedicationDays.length > 0;
  const hasCareReviewItems = patientPromDue.length > 0 || patientPendingInsights.length > 0;
  const symptomReferenceFacts = useMemo(
    () => [
      {
        label: 'Sleep detail',
        value:
          patientRecentCheckinsQuery.isLoading && recentSleepRows.length === 0
            ? 'Loading recent detail'
            : recentSleepRows.length > 0
              ? formatCountLabel(recentSleepRows.length, 'recent entry', 'recent entries')
              : 'No recent entries',
      },
      {
        label: 'Body map',
        value:
          patientRecentCheckinsQuery.isLoading && recentBodyMapRows.length === 0
            ? 'Loading recent detail'
            : recentBodyMapRows.length > 0
              ? formatCountLabel(recentBodyMapRows.length, 'mapped day', 'mapped days')
              : 'No recent entries',
      },
      {
        label: 'Symptom photos',
        value:
          patientPhotosQuery.isLoading && recentPhotos.length === 0
            ? 'Loading recent detail'
            : recentPhotos.length > 0
              ? formatCountLabel(recentPhotos.length, 'photo', 'photos')
              : 'No recent uploads',
      },
    ],
    [
      patientPhotosQuery.isLoading,
      patientRecentCheckinsQuery.isLoading,
      recentBodyMapRows.length,
      recentPhotos.length,
      recentSleepRows.length,
    ],
  );
  const supportSignalFacts = useMemo(
    () => [
      {
        label: 'Hydration',
        value:
          patientHydrationQuery.isLoading && recentHydrationDays.length === 0
            ? 'Loading recent detail'
            : recentHydrationDays.length > 0
              ? formatCountLabel(recentHydrationDays.length, 'tracked day', 'tracked days')
              : 'No recent logs',
      },
      {
        label: 'Nutrition',
        value:
          patientNutritionQuery.isLoading && recentNutritionDays.length === 0
            ? 'Loading recent detail'
            : recentNutritionDays.length > 0
              ? formatCountLabel(recentNutritionDays.length, 'tracked day', 'tracked days')
              : 'No recent logs',
      },
      {
        label: 'Wearables',
        value:
          patientWearablesSummaryQuery.isLoading && recentWearablesSummary.trackedDays === 0
            ? 'Loading recent detail'
            : recentWearablesSummary.trackedDays > 0
              ? formatCountLabel(recentWearablesSummary.trackedDays, 'tracked day', 'tracked days')
              : 'No recent logs',
      },
      {
        label: 'Medication',
        value:
          patientMedicationAdherenceQuery.isLoading && recentMedicationDays.length === 0
            ? 'Loading recent detail'
            : recentMedicationDays.length > 0
              ? formatCountLabel(recentMedicationDays.length, 'tracked day', 'tracked days')
              : 'No recent logs',
      },
    ],
    [
      patientHydrationQuery.isLoading,
      patientMedicationAdherenceQuery.isLoading,
      patientNutritionQuery.isLoading,
      patientWearablesSummaryQuery.isLoading,
      recentHydrationDays.length,
      recentMedicationDays.length,
      recentNutritionDays.length,
      recentWearablesSummary.trackedDays,
    ],
  );
  const patientWorklistItem = useMemo<WorklistRecord | null>(() => {
    const items = patientWorklistQuery.data?.items ?? [];
    return items.find((item) => item.patientId === patientId) ?? null;
  }, [patientId, patientWorklistQuery.data?.items]);
  const patientCommunicationItems = useMemo<DashboardCommunicationOverviewItem[]>(
    () =>
      (patientCommunicationQuery.data?.items ?? [])
        .filter((item) => item.patientId === patientId)
        .sort((left, right) => Date.parse(right.messageCreatedAt) - Date.parse(left.messageCreatedAt)),
    [patientCommunicationQuery.data?.items, patientId],
  );
  const patientCommunicationThread = useMemo(
    () =>
      deriveCommunicationThreadForPatient(
        patientCommunicationItems,
        patientId ?? '',
        communicationLocalState,
      ),
    [communicationLocalState, patientCommunicationItems, patientId],
  );
  const patientCommunicationTimeline = useMemo<CommunicationTimelineEvent[]>(
    () => patientCommunicationThread?.timeline ?? [],
    [patientCommunicationThread],
  );
  const patientCommunicationBlockedBySafety = patientCommunicationItems.some(
    (item) => item.flaggedBySafety,
  );
  const canQuickReplyFromPatientDetail =
    patientCommunicationItems.length > 0 && !patientCommunicationBlockedBySafety;
  const selectedQuickReplyTemplate = useMemo(
    () =>
      communicationAuthoring.templates.find(
        (template) => template.id === selectedQuickReplyTemplateId,
      ) ?? null,
    [communicationAuthoring.templates, selectedQuickReplyTemplateId],
  );

  useEffect(() => {
    setCommunicationLocalState(readCommunicationWorkspaceLocalState(communicationScopeKey));
  }, [communicationScopeKey]);

  useEffect(() => {
    if (communicationAuthoring.templates.length === 0) {
      setSelectedQuickReplyTemplateId('');
      return;
    }

    if (
      !communicationAuthoring.templates.some(
        (template) => template.id === selectedQuickReplyTemplateId,
      )
    ) {
      setSelectedQuickReplyTemplateId(communicationAuthoring.templates[0]?.id ?? '');
    }
  }, [communicationAuthoring.templates, selectedQuickReplyTemplateId]);

  const patientTasks = useMemo<ClinicianTaskItem[]>(
    () => (patientTasksQuery.data ?? []).filter((task) => task.patientId === patientId),
    [patientId, patientTasksQuery.data],
  );
  const patientActiveTasks = useMemo<ClinicianTaskItem[]>(
    () =>
      patientTasks
        .filter((task) => task.status === 'open' || task.status === 'in_progress')
        .sort((left, right) => {
          const leftDue = Date.parse(left.dueAt ?? left.updatedAt);
          const rightDue = Date.parse(right.dueAt ?? right.updatedAt);
          return leftDue - rightDue;
        }),
    [patientTasks],
  );
  const patientRecentCompletedTasks = useMemo<ClinicianTaskItem[]>(
    () =>
      patientTasks
        .filter((task) => task.status === 'completed')
        .sort((left, right) => Date.parse(right.completedAt ?? right.updatedAt) - Date.parse(left.completedAt ?? left.updatedAt))
        .slice(0, 3),
    [patientTasks],
  );
  const patientAppointments = useMemo<AppointmentRequestItem[]>(
    () =>
      (patientAppointmentsQuery.data ?? [])
        .filter((item) => item.patientId === patientId)
        .sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt)),
    [patientAppointmentsQuery.data, patientId],
  );

  const openAlertCount = useMemo(
    () => patientAlerts.filter((alert) => alert.status === 'open').length,
    [patientAlerts],
  );
  const openPatientAlerts = useMemo(
    () =>
      patientAlerts
        .filter((alert) => alert.status === 'open')
        .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)),
    [patientAlerts],
  );

  const selectedDayPoint = useMemo(
    () => normalizedTrends.find((point) => point.date === selectedDateKey) ?? null,
    [normalizedTrends, selectedDateKey],
  );

  const thisWeekStart = useMemo(() => mondayWeekStartForCurrentTimezone(), []);
  const lastWeekStart = useMemo(() => addDaysToWeekStart(thisWeekStart, -7), [thisWeekStart]);

  const selectedDayAlerts = useMemo(
    () => (selectedDayPoint ? alertsForDate(patientAlerts, selectedDayPoint.date) : []),
    [patientAlerts, selectedDayPoint],
  );

  const hasTrendData = normalizedTrends.some((point) => trendPointHasAnyData(point));
  const patientExportRangeError = validateDateRange(patientExportRange);
  const currentRehabPhaseTitle =
    patientRehab?.phases.find((phase) => phase.key === patientRehab.currentKey)?.title ??
    patientWorklistItem?.rehabPhase ??
    null;
  const patientPriorities = useMemo(
    () =>
      derivePatientCurrentPriorities({
        worklistItem: patientWorklistItem,
        openAlerts: openPatientAlerts,
        communicationItems: patientCommunicationItems,
        activeTasks: patientActiveTasks,
        appointments: patientAppointments,
        trendSummary,
      }),
    [
      openPatientAlerts,
      patientActiveTasks,
      patientAppointments,
      patientCommunicationItems,
      patientWorklistItem,
      trendSummary,
    ],
  );
  const recommendedActions = useMemo(
    () =>
      derivePatientRecommendedActions({
        worklistItem: patientWorklistItem,
        openAlerts: openPatientAlerts,
        communicationItems: patientCommunicationItems,
        activeTasks: patientActiveTasks,
        appointments: patientAppointments,
        trendSummary,
      }),
    [
      openPatientAlerts,
      patientActiveTasks,
      patientAppointments,
      patientCommunicationItems,
      patientWorklistItem,
      trendSummary,
    ],
  );
  const patientPrioritiesError =
    patientPriorities.length === 0 &&
    (patientWorklistQuery.error ||
      patientTasksQuery.error ||
      patientCommunicationQuery.error ||
      patientAppointmentsQuery.error)
      ? 'Some operational signals could not be loaded. Retry to refresh the patient priorities.'
      : null;
  const recommendedActionsError =
    recommendedActions.length === 0 &&
    (patientWorklistQuery.error || patientTasksQuery.error || patientAppointmentsQuery.error)
      ? 'Recommended next steps are unavailable until the patient operational context reloads.'
      : null;

  const showTrendsLoading = trendsQuery.isLoading && trendData.length === 0;

  function handleDaySelect(date: string, triggerElement?: HTMLElement | null): void {
    if (triggerElement) {
      dayDetailFocusRef.current = triggerElement;
    }

    setSelectedDateKey(date);
  }

  const scrollToPanel = useCallback((panelId: string): void => {
    if (typeof document === 'undefined') {
      return;
    }

    document.getElementById(panelId)?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }, []);

  const handleSectionJump = useCallback(
    (sectionId: PatientDetailSectionId): void => {
      setActiveSectionId(sectionId);
      scrollToPanel(sectionId);
    },
    [scrollToPanel],
  );

  const openCommunicationWorkspace = useCallback((): void => {
    if (!patientId) {
      return;
    }

    navigate(`/communication?patientId=${encodeURIComponent(patientId)}`);
  }, [navigate, patientId]);

  const openAlertsFromPatientCommunication = useCallback((): void => {
    if (!patientId) {
      return;
    }

    navigate(`/alerts?patientId=${encodeURIComponent(patientId)}&source=chat`);
  }, [navigate, patientId]);

  const handlePatientQuickReply = useCallback((): void => {
    if (!patientId || !canQuickReplyFromPatientDetail) {
      return;
    }

    const nextReply = patientQuickReply.trim();
    if (!nextReply) {
      return;
    }

    setCommunicationLocalState((current) =>
      addCommunicationThreadReply(
        current,
        {
          patientId,
          text: nextReply,
        },
        communicationScopeKey,
      ),
    );
    setPatientQuickReply('');
  }, [canQuickReplyFromPatientDetail, communicationScopeKey, patientId, patientQuickReply]);

  const handleInsertPatientQuickReplyTemplate = useCallback((): void => {
    if (!selectedQuickReplyTemplate) {
      return;
    }

    setPatientQuickReply((current) =>
      insertTemplateIntoDraft(current, selectedQuickReplyTemplate.body, {
        signature: communicationAuthoring.defaultSignature,
      }),
    );
  }, [communicationAuthoring.defaultSignature, selectedQuickReplyTemplate]);

  const handleInsertPatientQuickReplySignature = useCallback((): void => {
    if (!communicationAuthoring.hasSignature) {
      return;
    }

    setPatientQuickReply((current) =>
      insertSignatureIntoDraft(current, communicationAuthoring.defaultSignature),
    );
  }, [communicationAuthoring.defaultSignature, communicationAuthoring.hasSignature]);

  const handleOperationalAction = useCallback(
    (key: PatientActionKey): void => {
      if (key === 'alerts') {
        scrollToPanel('patient-trends-section');
        return;
      }

      if (key === 'communication') {
        openCommunicationWorkspace();
        return;
      }

      if (key === 'tasks') {
        scrollToPanel('patient-tasks-panel');
        return;
      }

      if (key === 'appointments') {
        navigate('/appointments');
        return;
      }

      if (key === 'worklist') {
        navigate('/worklist');
        return;
      }

      if (key === 'plan') {
        navigate(`/patients/${patientId}/plan`);
        return;
      }

      scrollToPanel('patient-trends-section');
    },
    [navigate, openCommunicationWorkspace, patientId, scrollToPanel],
  );

  useEffect(() => {
    setExpandedTrendMetric(null);
  }, [selectedDays]);

  useEffect(() => {
    if (!hasTrendData && expandedTrendMetric !== null) {
      setExpandedTrendMetric(null);
    }
  }, [expandedTrendMetric, hasTrendData]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    const Observer = window.IntersectionObserver;
    if (typeof Observer !== 'function') {
      return;
    }

    const elements = PATIENT_DETAIL_SECTIONS.map(({ id }) => document.getElementById(id)).filter(
      (element): element is HTMLElement => Boolean(element),
    );
    if (elements.length === 0) {
      return;
    }

    const observer = new Observer(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio);

        const nextId = visible[0]?.target.id as PatientDetailSectionId | undefined;
        if (nextId) {
          setActiveSectionId(nextId);
        }
      },
      {
        rootMargin: '-18% 0px -58% 0px',
        threshold: [0.1, 0.25, 0.4, 0.65],
      },
    );

    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [selectedDays, patientCommunicationItems.length, patientPriorities.length]);

  useEffect(() => {
    setPatientQuickReply('');
  }, [patientId, canQuickReplyFromPatientDetail]);

  const handleRefreshOverview = useCallback((): void => {
    void Promise.allSettled([
      trendsQuery.refetch(),
      patientAlertsQuery.refetch(),
      patientWorklistQuery.refetch(),
      patientTasksQuery.refetch(),
      patientCommunicationQuery.refetch(),
      patientAppointmentsQuery.refetch(),
    ]);
  }, [
    patientAlertsQuery,
    patientAppointmentsQuery,
    patientCommunicationQuery,
    patientTasksQuery,
    patientWorklistQuery,
    trendsQuery,
  ]);

  const handleCompleteTask = useCallback(
    (taskId: string): void => {
      setOperationsError(null);
      setOperationsNotice(null);
      completeTaskMutation.mutate(taskId);
    },
    [completeTaskMutation],
  );

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

  async function handleOpenPhoto(photoId: string): Promise<void> {
    if (!photoId) {
      return;
    }

    setPhotoOpenError(null);
    setOpeningPhotoId(photoId);
    try {
      const blob = await fetchPhotoBlob(photoId);
      const objectUrl = URL.createObjectURL(blob);
      window.open(objectUrl, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => {
        URL.revokeObjectURL(objectUrl);
      }, 60_000);
    } catch (error) {
      setPhotoOpenError(toUserMessage(asAppError(error)));
    } finally {
      setOpeningPhotoId(null);
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

  async function handleGenerateInsights(): Promise<void> {
    if (!patientId) {
      return;
    }

    setInsightActionError(null);
    setInsightActionNotice(null);
    setIsGeneratingInsights(true);
    try {
      const result = await generatePatientInsights(patientId, 14);
      setInsightActionNotice(
        `Generated ${result.created} pending insight${result.created === 1 ? '' : 's'} (${result.skipped} duplicate${result.skipped === 1 ? '' : 's'} skipped).`,
      );
      await patientInsightsQuery.refetch();
    } catch (error) {
      setInsightActionError(toUserMessage(asAppError(error)));
    } finally {
      setIsGeneratingInsights(false);
    }
  }

  async function handleReviewPatientInsight(
    insightId: string,
    status: 'approved' | 'rejected',
  ): Promise<void> {
    setInsightActionError(null);
    setInsightActionNotice(null);
    setInsightReviewingId(`${insightId}:${status}`);
    try {
      await reviewInsight(insightId, status);
      setInsightActionNotice(status === 'approved' ? 'Insight approved.' : 'Insight rejected.');
      await patientInsightsQuery.refetch();
    } catch (error) {
      setInsightActionError(toUserMessage(asAppError(error)));
    } finally {
      setInsightReviewingId(null);
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

  const handleRefreshReviewSignals = useCallback((): void => {
    void Promise.allSettled([trendsQuery.refetch(), patientAlertsQuery.refetch()]);
  }, [patientAlertsQuery, trendsQuery]);

  const handleRefreshCareReview = useCallback((): void => {
    void Promise.allSettled([
      patientRehabQuery.refetch(),
      patientPromsQuery.refetch(),
      patientInsightsQuery.refetch(),
      patientSessionsQuery.refetch(),
    ]);
  }, [patientInsightsQuery, patientPromsQuery, patientRehabQuery, patientSessionsQuery]);

  const handleRefreshReferenceSignals = useCallback((): void => {
    void Promise.allSettled([
      patientRecentCheckinsQuery.refetch(),
      patientHydrationQuery.refetch(),
      patientNutritionQuery.refetch(),
      patientWearablesSummaryQuery.refetch(),
      patientWearablesDailyQuery.refetch(),
      patientMedicationAdherenceQuery.refetch(),
      patientPhotosQuery.refetch(),
    ]);
  }, [
    patientHydrationQuery,
    patientMedicationAdherenceQuery,
    patientNutritionQuery,
    patientPhotosQuery,
    patientRecentCheckinsQuery,
    patientWearablesDailyQuery,
    patientWearablesSummaryQuery,
  ]);

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

  useEffect(() => {
    setEntryContext(null);
    entryContextConsumedRef.current = false;
  }, [patientId]);

  useEffect(() => {
    if (!pendingEntryContext || entryContextConsumedRef.current) {
      return;
    }

    entryContextConsumedRef.current = true;
    setEntryContext(pendingEntryContext);
    navigate(
      {
        pathname: location.pathname,
        search: location.search,
      },
      { replace: true, state: null },
    );
  }, [location.pathname, location.search, navigate, pendingEntryContext]);

  if (!patientId) {
    return (
      <div className="page-stack dashboard-page-shell dashboard-page-shell--patient patient-detail-page patient-detail-page--missing">
        <Section
          className="dashboard-page-header dashboard-page-header--patient"
          eyebrow="Clinician cockpit"
          title="Patient detail"
          subtitle="Open a patient record from roster, queue, schedule, or guidance review to continue clinician review."
        />
        <section className="patient-detail-missing" aria-label="Patient detail unavailable">
          <div className="patient-detail-missing__copy">
            <p className="patient-detail-missing__eyebrow">Missing route context</p>
            <h2 className="patient-detail-missing__title">Patient not found</h2>
            <p className="patient-detail-missing__text">
              No patient identifier was provided in the route, so the cockpit could not open a chart.
            </p>
          </div>
          <EmptyState
            title="Choose a patient to continue"
            description="Return to the roster and open a patient record from the live clinician workflow."
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  navigate('/patients');
                }}
              >
                Back to patients
              </Button>
            }
          />
        </section>
      </div>
    );
  }

  const patientDisplayName = patientContext?.displayName?.trim() || patientId;
  const nextPatientAppointment =
    patientAppointments.find((item) => Date.parse(item.startsAt) >= Date.now()) ?? patientAppointments[0] ?? null;
  const currentContextTitle =
    patientWorklistItem?.topIssue?.trim() ||
    patientPriorities[0]?.title ||
    'Stable review window';
  const currentContextBody =
    patientWorklistItem?.reviewReason?.trim() ||
    patientPriorities[0]?.reason ||
    'Use the priorities, trends, and operational panels below to confirm the next clinician step.';
  const normalizedCurrentContextTitle = currentContextTitle.replace(/\s+/g, ' ').trim().toLowerCase();
  const normalizedCurrentContextBody = currentContextBody.replace(/\s+/g, ' ').trim().toLowerCase();
  const entryReviewHint = (() => {
    if (!entryContext) {
      return null;
    }

    const normalizedHint = entryContext.hint?.replace(/\s+/g, ' ').trim();

    if (normalizedHint && normalizedHint.length <= 56) {
      const hintLower = normalizedHint.toLowerCase();

      if (
        hintLower !== normalizedCurrentContextTitle &&
        hintLower !== normalizedCurrentContextBody &&
        !normalizedCurrentContextBody.includes(hintLower)
      ) {
        return normalizedHint;
      }
    }

    return formatPatientEntryReviewHint(entryContext.source);
  })();
  const hasSourceReturnLink =
    entryContext !== null && (entryContext.returnTo !== '/patients' || entryContext.source === 'patients');
  const returnLinkTo = hasSourceReturnLink ? entryContext.returnTo : '/patients';
  const returnLinkLabel =
    entryContext && hasSourceReturnLink
      ? formatPatientEntryReturnLabel(entryContext.source)
      : 'Back to patients';
  const entrySourceCue = entryContext ? formatPatientEntrySourceCue(entryContext.source) : null;
  const activeFollowUpCount = patientActiveTasks.length + patientCommunicationItems.length;
  const urgentTaskCount = patientActiveTasks.filter((task) => task.priority === 'urgent').length;
  const patientBriefFacts: Array<{
    label: string;
    value: string;
    note: string;
    tone: 'critical' | 'warning' | 'active' | 'stable' | 'neutral';
  }> = [
    {
      label: 'Open alerts',
      value: String(openAlertCount),
      note: openAlertCount > 0 ? 'Safety review required now' : 'Queue clear for now',
      tone: openAlertCount > 0 ? 'critical' : 'stable',
    },
    {
      label: 'Follow-through',
      value: activeFollowUpCount > 0 ? String(activeFollowUpCount) : 'Steady',
      note:
        urgentTaskCount > 0
          ? `${urgentTaskCount} urgent ${urgentTaskCount === 1 ? 'task' : 'tasks'} in follow-through`
          : activeFollowUpCount > 0
            ? 'Routine follow-through remains open'
            : 'No open follow-through waiting',
      tone:
        urgentTaskCount > 0
          ? 'warning'
          : activeFollowUpCount > 0
            ? 'active'
            : 'stable',
    },
    {
      label: 'Next schedule point',
      value: nextPatientAppointment ? appointmentWorkflowLabel(nextPatientAppointment.workflowStatus) : 'No slot set',
      note:
        nextPatientAppointment
          ? formatDashboardRelativeTime(nextPatientAppointment.startsAt)
          : 'Open scheduling only if follow-up is needed',
      tone:
        nextPatientAppointment === null
          ? 'neutral'
          : appointmentWorkflowTone(nextPatientAppointment.workflowStatus) === 'danger'
          ? 'critical'
          : appointmentWorkflowTone(nextPatientAppointment.workflowStatus) === 'warning'
            ? 'warning'
            : appointmentWorkflowTone(nextPatientAppointment.workflowStatus) === 'success'
              ? 'stable'
              : 'neutral',
    },
  ];
  const reviewIssueMessages = [
    trendsQuery.error ? toUserMessage(trendsQuery.error) : null,
    patientAlertsQuery.error ? toUserMessage(patientAlertsQuery.error) : null,
  ].filter((message): message is string => Boolean(message));
  const careReviewIssueMessages = [
    patientRehabQuery.error ? toUserMessage(patientRehabQuery.error) : null,
    patientPromsQuery.error ? toUserMessage(patientPromsQuery.error) : null,
    patientInsightsQuery.error ? toUserMessage(patientInsightsQuery.error) : null,
    patientSessionsQuery.error ? toUserMessage(patientSessionsQuery.error) : null,
  ].filter((message): message is string => Boolean(message));
  const referenceIssueMessages = [
    patientRecentCheckinsQuery.error ? toUserMessage(patientRecentCheckinsQuery.error) : null,
    patientHydrationQuery.error ? toUserMessage(patientHydrationQuery.error) : null,
    patientNutritionQuery.error ? toUserMessage(patientNutritionQuery.error) : null,
    patientWearablesSummaryQuery.error ? toUserMessage(patientWearablesSummaryQuery.error) : null,
    patientWearablesDailyQuery.error ? toUserMessage(patientWearablesDailyQuery.error) : null,
    patientMedicationAdherenceQuery.error ? toUserMessage(patientMedicationAdherenceQuery.error) : null,
    patientPhotosQuery.error ? toUserMessage(patientPhotosQuery.error) : null,
  ].filter((message): message is string => Boolean(message));
  const workspaceIssueMessages = [
    actionError,
    photoOpenError,
    rehabSaveError,
    promSaveError,
    insightActionError,
    operationsError,
  ].filter((message): message is string => Boolean(message));
  const workspaceNoticeMessages = [insightActionNotice, operationsNotice].filter(
    (message): message is string => Boolean(message),
  );
  const patientDetailNotices: Array<{
    key: string;
    variant: 'error' | 'success';
    title: string;
    messages: string[];
    action?: JSX.Element;
  }> = [];

  if (reviewIssueMessages.length > 0) {
    patientDetailNotices.push({
      key: 'core-review',
      variant: 'error',
      title: 'Some core review data is unavailable',
      messages: reviewIssueMessages,
      action: (
        <Button variant="secondary" size="sm" onClick={handleRefreshReviewSignals}>
          Refresh core review
        </Button>
      ),
    });
  }

  if (careReviewIssueMessages.length > 0) {
    patientDetailNotices.push({
      key: 'care-review',
      variant: 'error',
      title: 'Some care review panels need refresh',
      messages: careReviewIssueMessages,
      action: (
        <Button variant="secondary" size="sm" onClick={handleRefreshCareReview}>
          Refresh care review
        </Button>
      ),
    });
  }

  if (referenceIssueMessages.length > 0) {
    patientDetailNotices.push({
      key: 'reference-review',
      variant: 'error',
      title: 'Some deeper reference signals are unavailable',
      messages: referenceIssueMessages,
      action: (
        <Button variant="secondary" size="sm" onClick={handleRefreshReferenceSignals}>
          Refresh reference data
        </Button>
      ),
    });
  }

  if (workspaceIssueMessages.length > 0) {
    patientDetailNotices.push({
      key: 'workspace-actions',
      variant: 'error',
      title: 'A patient detail action needs attention',
      messages: workspaceIssueMessages,
    });
  }

  if (workspaceNoticeMessages.length > 0) {
    patientDetailNotices.push({
      key: 'workspace-updated',
      variant: 'success',
      title: 'Patient detail updated',
      messages: workspaceNoticeMessages,
    });
  }

  const renderPatientSummarySection = (className: string): JSX.Element => (
    <section id="patient-summary-section" className={className} aria-label="Patient snapshot">
      <div className="patient-detail-section-header patient-detail-section-header--summary">
        <div className="patient-detail-section-heading">
          <p className="patient-detail-section-eyebrow">Snapshot</p>
          <h2 className="patient-detail-section-title">Current review snapshot</h2>
        </div>
        <p className="patient-detail-section-note">
          Support context for the current {selectedDays}-day review window.
        </p>
      </div>
      <PatientSummaryCards metrics={trendSummary} openAlertCount={openAlertCount} />
    </section>
  );

  const renderRecentAlertsPanel = (): JSX.Element => (
    <RecentAlertsPanel
      alerts={patientAlerts}
      seenAlertMap={seenAlertMap}
      mutationPending={updateAlertMutation.isPending}
      onAcknowledge={(alert) => handleStatusUpdate('acknowledged', alert)}
      onResolve={(alert) => handleStatusUpdate('resolved', alert)}
      onViewAll={() => navigate(`/alerts?patientId=${encodeURIComponent(patientId)}`)}
    />
  );

  return (
    <div className="page-stack dashboard-page-shell dashboard-page-shell--patient patient-detail-page">
      <section
        className={`patient-detail-brief${
          entryContext ? ` patient-detail-brief--source patient-detail-brief--source-${entryContext.focus}` : ''
        }`}
      >
        <div className="patient-detail-brief__topbar">
          <div className="patient-detail-title__nav">
            <Link
              to={returnLinkTo}
              className={`patient-detail-back-link${
                entryContext ? ' patient-detail-back-link--source' : ''
              }`}
              data-testid="patient-detail-return-link"
            >
              {returnLinkLabel}
            </Link>
            {entrySourceCue ? (
              <span className="patient-detail-entry-cue" data-testid="patient-detail-entry-cue">
                {entrySourceCue}
              </span>
            ) : null}
          </div>
          <div className="patient-detail-brief__utility">
            <div className="patient-detail-window-tabs">
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
            </div>
          </div>
        </div>

        <div className="patient-detail-brief__body">
          <div className="patient-detail-brief__primary">
            <div className="patient-detail-brief__identity">
              <p className="patient-detail-brief__eyebrow">Clinician cockpit</p>
              <div className="patient-detail-brief__name-row">
                <h1 className="patient-detail-brief__name">{patientDisplayName}</h1>
                {patientContext?.status ? (
                  <Badge className="patient-detail-title__status" variant={statusBadgeVariant(patientContext.status)} icon>
                    {statusLabel(patientContext.status)}
                  </Badge>
                ) : null}
              </div>
              <div className="patient-detail-brief__meta">
                {patientDisplayName !== patientId ? (
                  <span className="patient-id-text patient-detail-title__id">ID: {patientId}</span>
                ) : null}
                {currentRehabPhaseTitle ? (
                  <span className="patient-detail-brief__meta-item">{currentRehabPhaseTitle}</span>
                ) : null}
                <span className="patient-detail-brief__meta-item">
                  {trendSummary.lastCheckinDate
                    ? `Last check-in ${formatDashboardRelativeTime(trendSummary.lastCheckinDate)}`
                    : 'No recent check-in'}
                </span>
              </div>
            </div>

            <div
              className={`patient-detail-current-context patient-detail-brief__focus${
                entryContext
                  ? ` patient-detail-current-context--source patient-detail-current-context--source-${entryContext.focus}`
                  : ''
              }`}
              data-testid="patient-detail-current-context"
            >
              <div className="patient-detail-current-context__copy">
                <p className="patient-detail-current-context__eyebrow">Immediate context</p>
                <strong className="patient-detail-current-context__title">{currentContextTitle}</strong>
                <p className="patient-detail-current-context__text">{currentContextBody}</p>
                {entryReviewHint ? (
                  <p className="patient-detail-current-context__source-note" data-testid="patient-detail-entry-hint">
                    {entryReviewHint}
                  </p>
                ) : null}
              </div>
              <div className="patient-detail-current-context__facts">
                <div className="patient-detail-current-context__fact">
                  <span>Review state</span>
                  <strong>{openAlertCount > 0 ? `${openAlertCount} active alerts` : 'No open alerts'}</strong>
                </div>
                <div className="patient-detail-current-context__fact">
                  <span>Follow-through</span>
                  <strong>{activeFollowUpCount > 0 ? `${activeFollowUpCount} items waiting` : 'Queue steady'}</strong>
                </div>
                <div className="patient-detail-current-context__fact">
                  <span>Next appointment</span>
                  <strong>
                    {nextPatientAppointment
                      ? formatDashboardRelativeTime(nextPatientAppointment.startsAt)
                      : 'None scheduled'}
                  </strong>
                </div>
              </div>
            </div>
          </div>

          <div className="patient-detail-brief__aside" aria-label="Patient detail quick actions and review facts">
            <div className="patient-detail-brief__support-band">
              <section className="patient-detail-brief__actions-panel" aria-label="Top actions">
                <p className="patient-detail-brief__eyebrow">Top actions</p>
                <div className="patient-detail-actions patient-detail-brief__actions">
                  <Button
                    className="patient-detail-actions__worklist"
                    variant="ghost"
                    onClick={() => {
                      navigate('/worklist');
                    }}
                  >
                    Open worklist
                  </Button>
                  <Button
                    className="patient-detail-actions__refresh"
                    variant="secondary"
                    onClick={handleRefreshOverview}
                  >
                    Refresh
                  </Button>
                  <Button className="patient-detail-actions__export" variant="secondary" onClick={openPatientExportModal}>
                    Export CSV
                  </Button>
                  <Button
                    className="patient-detail-actions__plan"
                    variant="secondary"
                    onClick={() => {
                      navigate(`/patients/${patientId}/plan`);
                    }}
                  >
                    Exercise plan
                  </Button>
                </div>
              </section>

              <div className="patient-detail-brief__facts" aria-label="Immediate patient review facts">
                {patientBriefFacts.map((fact) => (
                  <article
                    key={fact.label}
                    className={`patient-detail-brief__fact patient-detail-brief__fact--${fact.tone}`}
                  >
                    <span className="patient-detail-brief__fact-label">{fact.label}</span>
                    <strong className="patient-detail-brief__fact-value">{fact.value}</strong>
                    <p className="patient-detail-brief__fact-note">{fact.note}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </div>

        <section
          className="patient-detail-mini-nav"
          aria-label="Patient detail section navigation"
          data-testid="patient-detail-mini-nav"
        >
          <div className="patient-detail-mini-nav__copy">
            <p className="patient-detail-mini-nav__eyebrow">Jump to</p>
            <p className="patient-detail-mini-nav__text">Main review zones</p>
          </div>
          <div className="patient-detail-mini-nav__actions" role="group" aria-label="Patient detail sections">
            {PATIENT_DETAIL_SECTIONS.map((section) => (
              <Button
                key={section.id}
                variant={activeSectionId === section.id ? 'secondary' : 'ghost'}
                size="sm"
                className={`patient-detail-mini-nav__button${
                  activeSectionId === section.id ? ' patient-detail-mini-nav__button--active' : ''
                }`}
                onClick={() => {
                  handleSectionJump(section.id);
                }}
              >
                {section.label}
              </Button>
            ))}
          </div>
        </section>
      </section>

      {patientDetailNotices.length > 0 ? (
        <section className="patient-detail-notices" aria-label="Patient detail notices">
          {patientDetailNotices.map((notice) => (
            <article
              key={notice.key}
              className={`patient-detail-notice patient-detail-notice--${notice.variant}`}
              role={notice.variant === 'error' ? 'alert' : 'status'}
            >
              <div className="patient-detail-notice__content">
                <strong className="patient-detail-notice__title">{notice.title}</strong>
                <p className="patient-detail-notice__text">
                  <NoticeMessageList messages={notice.messages} />
                </p>
              </div>
              {notice.action ? (
                <div className="patient-detail-notice__actions">{notice.action}</div>
              ) : null}
            </article>
          ))}
        </section>
      ) : null}

      {isPrioritySupportResponsive ? (
        <section
          className="patient-detail-priority-support"
          aria-label="Priority patient support context"
          data-testid="patient-detail-priority-support"
        >
          {renderPatientSummarySection(
            'patient-detail-support-section patient-detail-support-section--snapshot patient-detail-priority-support__snapshot',
          )}
          {renderRecentAlertsPanel()}
        </section>
      ) : null}

      <div className="patient-detail-cockpit-layout">
        <div className="patient-detail-cockpit-layout__main">
          <section
            id="patient-priorities-section"
            className="patient-detail-lane-section patient-detail-lane-section--workboard"
          >
            <div className="patient-detail-section-header">
              <div className="patient-detail-section-heading">
                <p className="patient-detail-section-eyebrow">Decision surface</p>
                <h2 className="patient-detail-section-title">Priorities and next actions</h2>
              </div>
              <p className="patient-detail-section-note">Start here, then move directly into follow-through.</p>
            </div>
            <PatientDecisionSurface
              priorities={patientPriorities}
              recommendedActions={recommendedActions}
              isLoading={
                patientPriorities.length === 0 &&
                recommendedActions.length === 0 &&
                (patientWorklistQuery.isLoading ||
                  patientTasksQuery.isLoading ||
                  patientCommunicationQuery.isLoading ||
                  patientAppointmentsQuery.isLoading)
              }
              priorityError={patientPrioritiesError}
              recommendedActionsError={recommendedActionsError}
              onRetry={handleRefreshOverview}
              onAction={handleOperationalAction}
            />
          </section>

          <section
            id="patient-operations-section"
            className="patient-detail-lane-section patient-detail-lane-section--follow-through"
          >
            <div className="patient-detail-section-header">
              <div className="patient-detail-section-heading">
                <p className="patient-detail-section-eyebrow">Follow-through</p>
                <h2 className="patient-detail-section-title">Communication, tasks, and schedule</h2>
              </div>
              <p className="patient-detail-section-note">Keep the next patient move visible in one coordinated lane.</p>
            </div>
            <div className="patient-detail-follow-through-grid">
              <div className="patient-detail-operations-grid__communication">
                <PatientCommunicationPanel
                  items={patientCommunicationItems}
                  timeline={patientCommunicationTimeline}
                  isLoading={patientCommunicationQuery.isLoading}
                  error={patientCommunicationQuery.error ? toUserMessage(patientCommunicationQuery.error) : null}
                  onRetry={() => {
                    void patientCommunicationQuery.refetch();
                  }}
                  onOpenCommunication={openCommunicationWorkspace}
                  onOpenAlerts={openAlertsFromPatientCommunication}
                  showQuickReply={canQuickReplyFromPatientDetail}
                  quickReplyBlockedBySafety={patientCommunicationBlockedBySafety}
                  quickReplyValue={patientQuickReply}
                  onQuickReplyChange={setPatientQuickReply}
                  onSendQuickReply={handlePatientQuickReply}
                  replyTemplates={communicationAuthoring.templates}
                  selectedTemplateId={selectedQuickReplyTemplateId}
                  onSelectedTemplateChange={setSelectedQuickReplyTemplateId}
                  onInsertTemplate={handleInsertPatientQuickReplyTemplate}
                  hasSignature={communicationAuthoring.hasSignature}
                  onInsertSignature={handleInsertPatientQuickReplySignature}
                />
              </div>
              <div className="patient-detail-operations-grid__tasks">
                <PatientTasksPanel
                  activeTasks={patientActiveTasks}
                  recentCompletedTasks={patientRecentCompletedTasks}
                  isLoading={patientTasksQuery.isLoading}
                  error={patientTasksQuery.error ? toUserMessage(patientTasksQuery.error) : null}
                  completingTaskId={completeTaskMutation.isPending ? completeTaskMutation.variables : null}
                  onRetry={() => {
                    void patientTasksQuery.refetch();
                  }}
                  onCompleteTask={handleCompleteTask}
                  onOpenAlerts={() => handleOperationalAction('alerts')}
                  onOpenAppointments={() => navigate('/appointments')}
                />
              </div>
              <div className="patient-detail-operations-grid__appointments">
                <PatientAppointmentsPanel
                  items={patientAppointments}
                  isLoading={patientAppointmentsQuery.isLoading}
                  error={patientAppointmentsQuery.error ? toUserMessage(patientAppointmentsQuery.error) : null}
                  onRetry={() => {
                    void patientAppointmentsQuery.refetch();
                  }}
                  onOpenAppointments={() => navigate('/appointments')}
                />
              </div>
            </div>
          </section>

          <section
            id="patient-care-review-section"
            className="patient-detail-lane-section patient-detail-lane-section--guidance"
            data-testid="patient-detail-care-review"
          >
            <div className="patient-detail-section-header">
              <div className="patient-detail-section-heading">
                <p className="patient-detail-section-eyebrow">Guidance review</p>
                <h2 className="patient-detail-section-title">Questionnaires and clinical guidance</h2>
              </div>
              <p className="patient-detail-section-note">Guidance stays close to the active review, but secondary to the live work lane.</p>
            </div>
            <div className="patient-detail-guidance-grid">
              <Card
                className="patient-detail-panel patient-detail-panel--operations-primary"
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
                                <p className="muted-text">Due {new Date(prom.dueAt).toLocaleString()}</p>
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
                                {prom.score ? `${prom.score.normalized} · ${prom.score.bandLabel}` : 'No score'}
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
                className="patient-detail-panel patient-detail-panel--operations-primary"
                title="Insight cards"
                action={
                  <div className="patient-detail-actions">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        void patientInsightsQuery.refetch();
                      }}
                    >
                      Refresh
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={isGeneratingInsights}
                      onClick={() => {
                        void handleGenerateInsights();
                      }}
                    >
                      {isGeneratingInsights ? 'Generating…' : 'Generate suggestions'}
                    </Button>
                  </div>
                }
              >
                {patientInsightsQuery.isLoading &&
                patientPendingInsights.length === 0 &&
                patientApprovedInsights.length === 0 ? (
                  <div className="patient-detail-skeleton-grid" aria-label="Insight list loading placeholder">
                    <Skeleton height={54} />
                    <Skeleton height={68} />
                  </div>
                ) : (
                  <div className="stack stack--3">
                    <p className="muted-text">
                      Pending: <strong>{patientPendingInsights.length}</strong> · Approved:{' '}
                      <strong>{patientApprovedInsights.length}</strong>
                    </p>
                    <div className="stack stack--2">
                      <strong>Pending review</strong>
                      {patientPendingInsights.length === 0 ? (
                        <p className="muted-text">No pending suggestions.</p>
                      ) : (
                        <div className="stack stack--2">
                          {patientPendingInsights.map((insight) => (
                            <div key={insight.id} className="patient-insight-item">
                              <div className="patient-insight-item__meta">
                                <Badge variant={insightConfidenceVariant(insight.confidence)}>
                                  {insight.confidence}
                                </Badge>
                                <span className="muted-text">
                                  {insightCategoryLabel(insight.category)} · Priority {insight.priority}
                                </span>
                              </div>
                              <strong>{insight.title}</strong>
                              <p className="muted-text patient-insight-item__message">{insight.message}</p>
                              <div className="patient-insight-item__actions">
                                <Button
                                  variant="primary"
                                  size="sm"
                                  disabled={insightReviewingId !== null}
                                  onClick={() => {
                                    void handleReviewPatientInsight(insight.id, 'approved');
                                  }}
                                >
                                  {insightReviewingId === `${insight.id}:approved` ? 'Approving…' : 'Approve'}
                                </Button>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  disabled={insightReviewingId !== null}
                                  onClick={() => {
                                    void handleReviewPatientInsight(insight.id, 'rejected');
                                  }}
                                >
                                  {insightReviewingId === `${insight.id}:rejected` ? 'Rejecting…' : 'Reject'}
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="stack stack--2">
                      <strong>Approved</strong>
                      {patientApprovedInsights.length === 0 ? (
                        <p className="muted-text">No approved insights yet.</p>
                      ) : (
                        <div className="stack stack--2">
                          {patientApprovedInsights.map((insight) => (
                            <div key={insight.id} className="patient-insight-item">
                              <div className="patient-insight-item__meta">
                                <Badge variant={insightConfidenceVariant(insight.confidence)}>
                                  {insight.confidence}
                                </Badge>
                                <span className="muted-text">
                                  {insightCategoryLabel(insight.category)} · Priority {insight.priority}
                                </span>
                              </div>
                              <strong>{insight.title}</strong>
                              <p className="muted-text patient-insight-item__message">{insight.message}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            </div>
          </section>
        </div>

        <aside className="patient-detail-cockpit-layout__support" aria-label="Patient support context">
          {isPrioritySupportResponsive
            ? null
            : renderPatientSummarySection(
                'patient-detail-support-section patient-detail-support-section--snapshot',
              )}

          {isPrioritySupportResponsive ? null : renderRecentAlertsPanel()}

          <PatientHandoffPanel
            patientId={patientId}
            onOpenNextAction={(action) => handleOperationalAction(action)}
          />
        </aside>
      </div>

      <section
        id="patient-reference-section"
        className="patient-detail-reference-zone"
        aria-label="Lower patient reference"
        data-testid="patient-detail-reference-bridge"
      >
        <div className="patient-detail-reference-zone__header">
          <div className="patient-detail-reference-zone__copy">
            <p className="patient-detail-reference-bridge__eyebrow">Reference</p>
            <strong className="patient-detail-reference-bridge__title">History and care reference</strong>
            <p className="patient-detail-reference-bridge__text">Slower history, rehab context, and supporting records stay available without taking over the live review.</p>
          </div>
          <div className="patient-detail-reference-bridge__facts">
            <div className="patient-detail-reference-bridge__fact">
              <span>Symptom detail</span>
              <strong>{hasSymptomReference ? 'Available this week' : 'No recent entries'}</strong>
            </div>
            <div className="patient-detail-reference-bridge__fact">
              <span>Support signals</span>
              <strong>{hasSupportSignals ? 'Tracked this week' : 'No support logs'}</strong>
            </div>
            <div className="patient-detail-reference-bridge__fact">
              <span>Care review</span>
              <strong>
                {hasCareReviewItems
                  ? `${patientPromDue.length} due · ${patientPendingInsights.length} pending`
                  : 'No open review items'}
              </strong>
            </div>
          </div>
        </div>

        <div className="patient-detail-reference-zone__layout">
          <section
            id="patient-trends-section"
            className="patient-detail-reference-zone__panel patient-detail-reference-zone__panel--trends"
          >
            <div className="patient-detail-section-header">
              <div className="patient-detail-section-heading">
                <p className="patient-detail-section-eyebrow">Trend history</p>
                <h2 className="patient-detail-section-title">Clinical trajectory</h2>
              </div>
              <p className="patient-detail-section-note">Open day detail only when the active review needs deeper context.</p>
            </div>
            {showTrendsLoading ? (
              <Card title="Trend charts">
                <div className="patient-detail-skeleton-grid" aria-label="Trend charts loading placeholder">
                  <Skeleton height={260} />
                  <Skeleton height={260} />
                  <Skeleton height={260} />
                </div>
              </Card>
            ) : hasTrendData ? (
              <TrendCharts
                points={normalizedTrends}
                onSelectDate={handleDaySelect}
                expandedMetric={expandedTrendMetric}
                onExpandMetric={setExpandedTrendMetric}
                onCollapseMetric={() => setExpandedTrendMetric(null)}
              />
            ) : (
              <Card title="Trend charts">
                <EmptyState
                  title="No check-ins yet for this patient"
                  description="Trend charts appear once check-ins are available in the selected window."
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
          </section>

          <section className="patient-detail-reference-zone__panel patient-detail-reference-zone__panel--care">
            <Card
              className="patient-detail-panel patient-detail-panel--operations-primary"
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
                      {patientRehab.phases.find((phase) => phase.key === patientRehab.currentKey)?.title ?? 'Not set'}
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

            <Card className="patient-detail-panel patient-detail-panel--operations-secondary" title="Weekly report">
              <div className="stack stack--2">
                <p className="muted-text">
                  View a deterministic weekly summary with check-ins, exercise sessions, PROMs, safety highlights, and
                  next steps.
                </p>
                <div className="patient-detail-actions">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      navigate(`/patients/${patientId}/weekly-report?weekStart=${encodeURIComponent(thisWeekStart)}`);
                    }}
                  >
                    View this week
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      navigate(`/patients/${patientId}/weekly-report?weekStart=${encodeURIComponent(lastWeekStart)}`);
                    }}
                  >
                    View last week
                  </Button>
                </div>
              </div>
            </Card>

            <Card
              className="patient-detail-panel patient-detail-panel--operations-secondary"
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
                          Avg pain: {typeof session.avgPainDuring === 'number' ? `${session.avgPainDuring}/5` : '—'}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </Card>
          </section>
        </div>
      </section>

      <section
        className={`patient-detail-section-block patient-detail-section-block--signals patient-detail-section-block--reference ${
          isSymptomSignalsOpen ? 'patient-detail-section-block--expanded' : 'patient-detail-section-block--collapsed'
        }`}
        data-testid="patient-detail-reference-signals"
      >
        <div className="patient-detail-section-header patient-detail-section-header--reference">
          <div className="patient-detail-section-heading">
            <p className="patient-detail-section-eyebrow">Reference detail</p>
            <h2 className="patient-detail-section-title">Recent symptom signals</h2>
          </div>
          <div className="patient-detail-section-header__aside">
            <p className="patient-detail-section-note">
              Open sleep, body-map, and photo history only when day-level context is needed.
            </p>
            <div className="patient-detail-disclosure__controls">
              <span className="patient-detail-disclosure__state">
                {isSymptomSignalsOpen ? 'Reference open' : 'Reference collapsed'}
              </span>
              <Button
                variant="secondary"
                size="sm"
                aria-expanded={isSymptomSignalsOpen}
                onClick={() => {
                  setIsSymptomSignalsOpen((current) => !current);
                }}
              >
                {isSymptomSignalsOpen ? 'Hide symptom detail' : 'Show symptom detail'}
              </Button>
            </div>
          </div>
        </div>
        <div className="patient-detail-disclosure__summary" aria-label="Recent symptom signal summary">
          {symptomReferenceFacts.map((item) => (
            <div key={item.label} className="patient-detail-disclosure__fact">
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
        {!isSymptomSignalsOpen ? (
          <p className="patient-detail-disclosure__hint">
            {hasSymptomReference
              ? 'Open this section when symptom history is needed to support the active clinical review.'
              : 'No recent symptom history is available in the current window.'}
          </p>
        ) : (
          <div className="patient-detail-section-grid patient-detail-section-grid--signals">
          <Card
        className="patient-detail-panel patient-detail-panel--signal"
        title="Sleep (recent)"
        action={
          <Button
            variant="secondary"
            onClick={() => {
              void patientRecentCheckinsQuery.refetch();
            }}
          >
            Refresh
          </Button>
        }
      >
        {patientRecentCheckinsQuery.isLoading && recentSleepRows.length === 0 ? (
          <div className="patient-detail-skeleton-grid" aria-label="Sleep loading placeholder">
            <Skeleton height={44} />
            <Skeleton height={68} />
          </div>
        ) : recentSleepRows.length === 0 ? (
          <p className="muted-text">No recent sleep entries in the last 7 days.</p>
        ) : (
          <div className="stack stack--2">
            <p className="muted-text">
              Tracked check-ins: <strong>{recentSleepSummary.trackedCount}</strong>
            </p>
            <p className="muted-text">
              Avg hours: <strong>{recentSleepSummary.avgHours ?? '—'}</strong> · Avg quality:{' '}
              <strong>{recentSleepSummary.avgQuality ?? '—'}</strong>
            </p>
            <div className="stack stack--1">
              {recentSleepRows.slice(0, 7).map((row) => (
                <p key={row.date} className="muted-text">
                  {row.date}: {row.hours !== null ? `${row.hours}h` : '—'} · quality{' '}
                  {row.quality !== null ? row.quality : '—'}
                  {row.disturbances !== null ? ` · disturbances ${row.disturbances}` : ''}
                </p>
              ))}
            </div>
          </div>
        )}
          </Card>

          <Card
        className="patient-detail-panel patient-detail-panel--signal"
        title="Body map (recent)"
        action={
          <Button
            variant="secondary"
            onClick={() => {
              void patientRecentCheckinsQuery.refetch();
            }}
          >
            Refresh
          </Button>
        }
      >
        {patientRecentCheckinsQuery.isLoading && recentBodyMapRows.length === 0 ? (
          <div className="patient-detail-skeleton-grid" aria-label="Body map loading placeholder">
            <Skeleton height={44} />
            <Skeleton height={68} />
          </div>
        ) : recentBodyMapRows.length === 0 ? (
          <p className="muted-text">No body map pain localization in the last 7 days.</p>
        ) : (
          <div className="stack stack--2">
            <p className="muted-text">
              Top areas:{' '}
              <strong>
                {recentBodyMapSummary.length > 0
                  ? recentBodyMapSummary
                      .map((item) => `${item.label} (${item.count})`)
                      .join(', ')
                  : '—'}
              </strong>
            </p>
            <div className="stack stack--1">
              {recentBodyMapRows.slice(0, 5).map((row) => (
                <p key={`${row.date}-bodymap`} className="muted-text">
                  {row.date}:{' '}
                  {row.regions
                    .map((entry) => `${bodyMapRegionLabel(entry.region)} (${entry.intensity})`)
                    .join(', ')}
                </p>
              ))}
            </div>
          </div>
        )}
          </Card>

          <Card
        className="patient-detail-panel patient-detail-panel--signal"
        title="Symptom photos (recent)"
        action={
          <Button
            variant="secondary"
            onClick={() => {
              void patientPhotosQuery.refetch();
            }}
          >
            Refresh
          </Button>
        }
      >
        {patientPhotosQuery.isLoading && recentPhotos.length === 0 ? (
          <div className="patient-detail-skeleton-grid" aria-label="Symptom photos loading placeholder">
            <Skeleton height={44} />
            <Skeleton height={88} />
          </div>
        ) : recentPhotos.length === 0 ? (
          <p className="muted-text">No symptom photos in the last 7 days.</p>
        ) : (
          <div className="stack stack--2">
            <p className="muted-text">
              Uploaded: <strong>{recentPhotoSummary.total}</strong> · swelling{' '}
              <strong>{recentPhotoSummary.swelling}</strong> · wound{' '}
              <strong>{recentPhotoSummary.wound}</strong> · rash{' '}
              <strong>{recentPhotoSummary.rash}</strong> · other{' '}
              <strong>{recentPhotoSummary.other}</strong>
            </p>
            <div className="stack stack--1">
              {recentPhotos.slice(0, 5).map((photo) => (
                <div key={photo.id} className="patient-detail-photo-row">
                  <p className="muted-text patient-detail-photo-row__text">
                    {photo.date}: {photo.kind}
                    {photo.notePreview ? ` · ${photo.notePreview}` : ''}
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={openingPhotoId === photo.id}
                    onClick={() => {
                      void handleOpenPhoto(photo.id);
                    }}
                  >
                    {openingPhotoId === photo.id ? 'Opening…' : 'View'}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
          </Card>
        </div>
        )}
      </section>

      <section
        className={`patient-detail-section-block patient-detail-section-block--habits patient-detail-section-block--reference ${
          isSupportSignalsOpen ? 'patient-detail-section-block--expanded' : 'patient-detail-section-block--collapsed'
        }`}
        data-testid="patient-detail-reference-support"
      >
        <div className="patient-detail-section-header patient-detail-section-header--reference">
          <div className="patient-detail-section-heading">
            <p className="patient-detail-section-eyebrow">Support trends</p>
            <h2 className="patient-detail-section-title">Daily support signals</h2>
          </div>
          <div className="patient-detail-section-header__aside">
            <p className="patient-detail-section-note">
              Hydration, nutrition, wearables, and medication patterns provide slower recovery context.
            </p>
            <div className="patient-detail-disclosure__controls">
              <span className="patient-detail-disclosure__state">
                {isSupportSignalsOpen ? 'Reference open' : 'Reference collapsed'}
              </span>
              <Button
                variant="secondary"
                size="sm"
                aria-expanded={isSupportSignalsOpen}
                onClick={() => {
                  setIsSupportSignalsOpen((current) => !current);
                }}
              >
                {isSupportSignalsOpen ? 'Hide support signals' : 'Show support signals'}
              </Button>
            </div>
          </div>
        </div>
        <div className="patient-detail-disclosure__summary" aria-label="Daily support signal summary">
          {supportSignalFacts.map((item) => (
            <div key={item.label} className="patient-detail-disclosure__fact">
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
        {!isSupportSignalsOpen ? (
          <p className="patient-detail-disclosure__hint">
            {hasSupportSignals
              ? 'Open this section when support-tracking history is needed to confirm adherence or recovery context.'
              : 'No support-tracking history is available in the current window.'}
          </p>
        ) : (
          <div className="patient-detail-section-grid patient-detail-section-grid--habits">
          <Card
        className="patient-detail-panel patient-detail-panel--habit"
        title="Hydration (last 7 days)"
        action={
          <Button
            variant="secondary"
            onClick={() => {
              void patientHydrationQuery.refetch();
            }}
          >
            Refresh
          </Button>
        }
      >
        {patientHydrationQuery.isLoading && recentHydrationDays.length === 0 ? (
          <div className="patient-detail-skeleton-grid" aria-label="Hydration loading placeholder">
            <Skeleton height={44} />
            <Skeleton height={68} />
          </div>
        ) : recentHydrationDays.length === 0 ? (
          <p className="muted-text">No hydration entries in the last 7 days.</p>
        ) : (
          <div className="stack stack--2">
            <p className="muted-text">
              Avg daily intake: <strong>{recentHydrationSummary.avgDailyMl ?? '—'}</strong> ml
            </p>
            <p className="muted-text">
              Goal days (≥2000 ml): <strong>{recentHydrationSummary.daysMeetingTarget}</strong>/
              {recentHydrationDays.length}
            </p>
            <div className="stack stack--1">
              {recentHydrationDays.slice(0, 7).map((day) => (
                <p key={day.date} className="muted-text">
                  {day.date}: {day.totalMl} ml {day.metTarget ? '✓' : ''}
                </p>
              ))}
            </div>
          </div>
        )}
          </Card>

          <Card
        className="patient-detail-panel patient-detail-panel--habit"
        title="Nutrition (last 7 days)"
        action={
          <Button
            variant="secondary"
            onClick={() => {
              void patientNutritionQuery.refetch();
            }}
          >
            Refresh
          </Button>
        }
      >
        {patientNutritionQuery.isLoading && recentNutritionDays.length === 0 ? (
          <div className="patient-detail-skeleton-grid" aria-label="Nutrition loading placeholder">
            <Skeleton height={44} />
            <Skeleton height={88} />
          </div>
        ) : recentNutritionDays.length === 0 ? (
          <p className="muted-text">No nutrition logs in the last 7 days.</p>
        ) : (
          <div className="stack stack--2">
            <p className="muted-text">
              Tracked days: <strong>{recentNutritionSummary.trackedDays}</strong> · Avg fruit/veg:{' '}
              <strong>{recentNutritionSummary.avgFruitVeg ?? '—'}</strong>
            </p>
            <p className="muted-text">
              Protein OK/high days: <strong>{recentNutritionSummary.proteinOkHighDays}</strong>/
              {recentNutritionSummary.trackedDays}
            </p>
            <div className="stack stack--1">
              {recentNutritionDays.slice(0, 7).map((day) => (
                <p key={day.date} className="muted-text">
                  {day.date}:{' '}
                  {day.entry
                    ? `${day.entry.protein} protein · fruit/veg ${day.entry.fruitVegServings} · anti-inflammatory ${
                        day.entry.antiInflammatoryFocus ? 'yes' : 'no'
                      } · meals ${day.entry.mealRegularity}`
                    : 'No entry'}
                </p>
              ))}
            </div>
          </div>
        )}
          </Card>

          <Card
        className="patient-detail-panel patient-detail-panel--habit"
        title="Wearables (last 7 days)"
        action={
          <Button
            variant="secondary"
            onClick={() => {
              void Promise.all([
                patientWearablesSummaryQuery.refetch(),
                patientWearablesDailyQuery.refetch(),
              ]);
            }}
          >
            Refresh
          </Button>
        }
      >
        {patientWearablesSummaryQuery.isLoading &&
        patientWearablesDailyQuery.isLoading &&
        recentWearablesDays.length === 0 ? (
          <div className="patient-detail-skeleton-grid" aria-label="Wearables loading placeholder">
            <Skeleton height={44} />
            <Skeleton height={88} />
          </div>
        ) : recentWearablesSummary.trackedDays === 0 ? (
          <p className="muted-text">No wearable data in the last 7 days.</p>
        ) : (
          <div className="stack stack--2">
            <p className="muted-text">
              Tracked days: <strong>{recentWearablesSummary.trackedDays}</strong> · Source:{' '}
              <strong>{recentWearablesSummary.source}</strong>
            </p>
            <p className="muted-text">
              Avg steps: <strong>{recentWearablesSummary.avgSteps ?? '—'}</strong> · Avg active minutes:{' '}
              <strong>{recentWearablesSummary.avgActiveMinutes ?? '—'}</strong> · Avg resting HR:{' '}
              <strong>{recentWearablesSummary.avgRestingHr ?? '—'}</strong>
            </p>
            {recentWearablesDays.length > 0 ? (
              <div className="stack stack--1">
                {recentWearablesDays.slice(0, 7).map((day) => (
                  <p key={day.date} className="muted-text">
                    {day.date}: {day.steps ?? '—'} steps · {day.activeMinutes ?? '—'} min
                    {day.restingHr !== null ? ` · HR ${day.restingHr}` : ''}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        )}
          </Card>

          <Card
        className="patient-detail-panel patient-detail-panel--habit"
        title="Medication adherence (last 7 days)"
        action={
          <Button
            variant="secondary"
            onClick={() => {
              void patientMedicationAdherenceQuery.refetch();
            }}
          >
            Refresh
          </Button>
        }
      >
        {patientMedicationAdherenceQuery.isLoading && recentMedicationDays.length === 0 ? (
          <div className="patient-detail-skeleton-grid" aria-label="Medication adherence loading placeholder">
            <Skeleton height={44} />
            <Skeleton height={88} />
          </div>
        ) : recentMedicationDays.length === 0 ? (
          <p className="muted-text">No medication adherence data in the last 7 days.</p>
        ) : (
          <div className="stack stack--2">
            <p className="muted-text">
              Scheduled doses: <strong>{recentMedicationSummary.scheduled}</strong> · Taken:{' '}
              <strong>{recentMedicationSummary.taken}</strong> · Skipped:{' '}
              <strong>{recentMedicationSummary.skipped}</strong>
            </p>
            <p className="muted-text">
              Adherence:{' '}
              <strong>
                {recentMedicationSummary.adherencePct === null
                  ? '—'
                  : `${recentMedicationSummary.adherencePct}%`}
              </strong>
            </p>
            <div className="stack stack--1">
              {recentMedicationDays.slice(0, 7).map((day) => (
                <p key={day.date} className="muted-text">
                  {day.date}: {day.taken}/{day.totalScheduled} taken{day.skipped > 0 ? ` · skipped ${day.skipped}` : ''}
                </p>
              ))}
            </div>
          </div>
        )}
          </Card>
        </div>
        )}
      </section>

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
