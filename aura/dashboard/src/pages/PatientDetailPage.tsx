import {
  Fragment,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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
import {
  assignPromToPatient,
  completeClinicianTask,
  fetchPhotoBlob,
  dischargePatient,
  generatePatientInsights,
  getDashboardCommunicationOverview,
  getExercisePlan,
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
  putPatientRecoverySupport,
  putPatientThresholds,
  reactivatePatient,
  reviewInsight,
  setCurrentRehabPhase,
  tryGetPatientCheckinsRange,
  useClinicianWorklist,
  usePatientCaregiverAccess,
  usePatientCoordination,
  usePatientDischargeSummary,
  usePatientRecoverySupport,
  usePatients,
  usePatientSafetyEvents,
  usePatientThresholds,
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
  AlertStatus,
  AppointmentRequestItem,
  CaregiverAccessItem,
  CheckinAdaptationDecision,
  DischargeSummary,
  InsightItem,
  ClinicianTaskItem,
  DashboardCommunicationOverviewItem,
  ExercisePlan,
  PatientRecoverySupportConfig,
  PatientSummary,
  PromDueCard,
  PromHistoryRow,
  RehabPayload,
  SafetyAuditEntry,
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
  getClinicianCoordinationActionButtonLabel,
  getClinicianCoordinationFollowUpOwnerLabel,
  getClinicianCoordinationNextStepLabel,
} from '../utils/clinicianCoordination';
import {
  alertsForDate,
  deriveTrendSummary,
  filterAlertsForPatient,
  normalizeTrendPoints,
  trendPointHasAnyData,
} from '../utils/trends';
import { bodyMapRegionLabel } from '../utils/bodyMap';
import { formatDashboardDateTime, formatDashboardRelativeTime } from '../utils/dashboard';
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
type TrendChartMetric = 'pain' | 'mood' | 'adherence';
type PatientWorkspaceTabId =
  | 'overview'
  | 'communications'
  | 'guidance'
  | 'history';

const PATIENT_WORKSPACE_TABS: Array<{ id: PatientWorkspaceTabId; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'communications', label: 'Communications & Notes' },
  { id: 'guidance', label: 'Clinical Guidance & Questionnaires' },
  { id: 'history', label: 'History & Signals' },
];

function isPatientWorkspaceTabId(value: string): value is PatientWorkspaceTabId {
  return PATIENT_WORKSPACE_TABS.some((tab) => tab.id === value);
}

function getPatientWorkspaceTabFromPath(pathname: string): PatientWorkspaceTabId {
  const segments = pathname.split('/').filter(Boolean);
  const lastSegment = segments[segments.length - 1];

  return isPatientWorkspaceTabId(lastSegment) ? lastSegment : 'overview';
}

function buildPatientWorkspacePath(patientId: string, tabId: PatientWorkspaceTabId): string {
  return `/patients/${encodeURIComponent(patientId)}/${tabId}`;
}

function maxUpdatedAt(...values: Array<number | null | undefined>): number | null {
  const valid = values.filter((value): value is number => typeof value === 'number' && value > 0);
  return valid.length > 0 ? Math.max(...valid) : null;
}

function formatLoadedAgo(value: number | null): string {
  if (!value) {
    return 'Loaded recently';
  }

  return `Loaded ${formatDashboardRelativeTime(new Date(value).toISOString())}`;
}

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

function formatAlertReasonText(reason: AlertItem['reason']): string {
  return Array.isArray(reason) ? reason.join(', ') : reason;
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

function recoverySupportModeLabel(mode: PatientRecoverySupportConfig['checkinMode'] | undefined): string {
  if (mode === 'adaptive') {
    return 'Adaptive';
  }

  if (mode === 'force_full') {
    return 'Force full';
  }

  return 'Standard';
}

function adaptationModeLabel(mode: CheckinAdaptationDecision['mode'] | undefined): string {
  if (mode === 'shortened') {
    return 'Shortened';
  }

  if (mode === 'expanded') {
    return 'Expanded';
  }

  return 'Standard';
}

function formatReasonCodes(reasonCodes: string[] | undefined): string {
  if (!reasonCodes || reasonCodes.length === 0) {
    return 'No rule codes recorded.';
  }

  return reasonCodes
    .map((code) => code.replace(/_/g, ' ').toLowerCase())
    .join(', ');
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
  const patientDetailShellRef = useRef<HTMLDivElement | null>(null);
  const [patientDetailInlineWidth, setPatientDetailInlineWidth] = useState<number | null>(null);

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
  const [thresholdDraft, setThresholdDraft] = useState({
    painHighThreshold: 7,
    missedCheckinDays: 2,
    responseDelayHours: 24,
    safetyFlaggedResponseDelayHours: 6,
    rationale: '',
  });
  const [recoverySupportDraft, setRecoverySupportDraft] = useState({
    checkinMode: 'standard' as PatientRecoverySupportConfig['checkinMode'],
    nudgesEnabled: false,
    rationale: '',
  });
  const [dischargeDraft, setDischargeDraft] = useState({
    summary: '',
    contactInstructions: '',
    independentModeEnabled: true,
  });
  const [reactivationDraft, setReactivationDraft] = useState({
    status: 'active' as 'active' | 'on_hold',
    rationale: '',
  });
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
  const [isApprovedInsightsOpen, setIsApprovedInsightsOpen] = useState(false);
  const [pendingWorkspaceJumpId, setPendingWorkspaceJumpId] = useState<string | null>(null);
  const [expandedTrendMetric, setExpandedTrendMetric] = useState<TrendChartMetric | null>(null);
  const dayDetailFocusRef = useRef<HTMLElement | null>(null);
  const entryContextConsumedRef = useRef(false);

  const pendingEntryContext = useMemo(
    () => readPatientEntryContextFromState(location.state, patientId),
    [location.state, patientId],
  );
  const activeWorkspaceTab = useMemo(
    () => getPatientWorkspaceTabFromPath(location.pathname),
    [location.pathname],
  );
  const isOverviewWorkspace = activeWorkspaceTab === 'overview';
  const isCommunicationsWorkspace = activeWorkspaceTab === 'communications';
  const isGuidanceWorkspace = activeWorkspaceTab === 'guidance';
  const isHistoryWorkspace = activeWorkspaceTab === 'history';
  // Keep the urgent shell hot while deferring heavier workspace data until its tab is active.
  const shouldLoadOperationalBucket = isOverviewWorkspace || isCommunicationsWorkspace;
  const shouldLoadGuidanceBucket = isOverviewWorkspace || isGuidanceWorkspace;
  const shouldLoadSessionsBucket = isOverviewWorkspace || isHistoryWorkspace;
  const shouldLoadHistoryReferenceBucket = isHistoryWorkspace;

  const patientsQuery = usePatients();
  const patientContext = useMemo(
    () => patientsQuery.data?.find((patient) => patient.id === patientId),
    [patientId, patientsQuery.data],
  );
  const patientCoordinationQuery = usePatientCoordination(patientId);
  const shouldLoadDischargeSummary =
    patientContext?.status === 'discharged' || patientContext?.status === 'inactive';

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
    enabled: Boolean(patientId) && shouldLoadHistoryReferenceBucket,
    staleTime: 7_000,
    retry: (failureCount, error) => failureCount < 2 && isRetryable(asAppError(error)),
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });

  const patientHydrationQuery = useQuery({
    queryKey: ['patient-hydration', patientId, recentSleepFrom, recentSleepTo],
    queryFn: () => getPatientHydrationRange(patientId ?? '', recentSleepFrom, recentSleepTo),
    enabled: Boolean(patientId) && shouldLoadHistoryReferenceBucket,
    staleTime: 7_000,
    retry: (failureCount, error) => failureCount < 2 && isRetryable(asAppError(error)),
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });

  const patientNutritionQuery = useQuery({
    queryKey: ['patient-nutrition', patientId, recentSleepFrom, recentSleepTo],
    queryFn: () => getPatientNutritionRange(patientId ?? '', recentSleepFrom, recentSleepTo),
    enabled: Boolean(patientId) && shouldLoadHistoryReferenceBucket,
    staleTime: 7_000,
    retry: (failureCount, error) => failureCount < 2 && isRetryable(asAppError(error)),
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });

  const patientWearablesSummaryQuery = useQuery({
    queryKey: ['patient-wearables-summary', patientId, recentSleepFrom, recentSleepTo],
    queryFn: () =>
      getPatientWearablesSummary(patientId ?? '', recentSleepFrom, recentSleepTo, 'mock'),
    enabled: Boolean(patientId) && shouldLoadHistoryReferenceBucket,
    staleTime: 7_000,
    retry: (failureCount, error) => failureCount < 2 && isRetryable(asAppError(error)),
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });

  const patientWearablesDailyQuery = useQuery({
    queryKey: ['patient-wearables-daily', patientId, recentSleepFrom, recentSleepTo],
    queryFn: () =>
      getPatientWearablesDaily(patientId ?? '', recentSleepFrom, recentSleepTo, 'mock'),
    enabled: Boolean(patientId) && shouldLoadHistoryReferenceBucket,
    staleTime: 7_000,
    retry: (failureCount, error) => failureCount < 2 && isRetryable(asAppError(error)),
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });

  const patientMedicationAdherenceQuery = useQuery({
    queryKey: ['patient-medications-adherence', patientId, recentSleepFrom, recentSleepTo],
    queryFn: () =>
      getPatientMedicationAdherence(patientId ?? '', recentSleepFrom, recentSleepTo),
    enabled: Boolean(patientId) && shouldLoadHistoryReferenceBucket,
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
    enabled: Boolean(patientId) && shouldLoadHistoryReferenceBucket,
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
    enabled: Boolean(patientId) && shouldLoadSessionsBucket,
    staleTime: 7_000,
    retry: (failureCount, error) => failureCount < 2 && isRetryable(asAppError(error)),
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });

  const patientRehabQuery = useQuery({
    queryKey: ['patient-rehab', patientId],
    queryFn: () => getRehabPhases(patientId ?? ''),
    enabled: Boolean(patientId) && shouldLoadGuidanceBucket,
    staleTime: 7_000,
    retry: (failureCount, error) => failureCount < 2 && isRetryable(asAppError(error)),
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });

  const patientPromsQuery = useQuery({
    queryKey: ['patient-proms', patientId],
    queryFn: () => getPatientProms(patientId ?? '', 50),
    enabled: Boolean(patientId) && shouldLoadGuidanceBucket,
    staleTime: 7_000,
    retry: (failureCount, error) => failureCount < 2 && isRetryable(asAppError(error)),
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });

  const patientPlanQuery = useQuery({
    queryKey: ['patient-exercise-plan', patientId],
    queryFn: () => getExercisePlan(patientId ?? ''),
    enabled: Boolean(patientId) && shouldLoadGuidanceBucket,
    staleTime: 7_000,
    retry: (failureCount, error) => failureCount < 2 && isRetryable(asAppError(error)),
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });

  const patientThresholdsQuery = usePatientThresholds(patientId);
  const patientRecoverySupportQuery = usePatientRecoverySupport(patientId);
  const patientCaregiverAccessQuery = usePatientCaregiverAccess(patientId);
  const patientDischargeSummaryQuery = usePatientDischargeSummary(patientId, shouldLoadDischargeSummary);
  const patientSafetyEventsQuery = usePatientSafetyEvents(patientId);

  const patientInsightsQuery = useQuery({
    queryKey: ['patient-insights', patientId],
    queryFn: async () => {
      const [pending, approved] = await Promise.all([
        getPatientInsights(patientId ?? '', 'pending', 20),
        getPatientInsights(patientId ?? '', 'approved', 20),
      ]);
      return { pending, approved };
    },
    enabled: Boolean(patientId) && shouldLoadGuidanceBucket,
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
    enabled: Boolean(patientId) && shouldLoadOperationalBucket,
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
    enabled: Boolean(patientId) && shouldLoadOperationalBucket,
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
  const saveThresholdsMutation = useMutation({
    mutationFn: () => putPatientThresholds(patientId ?? '', thresholdDraft),
    onSuccess: async () => {
      setOperationsError(null);
      setOperationsNotice('Patient thresholds updated.');
      await Promise.allSettled([
        patientThresholdsQuery.refetch(),
        patientWorklistQuery.refetch(),
        patientCommunicationQuery.refetch(),
        patientSafetyEventsQuery.refetch(),
      ]);
    },
    onError: (error) => {
      setOperationsNotice(null);
      setOperationsError(toUserMessage(asAppError(error)));
    },
  });
  const saveRecoverySupportMutation = useMutation({
    mutationFn: () => putPatientRecoverySupport(patientId ?? '', recoverySupportDraft),
    onSuccess: async () => {
      setOperationsError(null);
      setOperationsNotice('Recovery support settings updated.');
      await Promise.allSettled([
        patientRecoverySupportQuery.refetch(),
        patientWorklistQuery.refetch(),
        patientCommunicationQuery.refetch(),
      ]);
    },
    onError: (error) => {
      setOperationsNotice(null);
      setOperationsError(toUserMessage(asAppError(error)));
    },
  });
  const dischargePatientMutation = useMutation({
    mutationFn: () =>
      dischargePatient(patientId ?? '', {
        ...dischargeDraft,
        requestedBy: clinicianIdentity.clinicianId,
        requestedByName: clinicianIdentity.displayName,
      }),
    onSuccess: async () => {
      setOperationsError(null);
      setOperationsNotice('Patient care status updated to discharged.');
      await Promise.allSettled([
        patientsQuery.refetch(),
        patientRecoverySupportQuery.refetch(),
        patientCaregiverAccessQuery.refetch(),
        patientDischargeSummaryQuery.refetch(),
        patientSafetyEventsQuery.refetch(),
        patientWorklistQuery.refetch(),
        patientCommunicationQuery.refetch(),
      ]);
    },
    onError: (error) => {
      setOperationsNotice(null);
      setOperationsError(toUserMessage(asAppError(error)));
    },
  });
  const reactivatePatientMutation = useMutation({
    mutationFn: () =>
      reactivatePatient(patientId ?? '', {
        ...reactivationDraft,
        requestedBy: clinicianIdentity.clinicianId,
        requestedByName: clinicianIdentity.displayName,
      }),
    onSuccess: async () => {
      setOperationsError(null);
      setOperationsNotice('Patient reactivated.');
      await Promise.allSettled([
        patientsQuery.refetch(),
        patientRecoverySupportQuery.refetch(),
        patientDischargeSummaryQuery.refetch(),
        patientSafetyEventsQuery.refetch(),
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
    setIsApprovedInsightsOpen(false);
    setPendingWorkspaceJumpId(null);
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
  const currentHandoff = patientCoordinationQuery.data?.currentHandoff ?? null;

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
  const patientStatus = patientContext?.status ?? 'active';
  const patientPlan = (patientPlanQuery.data ?? null) as ExercisePlan | null;
  const patientThresholds =
    patientThresholdsQuery.data ?? patientWorklistItem?.thresholdSummary ?? null;
  const patientRecoverySupport =
    patientRecoverySupportQuery.data?.recoverySupport ?? null;
  const currentAdaptationDecision = patientRecoverySupportQuery.data?.adaptationDecision ?? null;
  const currentRecoveryNudge = patientRecoverySupportQuery.data?.recoveryNudge ?? null;
  const caregiverAccessItems = useMemo<CaregiverAccessItem[]>(
    () => (patientCaregiverAccessQuery.data ?? []) as CaregiverAccessItem[],
    [patientCaregiverAccessQuery.data],
  );
  const activeCaregiverAccessItems = useMemo(
    () => caregiverAccessItems.filter((item) => !item.revokedAt),
    [caregiverAccessItems],
  );
  const patientDischargeSummary =
    (patientDischargeSummaryQuery.data ?? null) as DischargeSummary | null;
  const recentSafetyEvents = useMemo(
    () => ((patientSafetyEventsQuery.data ?? []) as SafetyAuditEntry[]).slice(0, 4),
    [patientSafetyEventsQuery.data],
  );

  useEffect(() => {
    if (!patientThresholds) {
      return;
    }

    setThresholdDraft({
      painHighThreshold: patientThresholds.painHighThreshold,
      missedCheckinDays: patientThresholds.missedCheckinDays,
      responseDelayHours: patientThresholds.responseDelayHours,
      safetyFlaggedResponseDelayHours: patientThresholds.safetyFlaggedResponseDelayHours,
      rationale: patientThresholds.rationale ?? '',
    });
  }, [patientThresholds]);

  useEffect(() => {
    if (!patientRecoverySupport) {
      return;
    }

    setRecoverySupportDraft({
      checkinMode: patientRecoverySupport.checkinMode,
      nudgesEnabled: patientRecoverySupport.nudgesEnabled,
      rationale: patientRecoverySupport.rationale ?? '',
    });
  }, [patientRecoverySupport]);

  useEffect(() => {
    if (!patientDischargeSummary) {
      return;
    }

    setDischargeDraft((current) =>
      current.summary.trim() || current.contactInstructions.trim()
        ? current
        : {
            summary: patientDischargeSummary.summary ?? '',
            contactInstructions: patientDischargeSummary.safetyInstructions[0] ?? '',
            independentModeEnabled: patientDischargeSummary.independentModeEnabled,
          },
    );
  }, [patientDischargeSummary]);

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

  const openWorkspaceTab = useCallback(
    (tabId: PatientWorkspaceTabId, jumpTargetId?: string): void => {
      if (jumpTargetId) {
        setPendingWorkspaceJumpId(jumpTargetId);
      }

      if (!patientId) {
        return;
      }

      const nextPathname = buildPatientWorkspacePath(patientId, tabId);
      if (location.pathname === nextPathname) {
        return;
      }

      navigate(
        {
          pathname: nextPathname,
          search: location.search,
        },
        { replace: false },
      );
    },
    [location.pathname, location.search, navigate, patientId],
  );

  useEffect(() => {
    if (!pendingWorkspaceJumpId || typeof window === 'undefined') {
      return;
    }

    const handle = window.requestAnimationFrame(() => {
      scrollToPanel(pendingWorkspaceJumpId);
      setPendingWorkspaceJumpId(null);
    });

    return () => window.cancelAnimationFrame(handle);
  }, [activeWorkspaceTab, pendingWorkspaceJumpId, scrollToPanel]);

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
        scrollToPanel('patient-detail-alerts-panel');
        return;
      }

      if (key === 'communication') {
        openCommunicationWorkspace();
        return;
      }

      if (key === 'tasks') {
        openWorkspaceTab('communications', 'patient-tasks-panel');
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

      openWorkspaceTab('history', 'patient-history-trends');
    },
    [navigate, openCommunicationWorkspace, openWorkspaceTab, patientId, scrollToPanel],
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
    setPatientQuickReply('');
  }, [patientId, canQuickReplyFromPatientDetail]);

  const handleRefreshOverview = useCallback((): void => {
    const refreshes: Array<Promise<unknown>> = [
      patientsQuery.refetch(),
      trendsQuery.refetch(),
      patientAlertsQuery.refetch(),
      patientWorklistQuery.refetch(),
      patientAppointmentsQuery.refetch(),
      patientRecoverySupportQuery.refetch(),
      patientCaregiverAccessQuery.refetch(),
    ];

    if (shouldLoadDischargeSummary) {
      refreshes.push(patientDischargeSummaryQuery.refetch());
    }

    if (shouldLoadOperationalBucket) {
      refreshes.push(patientTasksQuery.refetch(), patientCommunicationQuery.refetch());
    }

    if (shouldLoadGuidanceBucket) {
      refreshes.push(
        patientPlanQuery.refetch(),
        patientRehabQuery.refetch(),
        patientPromsQuery.refetch(),
        patientInsightsQuery.refetch(),
      );
    }

    refreshes.push(patientThresholdsQuery.refetch(), patientSafetyEventsQuery.refetch());

    if (shouldLoadSessionsBucket) {
      refreshes.push(patientSessionsQuery.refetch());
    }

    if (shouldLoadHistoryReferenceBucket) {
      refreshes.push(
        patientRecentCheckinsQuery.refetch(),
        patientHydrationQuery.refetch(),
        patientNutritionQuery.refetch(),
        patientWearablesSummaryQuery.refetch(),
        patientWearablesDailyQuery.refetch(),
        patientMedicationAdherenceQuery.refetch(),
        patientPhotosQuery.refetch(),
      );
    }

    void Promise.allSettled(refreshes);
  }, [
    patientAlertsQuery,
    patientAppointmentsQuery,
    patientCommunicationQuery,
    patientHydrationQuery,
    patientInsightsQuery,
    patientMedicationAdherenceQuery,
    patientNutritionQuery,
    patientPlanQuery,
    patientPhotosQuery,
    patientPromsQuery,
    patientRecentCheckinsQuery,
    patientRehabQuery,
    patientSessionsQuery,
    patientSafetyEventsQuery,
    patientTasksQuery,
    patientThresholdsQuery,
    patientWearablesDailyQuery,
    patientWearablesSummaryQuery,
    patientWorklistQuery,
    patientsQuery,
    shouldLoadGuidanceBucket,
    shouldLoadHistoryReferenceBucket,
    shouldLoadOperationalBucket,
    shouldLoadSessionsBucket,
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
    void Promise.allSettled([
      patientsQuery.refetch(),
      trendsQuery.refetch(),
      patientAlertsQuery.refetch(),
      patientWorklistQuery.refetch(),
      patientAppointmentsQuery.refetch(),
    ]);
  }, [patientAlertsQuery, patientAppointmentsQuery, patientWorklistQuery, patientsQuery, trendsQuery]);

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

  useLayoutEffect(() => {
    const element = patientDetailShellRef.current;

    if (!element) {
      return;
    }

    const updateInlineWidth = (nextWidth: number): void => {
      const normalizedWidth = Number.isFinite(nextWidth) ? Math.round(nextWidth) : 0;

      if (normalizedWidth <= 0) {
        return;
      }

      setPatientDetailInlineWidth((currentWidth) =>
        currentWidth === normalizedWidth ? currentWidth : normalizedWidth,
      );
    };

    const measure = (): void => {
      updateInlineWidth(element.getBoundingClientRect().width);
    };

    measure();

    if (typeof window === 'undefined') {
      return;
    }

    if (typeof window.ResizeObserver !== 'function') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }

    const observer = new window.ResizeObserver((entries) => {
      const entry = entries.find((candidate) => candidate.target === element) ?? entries[0];
      updateInlineWidth(entry?.contentRect.width ?? element.getBoundingClientRect().width);
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

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
  const latestOpenAlert = openPatientAlerts[0] ?? null;
  const latestOpenAlertReason = latestOpenAlert ? formatAlertReasonText(latestOpenAlert.reason) : null;
  const currentContextTitle =
    patientWorklistItem?.topIssue?.trim() ||
    (latestOpenAlert
      ? 'Open safety alert needs review'
      : (trendSummary.latestPain ?? 0) >= 7
        ? 'Pain elevated in current window'
        : (trendSummary.adherence7d ?? 1) < 0.5
          ? 'Adherence below target in current window'
          : 'Stable review window');
  const currentContextBody =
    patientWorklistItem?.reviewReason?.trim() ||
    (latestOpenAlertReason
      ? latestOpenAlertReason
      : (trendSummary.latestPain ?? 0) >= 7
        ? `Latest patient-reported pain is ${trendSummary.latestPain}/10 in the selected review window.`
        : (trendSummary.adherence7d ?? 1) < 0.5
          ? `7d exercise completion is ${Math.round((trendSummary.adherence7d ?? 0) * 100)}% in the selected review window.`
          : 'Use the priorities, trends, and operational panels below to confirm the next clinician step.');
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
  const shellFollowUpCount =
    (patientWorklistItem?.activeTaskCount ?? 0) + (patientWorklistItem?.communicationNeedsResponse ? 1 : 0);
  const overviewFollowUpCount = patientActiveTasks.length + patientCommunicationItems.length;
  const overviewUrgentTaskCount = patientActiveTasks.filter((task) => task.priority === 'urgent').length;
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
      value: shellFollowUpCount > 0 ? String(shellFollowUpCount) : 'Steady',
      note:
        patientWorklistItem?.communicationNeedsResponse && (patientWorklistItem?.activeTaskCount ?? 0) > 0
          ? 'Patient response and task follow-through remain open'
          : patientWorklistItem?.communicationNeedsResponse
            ? 'Patient communication needs clinician response'
            : (patientWorklistItem?.activeTaskCount ?? 0) > 0
              ? `${patientWorklistItem?.activeTaskCount ?? 0} active follow-up task${
                  (patientWorklistItem?.activeTaskCount ?? 0) === 1 ? '' : 's'
                }`
              : 'No open follow-through waiting',
      tone: shellFollowUpCount > 0 ? 'active' : 'stable',
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
    patientWorklistQuery.error ? toUserMessage(patientWorklistQuery.error) : null,
    trendsQuery.error ? toUserMessage(trendsQuery.error) : null,
    patientAlertsQuery.error ? toUserMessage(patientAlertsQuery.error) : null,
    patientAppointmentsQuery.error ? toUserMessage(patientAppointmentsQuery.error) : null,
  ].filter((message): message is string => Boolean(message));
  const careReviewIssueMessages =
    isOverviewWorkspace || isGuidanceWorkspace
      ? [
          patientRehabQuery.error ? toUserMessage(patientRehabQuery.error) : null,
          patientPromsQuery.error ? toUserMessage(patientPromsQuery.error) : null,
          patientInsightsQuery.error ? toUserMessage(patientInsightsQuery.error) : null,
          patientSessionsQuery.error ? toUserMessage(patientSessionsQuery.error) : null,
        ].filter((message): message is string => Boolean(message))
      : [];
  const referenceIssueMessages = isHistoryWorkspace
    ? [
        patientRecentCheckinsQuery.error ? toUserMessage(patientRecentCheckinsQuery.error) : null,
        patientHydrationQuery.error ? toUserMessage(patientHydrationQuery.error) : null,
        patientNutritionQuery.error ? toUserMessage(patientNutritionQuery.error) : null,
        patientWearablesSummaryQuery.error ? toUserMessage(patientWearablesSummaryQuery.error) : null,
        patientWearablesDailyQuery.error ? toUserMessage(patientWearablesDailyQuery.error) : null,
        patientMedicationAdherenceQuery.error ? toUserMessage(patientMedicationAdherenceQuery.error) : null,
        patientPhotosQuery.error ? toUserMessage(patientPhotosQuery.error) : null,
      ].filter((message): message is string => Boolean(message))
    : [];
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

  const isPatientDetailInline1320 =
    patientDetailInlineWidth !== null && patientDetailInlineWidth <= 1320;
  const isPatientDetailInline1180 =
    patientDetailInlineWidth !== null && patientDetailInlineWidth <= 1180;
  const isPatientDetailInline1040 =
    patientDetailInlineWidth !== null && patientDetailInlineWidth <= 1040;
  const isPatientDetailInline860 =
    patientDetailInlineWidth !== null && patientDetailInlineWidth <= 860;
  const isPrioritySupportResponsive = isPatientDetailInline1320;
  const latestCommunicationItem = patientCommunicationItems[0] ?? null;
  const nextOpenTask = patientActiveTasks[0] ?? null;
  const nextPromDueItem = patientPromDue[0] ?? null;
  const nextPendingInsight = patientPendingInsights[0] ?? null;
  const latestExerciseSession = patientSessions[0] ?? null;
  const alertsFreshnessLabel = formatLoadedAgo(patientAlertsQuery.dataUpdatedAt);
  const tasksFreshnessLabel = shouldLoadOperationalBucket
    ? formatLoadedAgo(patientTasksQuery.dataUpdatedAt)
    : null;
  const appointmentsFreshnessLabel = formatLoadedAgo(patientAppointmentsQuery.dataUpdatedAt);
  const trendsFreshnessLabel = formatLoadedAgo(trendsQuery.dataUpdatedAt);
  const sessionsFreshnessLabel = shouldLoadSessionsBucket
    ? formatLoadedAgo(patientSessionsQuery.dataUpdatedAt)
    : null;
  const railFreshnessLabel = formatLoadedAgo(
    maxUpdatedAt(
      trendsQuery.dataUpdatedAt,
      patientAlertsQuery.dataUpdatedAt,
      patientWorklistQuery.dataUpdatedAt,
    ),
  );
  const overviewFreshnessLabel = isOverviewWorkspace
    ? formatLoadedAgo(
        maxUpdatedAt(
          trendsQuery.dataUpdatedAt,
          patientWorklistQuery.dataUpdatedAt,
          patientTasksQuery.dataUpdatedAt,
          patientCommunicationQuery.dataUpdatedAt,
          patientAppointmentsQuery.dataUpdatedAt,
          patientAlertsQuery.dataUpdatedAt,
          patientPromsQuery.dataUpdatedAt,
          patientInsightsQuery.dataUpdatedAt,
          patientRehabQuery.dataUpdatedAt,
          patientSessionsQuery.dataUpdatedAt,
        ),
      )
    : null;
  const communicationsFreshnessLabel = shouldLoadOperationalBucket
    ? formatLoadedAgo(
        maxUpdatedAt(
          patientCommunicationQuery.dataUpdatedAt,
          patientTasksQuery.dataUpdatedAt,
          patientAppointmentsQuery.dataUpdatedAt,
        ),
      )
    : null;
  const guidanceFreshnessLabel = shouldLoadGuidanceBucket
    ? formatLoadedAgo(
        maxUpdatedAt(
          patientPromsQuery.dataUpdatedAt,
          patientInsightsQuery.dataUpdatedAt,
          patientRehabQuery.dataUpdatedAt,
        ),
      )
    : null;
  const historyFreshnessLabel = isHistoryWorkspace
    ? formatLoadedAgo(
        maxUpdatedAt(
          trendsQuery.dataUpdatedAt,
          patientSessionsQuery.dataUpdatedAt,
          patientRecentCheckinsQuery.dataUpdatedAt,
          patientHydrationQuery.dataUpdatedAt,
          patientNutritionQuery.dataUpdatedAt,
          patientWearablesSummaryQuery.dataUpdatedAt,
          patientWearablesDailyQuery.dataUpdatedAt,
          patientMedicationAdherenceQuery.dataUpdatedAt,
          patientPhotosQuery.dataUpdatedAt,
        ),
      )
    : null;
  const overviewActivityItems: Array<{ label: string; value: string; note: string }> = [
    {
      label: 'Patient update',
      value: trendSummary.lastCheckinDate
        ? formatDashboardRelativeTime(trendSummary.lastCheckinDate)
        : 'No recent check-in',
      note: trendSummary.lastCheckinDate
        ? 'Latest patient-reported update in this review window'
        : 'No patient-reported check-in is available in this window',
    },
    {
      label: 'Safety',
      value:
        openAlertCount > 0
          ? `${openAlertCount} open alert${openAlertCount === 1 ? '' : 's'}`
          : 'Queue clear',
      note: latestOpenAlertReason ?? 'No active safety events are visible right now',
    },
    {
      label: 'Follow-through',
      value:
        overviewFollowUpCount > 0
          ? `${overviewFollowUpCount} item${overviewFollowUpCount === 1 ? '' : 's'} waiting`
          : 'Nothing waiting',
      note: nextOpenTask
        ? `${nextOpenTask.title} due ${formatDashboardRelativeTime(nextOpenTask.dueAt ?? nextOpenTask.updatedAt)}`
        : latestCommunicationItem?.messagePreview?.trim() || 'No open task or message queue needs follow-through',
    },
    {
      label: nextPatientAppointment ? 'Next touchpoint' : 'Recent session',
      value: nextPatientAppointment
        ? formatDashboardRelativeTime(nextPatientAppointment.startsAt)
        : latestExerciseSession
          ? formatDashboardRelativeTime(latestExerciseSession.startedAt)
          : 'No recent session',
      note: nextPatientAppointment
        ? `${appointmentWorkflowLabel(nextPatientAppointment.workflowStatus)}${
            nextPatientAppointment.note?.trim() ? ` · ${nextPatientAppointment.note.trim()}` : ''
          }`
        : latestExerciseSession?.planTitle ?? 'No upcoming appointment or recent session is visible',
    },
  ];
  const historyWindowItems: Array<{ label: string; value: string; note: string }> = [
    {
      label: 'Last check-in',
      value: trendSummary.lastCheckinDate
        ? formatDashboardRelativeTime(trendSummary.lastCheckinDate)
        : 'None in window',
      note: trendSummary.lastCheckinDate
        ? 'Most recent patient-reported update'
        : 'No check-in data for the selected window',
    },
    {
      label: 'Latest pain',
      value: trendSummary.latestPain === null ? '—' : `${trendSummary.latestPain}/10`,
      note:
        trendSummary.latestMood !== null
          ? `Latest paired mood ${trendSummary.latestMood}`
          : 'No mood was paired with the latest pain score',
    },
    {
      label: '7d adherence',
      value: `${Math.round((trendSummary.adherence7d ?? 0) * 100)}%`,
      note:
        trendSummary.avgPain7d !== null
          ? `Recent check-in average pain ${trendSummary.avgPain7d}`
          : 'Based on recent check-ins in the selected window',
    },
    {
      label: 'Recent session',
      value: latestExerciseSession ? formatDashboardRelativeTime(latestExerciseSession.startedAt) : 'No recent session',
      note: latestExerciseSession?.planTitle ?? 'Exercise sessions will appear here once completed',
    },
  ];

  const handleWorkspaceTabKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    currentIndex: number,
  ): void => {
    let nextIndex = currentIndex;

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = (currentIndex + 1) % PATIENT_WORKSPACE_TABS.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = (currentIndex - 1 + PATIENT_WORKSPACE_TABS.length) % PATIENT_WORKSPACE_TABS.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = PATIENT_WORKSPACE_TABS.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    const nextTab = PATIENT_WORKSPACE_TABS[nextIndex];
    openWorkspaceTab(nextTab.id);

    const tabButtons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
      '[role="tab"]',
    );
    tabButtons?.[nextIndex]?.focus();
  };

  const renderRecentAlertsPanel = (): JSX.Element => (
    <RecentAlertsPanel
      alerts={patientAlerts}
      seenAlertMap={seenAlertMap}
      freshnessLabel={alertsFreshnessLabel}
      mutationPending={updateAlertMutation.isPending}
      onAcknowledge={(alert) => handleStatusUpdate('acknowledged', alert)}
      onResolve={(alert) => handleStatusUpdate('resolved', alert)}
      onViewAll={() => navigate(`/alerts?patientId=${encodeURIComponent(patientId)}`)}
    />
  );

  const renderPriorityHandoffSummary = (): JSX.Element | null => {
    if (!currentHandoff) {
      return null;
    }

    const nextAction =
      currentHandoff.nextStep === 'monitoring' ? null : currentHandoff.nextStep;

    return (
      <Card
        className="patient-detail-panel patient-detail-panel--operations-secondary patient-detail-priority-support__handoff"
        title="Current handoff"
        action={
          nextAction ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                handleOperationalAction(nextAction);
              }}
            >
              {getClinicianCoordinationActionButtonLabel(nextAction)}
            </Button>
          ) : null
        }
      >
        <div className="patient-detail-priority-support__handoff-body">
          <div className="patient-detail-priority-support__handoff-meta-row">
            <p className="patient-detail-priority-support__handoff-meta">
              Saved by {currentHandoff.updatedBy.displayName}
            </p>
            <time
              className="patient-detail-priority-support__handoff-time"
              dateTime={currentHandoff.updatedAt}
              title={formatDashboardDateTime(currentHandoff.updatedAt)}
            >
              {formatDashboardDateTime(currentHandoff.updatedAt)}
            </time>
          </div>
          <p className="patient-detail-priority-support__handoff-submeta">
            Updated {formatDashboardRelativeTime(currentHandoff.updatedAt)}
          </p>
          <p className="patient-detail-priority-support__handoff-summary">
            {currentHandoff.summary ||
              'No summary saved. Use the lower handoff panel to capture structured context.'}
          </p>
          <dl className="patient-detail-priority-support__handoff-facts">
            <div>
              <dt>Next step</dt>
              <dd>{getClinicianCoordinationNextStepLabel(currentHandoff.nextStep)}</dd>
            </div>
            <div>
              <dt>Follow-up owner</dt>
              <dd>{getClinicianCoordinationFollowUpOwnerLabel(currentHandoff.followUpOwner)}</dd>
            </div>
          </dl>
        </div>
      </Card>
    );
  };

  const renderPriorityContextBody = (): JSX.Element => (
    <>
      <section
        id="patient-summary-section"
        className="patient-detail-context-section patient-detail-context-section--snapshot"
        aria-label="Priority patient snapshot"
      >
        <div className="patient-detail-context-section__header">
          <div className="patient-detail-context-section__copy">
            <p className="patient-detail-context-section__eyebrow">Priority snapshot</p>
            <h2 className="patient-detail-context-section__title">Clinical context in view</h2>
          </div>
          <div className="patient-detail-context-section__support">
            <p className="patient-detail-context-section__note">
              High-priority context for the current {selectedDays}-day review window.
            </p>
            <p className="patient-detail-context-section__freshness">{railFreshnessLabel}</p>
          </div>
        </div>
        <PatientSummaryCards metrics={trendSummary} openAlertCount={openAlertCount} />
      </section>

      <div id="patient-detail-alerts-panel">{renderRecentAlertsPanel()}</div>

      <section
        className="patient-detail-focus-card"
        aria-label="Current review focus"
        data-testid="patient-detail-current-context"
      >
        <p className="patient-detail-focus-card__eyebrow">Current review focus</p>
        <h2 className="patient-detail-focus-card__title">{currentContextTitle}</h2>
        <p className="patient-detail-focus-card__text">{currentContextBody}</p>
        {entryReviewHint ? (
          <p className="patient-detail-focus-card__hint" data-testid="patient-detail-entry-hint">
            {entryReviewHint}
          </p>
        ) : null}
      </section>

      {renderPriorityHandoffSummary()}
    </>
  );

  return (
    <div
      ref={patientDetailShellRef}
      className={`page-stack dashboard-page-shell dashboard-page-shell--patient patient-detail-page${
        isPatientDetailInline1320 ? ' patient-detail-page--inline-1320' : ''
      }${isPatientDetailInline1180 ? ' patient-detail-page--inline-1180' : ''}${
        isPatientDetailInline1040 ? ' patient-detail-page--inline-1040' : ''
      }${isPatientDetailInline860 ? ' patient-detail-page--inline-860' : ''}`}
    >
      <section
        className={`patient-detail-cockpit-header${
          entryContext ? ` patient-detail-brief--source patient-detail-brief--source-${entryContext.focus}` : ''
        }`}
      >
        <div className="patient-detail-cockpit-header__utility-row">
          <div className="patient-detail-cockpit-header__return">
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
          <div className="patient-detail-cockpit-header__window">
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

        <div className="patient-detail-cockpit-header__identity-row">
          <div className="patient-detail-cockpit-header__identity">
            <p className="patient-detail-cockpit-header__eyebrow">Clinician cockpit</p>
            <div className="patient-detail-cockpit-header__name-row">
              <h1 className="patient-detail-cockpit-header__name">{patientDisplayName}</h1>
              {patientContext?.status ? (
                <Badge className="patient-detail-title__status" variant={statusBadgeVariant(patientContext.status)} icon>
                  {statusLabel(patientContext.status)}
                </Badge>
              ) : null}
            </div>
            <div className="patient-detail-cockpit-header__meta">
              {patientDisplayName !== patientId ? (
                <span className="patient-id-text patient-detail-title__id">ID: {patientId}</span>
              ) : null}
              {currentRehabPhaseTitle ? (
                <span className="patient-detail-cockpit-header__meta-item">{currentRehabPhaseTitle}</span>
              ) : null}
              <span className="patient-detail-cockpit-header__meta-item">
                {trendSummary.lastCheckinDate
                  ? `Last check-in ${formatDashboardRelativeTime(trendSummary.lastCheckinDate)}`
                  : 'No recent check-in'}
              </span>
            </div>
          </div>

          <section className="patient-detail-cockpit-header__actions" aria-label="Top patient actions">
            <p className="patient-detail-cockpit-header__eyebrow">Top actions</p>
            <div className="patient-detail-actions">
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
        </div>

        <div className="patient-detail-cockpit-header__facts" aria-label="Immediate patient review facts">
          {patientBriefFacts.map((fact) => (
            <article
              key={fact.label}
              className={`patient-detail-cockpit-header__fact patient-detail-cockpit-header__fact--${fact.tone}`}
            >
              <span className="patient-detail-cockpit-header__fact-label">{fact.label}</span>
              <strong className="patient-detail-cockpit-header__fact-value">{fact.value}</strong>
              <p className="patient-detail-cockpit-header__fact-note">{fact.note}</p>
            </article>
          ))}
        </div>
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
          id="patient-detail-priority-context"
          className="patient-detail-priority-context patient-detail-priority-context--stacked"
          aria-label="Priority patient support context"
          data-testid="patient-detail-priority-support"
        >
          {renderPriorityContextBody()}
        </section>
      ) : null}

      <div className="patient-detail-cockpit-layout">
        <section className="patient-detail-workspace" aria-label="Patient detail workspace">
          <div className="patient-detail-workspace__nav">
            <div className="patient-detail-workspace__nav-copy">
              <p className="patient-detail-workspace__eyebrow">Main workspace</p>
              <h2 className="patient-detail-workspace__title">Deep review modes</h2>
            </div>
            <div
              className="patient-detail-workspace__tabs"
              role="tablist"
              aria-label="Patient detail workspaces"
            >
              {PATIENT_WORKSPACE_TABS.map((tab, index) => {
                const tabId = `patient-detail-workspace-tab-${tab.id}`;
                const panelId = `patient-detail-workspace-panel-${tab.id}`;
                const isActive = activeWorkspaceTab === tab.id;

                return (
                  <button
                    key={tab.id}
                    id={tabId}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    aria-controls={panelId}
                    tabIndex={isActive ? 0 : -1}
                    className={`patient-detail-workspace__tab${
                      isActive ? ' patient-detail-workspace__tab--active' : ''
                    }`}
                    onClick={() => {
                      openWorkspaceTab(tab.id);
                    }}
                    onKeyDown={(event) => handleWorkspaceTabKeyDown(event, index)}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {activeWorkspaceTab === 'overview' ? (
            <section
              id="patient-detail-workspace-panel-overview"
              className="patient-detail-workspace__panel"
              role="tabpanel"
              aria-labelledby="patient-detail-workspace-tab-overview"
            >
              <div className="patient-detail-workspace__panel-header">
                <div>
                  <p className="patient-detail-section-eyebrow">Overview</p>
                  <h3 className="patient-detail-section-title">Priorities and next actions</h3>
                </div>
                <div className="patient-detail-workspace__panel-support">
                  <p className="patient-detail-section-note">
                    Start with the live decision surface, then scan the most actionable follow-through and guidance context.
                  </p>
                  {overviewFreshnessLabel ? (
                    <p className="patient-detail-section-freshness">{overviewFreshnessLabel}</p>
                  ) : null}
                </div>
              </div>

              <section className="patient-detail-workspace__lead">
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

              <section className="patient-detail-review-window-summary">
                <div className="patient-detail-review-window-summary__header">
                  <p className="patient-detail-review-window-summary__eyebrow">Review window activity</p>
                  <p className="patient-detail-review-window-summary__note">
                    Latest patient update, safety queue, follow-through, and next touchpoint in the selected window.
                  </p>
                </div>
                <section className="patient-detail-review-window-strip" aria-label="Overview review window activity">
                  {overviewActivityItems.map((item) => (
                    <article key={item.label} className="patient-detail-review-window-strip__item">
                      <span className="patient-detail-review-window-strip__label">{item.label}</span>
                      <strong className="patient-detail-review-window-strip__value">{item.value}</strong>
                      <p className="patient-detail-review-window-strip__note">{item.note}</p>
                    </article>
                  ))}
                </section>
              </section>

              <div className="patient-detail-overview-grid">
                <Card
                  className="patient-detail-panel patient-detail-panel--overview"
                  title="Follow-through digest"
                >
                  <p className="patient-detail-panel__support-meta">
                    Keep this lane short: what still needs response, completion, or follow-up today.
                  </p>
                  <div className="patient-detail-digest-list">
                    <article className="patient-detail-digest-item">
                      <div className="patient-detail-digest-item__meta">
                        <span className="patient-detail-digest-item__label">Communication</span>
                        <strong className="patient-detail-digest-item__value">
                          {patientCommunicationItems.length === 0
                            ? 'No threads waiting'
                            : `${patientCommunicationItems.length} thread${
                                patientCommunicationItems.length === 1 ? '' : 's'
                              } waiting`}
                        </strong>
                      </div>
                      <p className="patient-detail-digest-item__text">
                        {latestCommunicationItem?.messagePreview?.trim() ||
                          'No recent patient communication needs review.'}
                      </p>
                    </article>

                    <article className="patient-detail-digest-item">
                      <div className="patient-detail-digest-item__meta">
                        <span className="patient-detail-digest-item__label">Tasks</span>
                        <strong className="patient-detail-digest-item__value">
                          {patientActiveTasks.length === 0
                            ? 'No open tasks'
                            : `${patientActiveTasks.length} open${
                                overviewUrgentTaskCount > 0
                                  ? ` · ${overviewUrgentTaskCount} urgent`
                                  : ''
                              }`}
                        </strong>
                      </div>
                      <p className="patient-detail-digest-item__text">
                        {nextOpenTask
                          ? `${nextOpenTask.title} due ${formatDashboardRelativeTime(
                              nextOpenTask.dueAt ?? nextOpenTask.updatedAt,
                            )}.`
                          : 'The follow-through queue is clear right now.'}
                      </p>
                    </article>

                    <article className="patient-detail-digest-item">
                      <div className="patient-detail-digest-item__meta">
                        <span className="patient-detail-digest-item__label">Schedule</span>
                        <strong className="patient-detail-digest-item__value">
                          {nextPatientAppointment
                            ? appointmentWorkflowLabel(nextPatientAppointment.workflowStatus)
                            : 'No appointment queued'}
                        </strong>
                      </div>
                      <p className="patient-detail-digest-item__text">
                        {nextPatientAppointment
                          ? `${formatDashboardRelativeTime(nextPatientAppointment.startsAt)}${
                              nextPatientAppointment.note?.trim()
                                ? ` · ${nextPatientAppointment.note.trim()}`
                                : ''
                            }`
                          : 'Keep scheduling in the secondary workspace unless follow-up is required.'}
                      </p>
                    </article>
                  </div>
                </Card>

                <Card
                  className="patient-detail-panel patient-detail-panel--overview"
                  title="Guidance digest"
                >
                  <p className="patient-detail-panel__support-meta">
                    Review only the guidance and questionnaires that could change the next clinical decision.
                  </p>
                  <div className="patient-detail-digest-list">
                    <article className="patient-detail-digest-item">
                      <div className="patient-detail-digest-item__meta">
                        <span className="patient-detail-digest-item__label">Questionnaires</span>
                        <strong className="patient-detail-digest-item__value">
                          {patientPromDue.length === 0
                            ? 'No PROMs due'
                            : `${patientPromDue.length} due`}
                        </strong>
                      </div>
                      <p className="patient-detail-digest-item__text">
                        {nextPromDueItem
                          ? `${nextPromDueItem.title} due ${new Date(nextPromDueItem.dueAt).toLocaleString()}.`
                          : patientPromCompleted.length > 0
                            ? `${patientPromCompleted.length} questionnaire${
                                patientPromCompleted.length === 1 ? '' : 's'
                              } already completed.`
                            : 'No questionnaire activity in view.'}
                      </p>
                    </article>

                    <article className="patient-detail-digest-item">
                      <div className="patient-detail-digest-item__meta">
                        <span className="patient-detail-digest-item__label">Clinical guidance</span>
                        <strong className="patient-detail-digest-item__value">
                          {patientPendingInsights.length === 0
                            ? 'No pending suggestions'
                            : `${patientPendingInsights.length} pending`}
                        </strong>
                      </div>
                      <p className="patient-detail-digest-item__text">
                        {nextPendingInsight
                          ? nextPendingInsight.title
                          : patientApprovedInsights.length > 0
                            ? `${patientApprovedInsights.length} suggestion${
                                patientApprovedInsights.length === 1 ? '' : 's'
                              } already approved.`
                            : 'No approved or pending guidance suggestions in this window.'}
                      </p>
                    </article>

                    <article className="patient-detail-digest-item">
                      <div className="patient-detail-digest-item__meta">
                        <span className="patient-detail-digest-item__label">Rehab and sessions</span>
                        <strong className="patient-detail-digest-item__value">
                          {currentRehabPhaseTitle ?? 'Phase not set'}
                        </strong>
                      </div>
                      <p className="patient-detail-digest-item__text">
                        {latestExerciseSession
                          ? `${latestExerciseSession.planTitle ?? 'Exercise session'} · ${formatDuration(
                              latestExerciseSession.durationSeconds,
                            )}`
                          : 'No recent exercise sessions recorded yet.'}
                      </p>
                    </article>
                  </div>
                </Card>

                <Card
                  className="patient-detail-panel patient-detail-panel--overview"
                  title="Plan and thresholds"
                  action={
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        void saveThresholdsMutation.mutateAsync();
                      }}
                      disabled={saveThresholdsMutation.isPending}
                    >
                      {saveThresholdsMutation.isPending ? 'Saving…' : 'Save thresholds'}
                    </Button>
                  }
                >
                  <p className="patient-detail-panel__support-meta">
                    Review the current exercise plan state alongside the patient-specific thresholds driving queue and inbox timing.
                  </p>
                  <div className="patient-detail-digest-list">
                    <article className="patient-detail-digest-item">
                      <div className="patient-detail-digest-item__meta">
                        <span className="patient-detail-digest-item__label">Exercise plan</span>
                        <strong className="patient-detail-digest-item__value">
                          {patientPlan
                            ? `Version ${patientPlan.version}`
                            : 'No plan assigned'}
                        </strong>
                      </div>
                      <p className="patient-detail-digest-item__text">
                        {patientPlan
                          ? `${patientPlan.items.length} exercise${
                              patientPlan.items.length === 1 ? '' : 's'
                            } · updated ${formatDashboardRelativeTime(patientPlan.updatedAt)}.`
                          : 'Create a structured plan before assigning or revising exercise work.'}
                      </p>
                    </article>

                    <article className="patient-detail-digest-item">
                      <div className="patient-detail-digest-item__meta">
                        <span className="patient-detail-digest-item__label">Pain threshold</span>
                        <strong className="patient-detail-digest-item__value">
                          {patientThresholds
                            ? `>= ${patientThresholds.painHighThreshold}`
                            : 'Default'}
                        </strong>
                      </div>
                      <p className="patient-detail-digest-item__text">
                        {patientThresholds
                          ? `Missed check-in ${patientThresholds.missedCheckinDays} day${
                              patientThresholds.missedCheckinDays === 1 ? '' : 's'
                            } · response delay ${patientThresholds.responseDelayHours}h · safety delay ${
                              patientThresholds.safetyFlaggedResponseDelayHours
                            }h.`
                          : 'Threshold settings are using the default server rules.'}
                      </p>
                    </article>

                    <article className="patient-detail-digest-item">
                      <div className="patient-detail-digest-item__meta">
                        <span className="patient-detail-digest-item__label">Threshold owner</span>
                        <strong className="patient-detail-digest-item__value">
                          {patientThresholds?.updatedBy?.name ??
                            patientThresholds?.updatedBy?.clinicianId ??
                            'Default rules'}
                        </strong>
                      </div>
                      <p className="patient-detail-digest-item__text">
                        {patientThresholds?.updatedAt
                          ? `Updated ${formatDashboardRelativeTime(patientThresholds.updatedAt)}.`
                          : 'No patient-specific threshold override has been saved yet.'}
                      </p>
                    </article>
                  </div>
                  <div className="patient-detail-overview-grid">
                    <div className="form-field">
                      <span>Pain high threshold</span>
                      <input
                        value={thresholdDraft.painHighThreshold}
                        inputMode="numeric"
                        onChange={(event) =>
                          setThresholdDraft((current) => ({
                            ...current,
                            painHighThreshold: Number.parseInt(event.target.value || '0', 10) || 0,
                          }))
                        }
                      />
                    </div>
                    <div className="form-field">
                      <span>Missed check-in days</span>
                      <input
                        value={thresholdDraft.missedCheckinDays}
                        inputMode="numeric"
                        onChange={(event) =>
                          setThresholdDraft((current) => ({
                            ...current,
                            missedCheckinDays: Number.parseInt(event.target.value || '0', 10) || 0,
                          }))
                        }
                      />
                    </div>
                    <div className="form-field">
                      <span>Response delay hours</span>
                      <input
                        value={thresholdDraft.responseDelayHours}
                        inputMode="numeric"
                        onChange={(event) =>
                          setThresholdDraft((current) => ({
                            ...current,
                            responseDelayHours: Number.parseInt(event.target.value || '0', 10) || 0,
                          }))
                        }
                      />
                    </div>
                    <div className="form-field">
                      <span>Safety-flagged delay hours</span>
                      <input
                        value={thresholdDraft.safetyFlaggedResponseDelayHours}
                        inputMode="numeric"
                        onChange={(event) =>
                          setThresholdDraft((current) => ({
                            ...current,
                            safetyFlaggedResponseDelayHours:
                              Number.parseInt(event.target.value || '0', 10) || 0,
                          }))
                        }
                      />
                    </div>
                  </div>
                  <div className="form-field">
                    <span>Rationale</span>
                    <textarea
                      rows={2}
                      value={thresholdDraft.rationale}
                      onChange={(event) =>
                        setThresholdDraft((current) => ({
                          ...current,
                          rationale: event.target.value,
                        }))
                      }
                      placeholder="Brief note for why this patient needs a different threshold profile"
                    />
                  </div>
                </Card>

                <Card
                  className="patient-detail-panel patient-detail-panel--overview"
                  title="Recovery support"
                  action={
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        void saveRecoverySupportMutation.mutateAsync();
                      }}
                      disabled={saveRecoverySupportMutation.isPending}
                    >
                      {saveRecoverySupportMutation.isPending ? 'Saving…' : 'Save support settings'}
                    </Button>
                  }
                >
                  <p className="patient-detail-panel__support-meta">
                    Keep adaptive check-ins and factual nudges explicit, auditable, and off by default until a clinician enables them.
                  </p>
                  <div className="patient-detail-digest-list">
                    <article className="patient-detail-digest-item">
                      <div className="patient-detail-digest-item__meta">
                        <span className="patient-detail-digest-item__label">Check-in mode</span>
                        <strong className="patient-detail-digest-item__value">
                          {recoverySupportModeLabel(patientRecoverySupport?.checkinMode)}
                        </strong>
                      </div>
                      <p className="patient-detail-digest-item__text">
                        {patientRecoverySupport?.updatedAt
                          ? `Updated ${formatDashboardRelativeTime(patientRecoverySupport.updatedAt)} by ${
                              patientRecoverySupport.updatedBy?.name ??
                              patientRecoverySupport.updatedBy?.clinicianId ??
                              'the care team'
                            }.`
                          : 'No patient-specific recovery support override has been saved yet.'}
                      </p>
                    </article>

                    <article className="patient-detail-digest-item">
                      <div className="patient-detail-digest-item__meta">
                        <span className="patient-detail-digest-item__label">Today's adaptation</span>
                        <strong className="patient-detail-digest-item__value">
                          {adaptationModeLabel(currentAdaptationDecision?.mode)}
                        </strong>
                      </div>
                      <p className="patient-detail-digest-item__text">
                        {currentAdaptationDecision?.explanation ?? formatReasonCodes(currentAdaptationDecision?.reasonCodes)}
                      </p>
                    </article>

                    <article className="patient-detail-digest-item">
                      <div className="patient-detail-digest-item__meta">
                        <span className="patient-detail-digest-item__label">Current nudge</span>
                        <strong className="patient-detail-digest-item__value">
                          {currentRecoveryNudge?.title ?? 'No active nudge'}
                        </strong>
                      </div>
                      <p className="patient-detail-digest-item__text">
                        {currentRecoveryNudge
                          ? `${currentRecoveryNudge.message} · ${currentRecoveryNudge.evidenceWindow}`
                          : 'No factual recovery nudge is active for this patient right now.'}
                      </p>
                    </article>
                  </div>
                  <div className="patient-detail-overview-grid">
                    <label className="form-field">
                      <span>Check-in mode</span>
                      <select
                        value={recoverySupportDraft.checkinMode}
                        onChange={(event) =>
                          setRecoverySupportDraft((current) => ({
                            ...current,
                            checkinMode: event.target.value as PatientRecoverySupportConfig['checkinMode'],
                          }))
                        }
                      >
                        <option value="standard">Standard</option>
                        <option value="adaptive">Adaptive</option>
                        <option value="force_full">Force full</option>
                      </select>
                    </label>
                    <label className="form-field">
                      <span>Patient nudges</span>
                      <div className="patient-detail-actions">
                        <input
                          type="checkbox"
                          checked={recoverySupportDraft.nudgesEnabled}
                          onChange={(event) =>
                            setRecoverySupportDraft((current) => ({
                              ...current,
                              nudgesEnabled: event.target.checked,
                            }))
                          }
                        />
                        <span>{recoverySupportDraft.nudgesEnabled ? 'Enabled' : 'Disabled'}</span>
                      </div>
                    </label>
                  </div>
                  <div className="form-field">
                    <span>Rationale</span>
                    <textarea
                      rows={2}
                      value={recoverySupportDraft.rationale}
                      onChange={(event) =>
                        setRecoverySupportDraft((current) => ({
                          ...current,
                          rationale: event.target.value,
                        }))
                      }
                      placeholder="Brief note explaining why adaptive support is or is not enabled for this patient"
                    />
                  </div>
                </Card>

                <Card
                  className="patient-detail-panel patient-detail-panel--overview"
                  title="Caregiver access"
                >
                  <p className="patient-detail-panel__support-meta">
                    Patient-controlled caregiver access stays read-only. Review who can currently see summaries before changing plan intensity or discharge status.
                  </p>
                  {patientCaregiverAccessQuery.isLoading && caregiverAccessItems.length === 0 ? (
                    <div className="patient-detail-skeleton-grid" aria-label="Caregiver access loading placeholder">
                      <Skeleton height={52} />
                      <Skeleton height={52} />
                    </div>
                  ) : activeCaregiverAccessItems.length === 0 ? (
                    <EmptyState
                      title="No caregiver access active"
                      description="Caregiver invites and recent access will appear here when the patient chooses to share summary visibility."
                    />
                  ) : (
                    <div className="patient-detail-digest-list">
                      {activeCaregiverAccessItems.slice(0, 4).map((item) => (
                        <article key={item.inviteId} className="patient-detail-digest-item">
                          <div className="patient-detail-digest-item__meta">
                            <span className="patient-detail-digest-item__label">
                              {item.relationship ?? 'Caregiver access'}
                            </span>
                            <strong className="patient-detail-digest-item__value">
                              {item.caregiverName ?? item.codeHint ?? 'Invite created'}
                            </strong>
                          </div>
                          <p className="patient-detail-digest-item__text">
                            {item.lastAccessedAt
                              ? `Last accessed ${formatDashboardRelativeTime(item.lastAccessedAt)}.`
                              : item.usedAt
                                ? `Accepted ${formatDashboardRelativeTime(item.usedAt)}.`
                                : item.expiresAt
                                  ? `Invite expires ${formatDashboardRelativeTime(item.expiresAt)}.`
                                  : 'Invite metadata is available in the caregiver workspace.'}
                          </p>
                        </article>
                      ))}
                    </div>
                  )}
                </Card>

                <Card
                  className="patient-detail-panel patient-detail-panel--overview"
                  title="Discharge and independent mode"
                  action={
                    patientStatus === 'discharged' || patientStatus === 'inactive' ? (
                      <div className="patient-detail-actions">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            if (typeof window !== 'undefined') {
                              window.print();
                            }
                          }}
                          disabled={!patientDischargeSummary}
                        >
                          Print summary
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            void reactivatePatientMutation.mutateAsync();
                          }}
                          disabled={reactivatePatientMutation.isPending}
                        >
                          {reactivatePatientMutation.isPending ? 'Reactivating…' : 'Reactivate'}
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => {
                          void dischargePatientMutation.mutateAsync();
                        }}
                        disabled={dischargePatientMutation.isPending || dischargeDraft.summary.trim().length < 3}
                      >
                        {dischargePatientMutation.isPending ? 'Updating…' : 'Discharge patient'}
                      </Button>
                    )
                  }
                >
                  <p className="patient-detail-panel__support-meta">
                    Use discharge when routine clinician monitoring should end or transition to patient-managed self-tracking. Historical data remains visible.
                  </p>
                  <div className="patient-detail-digest-list">
                    <article className="patient-detail-digest-item">
                      <div className="patient-detail-digest-item__meta">
                        <span className="patient-detail-digest-item__label">Current care status</span>
                        <strong className="patient-detail-digest-item__value">{statusLabel(patientStatus)}</strong>
                      </div>
                      <p className="patient-detail-digest-item__text">
                        {patientDischargeSummary?.dischargedAt
                          ? `Changed ${formatDashboardDateTime(patientDischargeSummary.dischargedAt)}.`
                          : 'Patient remains in an active care state.'}
                      </p>
                    </article>

                    <article className="patient-detail-digest-item">
                      <div className="patient-detail-digest-item__meta">
                        <span className="patient-detail-digest-item__label">Independent mode</span>
                        <strong className="patient-detail-digest-item__value">
                          {patientDischargeSummary?.independentModeEnabled ? 'Enabled' : 'Not enabled'}
                        </strong>
                      </div>
                      <p className="patient-detail-digest-item__text">
                        {patientDischargeSummary?.independentModeEnabled
                          ? 'The patient can keep using self-tracking without implying routine clinician monitoring.'
                          : 'Check-in and plan activity stay read-only after discharge unless independent mode is enabled.'}
                      </p>
                    </article>

                    <article className="patient-detail-digest-item">
                      <div className="patient-detail-digest-item__meta">
                        <span className="patient-detail-digest-item__label">Discharge summary</span>
                        <strong className="patient-detail-digest-item__value">
                          {patientDischargeSummary?.weeklyHeadline ?? 'Not generated yet'}
                        </strong>
                      </div>
                      <p className="patient-detail-digest-item__text">
                        {patientDischargeSummary?.recentTrendSummary ?? 'A structured summary becomes available after discharge.'}
                      </p>
                    </article>
                  </div>
                  {patientStatus === 'discharged' || patientStatus === 'inactive' ? (
                    <div className="stack stack--2">
                      {patientDischargeSummary ? (
                        <div className="patient-detail-digest-list">
                          <article className="patient-detail-digest-item">
                            <div className="patient-detail-digest-item__meta">
                              <span className="patient-detail-digest-item__label">Next steps</span>
                              <strong className="patient-detail-digest-item__value">
                                {patientDischargeSummary.planStatus}
                              </strong>
                            </div>
                            <p className="patient-detail-digest-item__text">
                              {patientDischargeSummary.nextSteps.join(' ')}
                            </p>
                          </article>
                        </div>
                      ) : null}
                      <div className="patient-detail-overview-grid">
                        <label className="form-field">
                          <span>Reactivate as</span>
                          <select
                            value={reactivationDraft.status}
                            onChange={(event) =>
                              setReactivationDraft((current) => ({
                                ...current,
                                status: event.target.value as 'active' | 'on_hold',
                              }))
                            }
                          >
                            <option value="active">Active</option>
                            <option value="on_hold">On hold</option>
                          </select>
                        </label>
                      </div>
                      <div className="form-field">
                        <span>Reactivation note</span>
                        <textarea
                          rows={2}
                          value={reactivationDraft.rationale}
                          onChange={(event) =>
                            setReactivationDraft((current) => ({
                              ...current,
                              rationale: event.target.value,
                            }))
                          }
                          placeholder="Brief note for why active monitoring is resuming"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="stack stack--2">
                      <div className="form-field">
                        <span>Discharge summary</span>
                        <textarea
                          rows={3}
                          value={dischargeDraft.summary}
                          onChange={(event) =>
                            setDischargeDraft((current) => ({
                              ...current,
                              summary: event.target.value,
                            }))
                          }
                          placeholder="Concise summary of the care transition and what the patient should expect next"
                        />
                      </div>
                      <div className="form-field">
                        <span>Contact instructions</span>
                        <textarea
                          rows={2}
                          value={dischargeDraft.contactInstructions}
                          onChange={(event) =>
                            setDischargeDraft((current) => ({
                              ...current,
                              contactInstructions: event.target.value,
                            }))
                          }
                          placeholder="Direct clinic contact instructions that remain truthful after routine monitoring ends"
                        />
                      </div>
                      <label className="form-field">
                        <span>Independent mode</span>
                        <div className="patient-detail-actions">
                          <input
                            type="checkbox"
                            checked={dischargeDraft.independentModeEnabled}
                            onChange={(event) =>
                              setDischargeDraft((current) => ({
                                ...current,
                                independentModeEnabled: event.target.checked,
                              }))
                            }
                          />
                          <span>Allow self-tracking after discharge</span>
                        </div>
                      </label>
                    </div>
                  )}
                </Card>


                <Card
                  className="patient-detail-panel patient-detail-panel--overview"
                  title="Recent safety context"
                >
                  <p className="patient-detail-panel__support-meta">
                    Confirm the trigger-to-resolution chain before changing outreach, thresholds, or plan intensity.
                  </p>
                  {patientSafetyEventsQuery.isLoading && recentSafetyEvents.length === 0 ? (
                    <div className="patient-detail-skeleton-grid" aria-label="Safety context loading placeholder">
                      <Skeleton height={52} />
                      <Skeleton height={52} />
                    </div>
                  ) : recentSafetyEvents.length === 0 ? (
                    <EmptyState
                      title="No recent safety events"
                      description="New alerts, notification attempts, and clinician actions will appear here."
                      tone="success"
                    />
                  ) : (
                    <div className="patient-detail-digest-list">
                      {recentSafetyEvents.map((event) => (
                        <article key={event.id} className="patient-detail-digest-item">
                          <div className="patient-detail-digest-item__meta">
                            <span className="patient-detail-digest-item__label">{event.eventType}</span>
                            <strong className="patient-detail-digest-item__value">{event.summary}</strong>
                          </div>
                          <p className="patient-detail-digest-item__text">
                            {formatDashboardDateTime(event.occurredAt)}
                            {event.actor?.name || event.actor?.clinicianId
                              ? ` · ${event.actor?.name ?? event.actor?.clinicianId}`
                              : ''}
                          </p>
                        </article>
                      ))}
                    </div>
                  )}
                </Card>
              </div>
            </section>
          ) : null}

          {activeWorkspaceTab === 'communications' ? (
            <section
              id="patient-detail-workspace-panel-communications"
              className="patient-detail-workspace__panel"
              role="tabpanel"
              aria-labelledby="patient-detail-workspace-tab-communications"
            >
              <div className="patient-detail-workspace__panel-header">
                <div>
                  <p className="patient-detail-section-eyebrow">Communications & Notes</p>
                  <h3 className="patient-detail-section-title">Communication, tasks, and internal notes</h3>
                </div>
                <div className="patient-detail-workspace__panel-support">
                  <p className="patient-detail-section-note">
                    Keep conversation history, follow-through tasks, schedule context, and shared clinician coordination in one workspace.
                  </p>
                  {communicationsFreshnessLabel ? (
                    <p className="patient-detail-section-freshness">{communicationsFreshnessLabel}</p>
                  ) : null}
                </div>
              </div>

              <div className="patient-detail-tab-grid patient-detail-tab-grid--communications">
                <div className="patient-detail-tab-grid__primary">
                  <PatientCommunicationPanel
                    items={patientCommunicationItems}
                    timeline={patientCommunicationTimeline}
                    isLoading={patientCommunicationQuery.isLoading}
                    error={patientCommunicationQuery.error ? toUserMessage(patientCommunicationQuery.error) : null}
                    freshnessLabel={communicationsFreshnessLabel}
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
                <div className="patient-detail-tab-grid__secondary">
                  <PatientTasksPanel
                    activeTasks={patientActiveTasks}
                    recentCompletedTasks={patientRecentCompletedTasks}
                    isLoading={patientTasksQuery.isLoading}
                    error={patientTasksQuery.error ? toUserMessage(patientTasksQuery.error) : null}
                    freshnessLabel={tasksFreshnessLabel}
                    completingTaskId={completeTaskMutation.isPending ? completeTaskMutation.variables : null}
                    onRetry={() => {
                      void patientTasksQuery.refetch();
                    }}
                    onCompleteTask={handleCompleteTask}
                    onOpenAlerts={() => handleOperationalAction('alerts')}
                    onOpenAppointments={() => navigate('/appointments')}
                  />
                </div>
                <div className="patient-detail-tab-grid__secondary">
                  <PatientAppointmentsPanel
                    items={patientAppointments}
                    isLoading={patientAppointmentsQuery.isLoading}
                    error={patientAppointmentsQuery.error ? toUserMessage(patientAppointmentsQuery.error) : null}
                    freshnessLabel={appointmentsFreshnessLabel}
                    onRetry={() => {
                      void patientAppointmentsQuery.refetch();
                    }}
                    onOpenAppointments={() => navigate('/appointments')}
                  />
                </div>
                <div className="patient-detail-tab-grid__full">
                  <PatientHandoffPanel
                    patientId={patientId}
                    taskSnapshot={patientTasksQuery.data ?? []}
                    onOpenNextAction={(action) => handleOperationalAction(action)}
                  />
                </div>
              </div>
            </section>
          ) : null}

          {activeWorkspaceTab === 'guidance' ? (
            <section
              id="patient-detail-workspace-panel-guidance"
              className="patient-detail-workspace__panel"
              role="tabpanel"
              aria-labelledby="patient-detail-workspace-tab-guidance"
              data-testid="patient-detail-care-review"
            >
              <div className="patient-detail-workspace__panel-header">
                <div>
                  <p className="patient-detail-section-eyebrow">Clinical Guidance & Questionnaires</p>
                  <h3 className="patient-detail-section-title">Questionnaires, insights, and rehab guidance</h3>
                </div>
                <div className="patient-detail-workspace__panel-support">
                  <p className="patient-detail-section-note">
                    Keep review queues and rehab guidance grouped together without taking over the live work lane.
                  </p>
                  {guidanceFreshnessLabel ? (
                    <p className="patient-detail-section-freshness">{guidanceFreshnessLabel}</p>
                  ) : null}
                </div>
              </div>

              <div className="patient-detail-tab-grid patient-detail-tab-grid--guidance">
                <Card
                  className="patient-detail-panel patient-detail-panel--operations-primary"
                  title="Questionnaires (PROMs)"
                  action={
                    <Button
                      variant="ghost"
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
                          variant="primary"
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
                                className="unstyled-button patient-prom-item patient-prom-item--due"
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
                                className="unstyled-button patient-prom-item patient-prom-item--completed"
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
                        variant="ghost"
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
                              <div key={insight.id} className="patient-insight-item patient-insight-item--pending">
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
                        <div className="patient-detail-list-section__header">
                          <strong>Approved</strong>
                          {patientApprovedInsights.length > 0 ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-expanded={isApprovedInsightsOpen}
                              onClick={() => {
                                setIsApprovedInsightsOpen((current) => !current);
                              }}
                            >
                              {isApprovedInsightsOpen
                                ? 'Hide approved'
                                : `Show approved (${patientApprovedInsights.length})`}
                            </Button>
                          ) : null}
                        </div>
                        {patientApprovedInsights.length === 0 ? (
                          <p className="muted-text">No approved insights yet.</p>
                        ) : !isApprovedInsightsOpen ? (
                          <p className="muted-text">
                            Approved guidance is collapsed by default so pending review stays in view.
                          </p>
                        ) : (
                          <div className="stack stack--2">
                            {patientApprovedInsights.map((insight) => (
                              <div key={insight.id} className="patient-insight-item patient-insight-item--approved">
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

                <Card
                  className="patient-detail-panel patient-detail-panel--operations-primary"
                  title="Rehab phase"
                  action={
                    <div className="patient-detail-actions">
                      <Button
                        variant="ghost"
                        onClick={() => {
                          void patientRehabQuery.refetch();
                        }}
                      >
                        Refresh
                      </Button>
                      <Button
                        variant="primary"
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
              </div>
            </section>
          ) : null}

          {activeWorkspaceTab === 'history' ? (
            <section
              id="patient-detail-workspace-panel-history"
              className="patient-detail-workspace__panel"
              role="tabpanel"
              aria-labelledby="patient-detail-workspace-tab-history"
            >
              <div className="patient-detail-workspace__panel-header">
                <div>
                  <p className="patient-detail-section-eyebrow">History & Signals</p>
                  <h3 className="patient-detail-section-title">Trend history and slower recovery context</h3>
                </div>
                <div className="patient-detail-workspace__panel-support">
                  <p className="patient-detail-section-note">
                    Use the longitudinal record when the active review needs deeper context, not as the first stop.
                  </p>
                  {historyFreshnessLabel ? (
                    <p className="patient-detail-section-freshness">{historyFreshnessLabel}</p>
                  ) : null}
                </div>
              </div>

              <section className="patient-detail-review-window-summary">
                <div className="patient-detail-review-window-summary__header">
                  <p className="patient-detail-review-window-summary__eyebrow">What changed in this window</p>
                  <p className="patient-detail-review-window-summary__note">
                    A factual snapshot of the latest check-in, pain, adherence, and recent session before deeper trend
                    detail.
                  </p>
                </div>
                <section className="patient-detail-review-window-strip" aria-label="History review window summary">
                  {historyWindowItems.map((item) => (
                    <article key={item.label} className="patient-detail-review-window-strip__item">
                      <span className="patient-detail-review-window-strip__label">{item.label}</span>
                      <strong className="patient-detail-review-window-strip__value">{item.value}</strong>
                      <p className="patient-detail-review-window-strip__note">{item.note}</p>
                    </article>
                  ))}
                </section>
              </section>

              <section id="patient-history-trends" className="patient-detail-history-panel">
                <div className="patient-detail-section-header">
                  <div className="patient-detail-section-heading">
                    <p className="patient-detail-section-eyebrow">Trend history</p>
                    <h2 className="patient-detail-section-title">Clinical trajectory</h2>
                  </div>
                  <div className="patient-detail-workspace__panel-support">
                    <p className="patient-detail-section-note">
                      Open day detail only when the active review needs deeper context.
                    </p>
                    {trendsFreshnessLabel ? (
                      <p className="patient-detail-section-freshness">{trendsFreshnessLabel}</p>
                    ) : null}
                  </div>
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

              <div className="patient-detail-tab-grid patient-detail-tab-grid--history-support">
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
                    <div className="patient-detail-panel__header-tools">
                      {sessionsFreshnessLabel ? (
                        <span className="patient-detail-panel__freshness">{sessionsFreshnessLabel}</span>
                      ) : null}
                      <div className="patient-detail-actions">
                        <Button
                          variant="ghost"
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
                      action={
                        <Button
                          variant="secondary"
                          onClick={() => {
                            navigate(`/patients/${patientId}/plan`);
                          }}
                        >
                          Open plan
                        </Button>
                      }
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
              </div>

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
            </section>
          ) : null}
        </section>

        {isPrioritySupportResponsive ? null : (
          <aside
            id="patient-detail-priority-context"
            className="patient-detail-priority-context patient-detail-priority-context--rail"
            aria-label="Patient support context"
            data-testid="patient-detail-priority-support"
          >
            {renderPriorityContextBody()}
          </aside>
        )}
      </div>

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
