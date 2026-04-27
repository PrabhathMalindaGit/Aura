import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useCommunicationAuthoring } from '../../../hooks/useCommunicationAuthoring';
import { useClinicianIdentity } from '../../../hooks/useClinicianIdentity';
import {
  completeClinicianTask,
  generatePatientInsights,
  getDashboardCommunicationOverview,
  getExercisePlan,
  getPatientExerciseSessions,
  getPatientHydrationRange,
  getPatientInsights,
  getPatientMedicationAdherence,
  getPatientPhotos,
  getPatientProms,
  getPatientNutritionRange,
  getRehabPhases,
  listAlerts,
  listAppointmentRequests,
  listClinicianTasks,
  putPatientRecoverySupport,
  recordCommunicationThreadOpened,
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
  assignPromToPatient,
} from '../../../services/clinicianApi';
import {
  addCommunicationThreadReply,
  deriveCommunicationThreadForPatient,
  readCommunicationWorkspaceLocalState,
  type CommunicationTimelineEvent,
} from '../../../services/communicationWorkspace';
import {
  insertSignatureIntoDraft,
  insertTemplateIntoDraft,
} from '../../../services/communicationAuthoring';
import { getSeenMap, getSeenStorageKey, pruneSeenMap, type SeenAlertMap } from '../../../services/seenStore';
import type {
  AlertItem,
  AppointmentRequestItem,
  CaregiverAccessItem,
  CheckinAdaptationDecision,
  CheckinAdaptationHistoryEntry,
  ClinicianCoordinationRecord,
  ClinicianTaskItem,
  DashboardCommunicationOverviewItem,
  ExercisePlan,
  ExerciseSessionListItem,
  InsightItem,
  PatientRecoverySupportConfig,
  PromDueCard,
  PromHistoryRow,
  RehabPayload,
  SafetyAuditEntry,
  SymptomPhotoItem,
  TrendPointNormalized,
  TrendPointRaw,
  TrendSummaryMetrics,
  WorklistRecord,
} from '../../../types/models';
import {
  alertsForDate,
  deriveTrendSummary,
  filterAlertsForPatient,
  normalizeTrendPoints,
  trendPointHasAnyData,
} from '../../../utils/trends';
import { formatDashboardRelativeTime } from '../../../utils/dashboard';
import { asAppError, isRetryable, toUserMessage } from '../../../utils/errors';
import {
  buildPatientWorkspaceDecisionStrip,
  buildPatientWorkspaceHeader,
  buildPatientWorkspaceNavLinks,
  buildPatientOverviewVm,
  buildPatientCommunicationsVm,
  buildPatientGuidanceVm,
  buildPatientHistoryVm,
  buildPatientGovernanceVm,
  buildPatientWorkspacePath,
  formatAlertReasonText,
  getPatientWorkspaceTabFromPath,
  getTemporaryFullFlowOption,
  parsePatientWorkspaceDays,
  type PatientWorkspaceActionId,
  type PatientWorkspaceCommunicationsVm,
  type PatientWorkspaceDecisionStripVm,
  type PatientWorkspaceGuidanceVm,
  type PatientWorkspaceHeaderVm,
  type PatientWorkspaceHistoryVm,
  type PatientWorkspaceOverviewVm,
  type PatientWorkspaceTabId,
  type PatientWorkspaceGovernanceVm,
  type TemporaryFullFlowOption,
  buildTemporaryFullFlowUntil,
} from '../../adapters/patientWorkspace';
import { usePatientWorkspaceUiStore, type PatientWorkspaceSupportView } from '../../state/usePatientWorkspaceUiStore';
import {
  derivePatientCurrentPriorities,
  derivePatientRecommendedActions,
  appointmentWorkflowLabel,
  type PatientActionKey,
  type PatientPriorityItem,
  type PatientRecommendedAction,
} from '../../../utils/patientDetail';
import {
  formatPatientEntryReviewHint,
  readPatientEntryContextFromState,
  type PatientEntryContext,
} from '../../../utils/patientEntryContext';

const ALERT_STATUSES: Array<'open' | 'acknowledged' | 'resolved'> = ['open', 'acknowledged', 'resolved'];
const CLINICIAN_BUCKET = 'anon';

function maxUpdatedAt(...values: Array<number | null | undefined>): number | null {
  const valid = values.filter((value): value is number => typeof value === 'number' && value > 0);
  return valid.length > 0 ? Math.max(...valid) : null;
}

function formatLoadedAgo(value: number | null): string | null {
  if (!value) {
    return null;
  }

  return `Loaded ${formatDashboardRelativeTime(new Date(value).toISOString())}`;
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

function addDaysToWeekStart(weekStart: string, deltaDays: number): string {
  const parsed = parseDateOnly(weekStart);
  if (!parsed) {
    return weekStart;
  }

  const next = new Date(parsed.getTime() + deltaDays * 24 * 60 * 60 * 1000);
  return toDateOnlyUTC(next);
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

async function fetchPatientAlerts(patientId: string): Promise<AlertItem[]> {
  const collections = await Promise.all(ALERT_STATUSES.map((status) => listAlerts(status)));
  const merged = collections.flat();
  const filtered = filterAlertsForPatient(merged, patientId);
  return filtered.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}

function buildHistoryChronologyItems(input: {
  alerts: AlertItem[];
  communicationItems: DashboardCommunicationOverviewItem[];
  tasks: ClinicianTaskItem[];
  sessions: ExerciseSessionListItem[];
  coordination: ClinicianCoordinationRecord | null;
  safetyEvents: SafetyAuditEntry[];
  trends: TrendPointNormalized[];
}): PatientHistoryChronologyItem[] {
  const items: PatientHistoryChronologyItem[] = [];

  input.alerts.forEach((alert) => {
    items.push({
      id: `alert:${alert._id}`,
      family: 'alerts',
      title: Array.isArray(alert.reason) ? alert.reason.join(', ') : alert.reason,
      detail: `Alert ${alert.status}`,
      occurredAt: alert.createdAt,
    });
  });

  input.communicationItems.forEach((item) => {
    items.push({
      id: `communication:${item.id}`,
      family: 'reviews',
      title: item.messagePreview?.trim() || 'Patient communication reviewed',
      detail:
        item.responseDelayed || item.responseState === 'delayed'
          ? 'Response delayed'
          : item.reviewedAfterLatestInbound
            ? 'Reviewed'
            : 'Needs response',
      occurredAt: item.messageCreatedAt,
    });
  });

  input.tasks
    .filter((task) => task.status === 'completed')
    .forEach((task) => {
      items.push({
        id: `task:${task.id}`,
        family: 'interventions',
        title: task.title,
        detail: 'Task completed',
        occurredAt: task.completedAt ?? task.updatedAt,
      });
    });

  input.sessions.forEach((session) => {
    items.push({
      id: `session:${session.id}`,
      family: 'sessions',
      title: session.planTitle ?? 'Exercise session',
      detail: `${session.completedCount}/${session.exerciseCount} completed`,
      occurredAt: session.startedAt,
    });
  });

  input.coordination?.noteHistory.forEach((note) => {
    items.push({
      id: `note:${note.id}`,
      family: 'notes',
      title: note.text,
      detail: `Shared coordination note by ${note.createdBy.displayName}`,
      occurredAt: note.createdAt,
    });
  });

  input.safetyEvents.forEach((event) => {
    items.push({
      id: `safety:${event.id}`,
      family: 'interventions',
      title: event.summary,
      detail: event.eventType,
      occurredAt: event.occurredAt,
    });
  });

  input.trends
    .filter((point) => trendPointHasAnyData(point))
    .forEach((point) => {
      items.push({
        id: `checkin:${point.date}`,
        family: 'check-ins',
        title: `Check-in ${point.date}`,
        detail:
          point.pain !== null || point.mood !== null
            ? `Pain ${point.pain ?? '—'} · Mood ${point.mood ?? '—'}`
            : 'Patient check-in captured',
        occurredAt: `${point.date}T12:00:00.000Z`,
      });
    });

  return items.sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt));
}

function buildActiveScopeLabel(tab: PatientWorkspaceTabId): string {
  if (tab === 'communications') {
    return 'Communications';
  }

  if (tab === 'guidance') {
    return 'Guidance';
  }

  if (tab === 'history') {
    return 'History';
  }

  return 'Overview';
}

export interface PatientHistoryChronologyItem {
  id: string;
  family: 'check-ins' | 'alerts' | 'reviews' | 'interventions' | 'sessions' | 'notes';
  title: string;
  detail: string;
  occurredAt: string;
}

export interface PatientWorkspaceViewModel {
  patientId: string;
  activeTab: PatientWorkspaceTabId;
  selectedDays: 14 | 30;
  header: PatientWorkspaceHeaderVm;
  decisionStrip: PatientWorkspaceDecisionStripVm;
  overview: PatientWorkspaceOverviewVm;
  communications: PatientWorkspaceCommunicationsVm;
  guidance: PatientWorkspaceGuidanceVm;
  history: PatientWorkspaceHistoryVm;
  governance: PatientWorkspaceGovernanceVm;
  patientDisplayName: string;
  headerNotices: Array<{ key: string; tone: 'warning' | 'critical'; title: string; body: string }>;
  activeSupportView: PatientWorkspaceSupportView;
  supportDrawerOpen: boolean;
  setSupportDrawerOpen: (open: boolean) => void;
  setActiveSupportView: (view: PatientWorkspaceSupportView) => void;
  setSelectedDays: (days: 14 | 30) => void;
  openSupportView: (view: PatientWorkspaceSupportView) => void;
  openPatientWorkspaceTab: (tabId: PatientWorkspaceTabId) => void;
  onDecisionAction: (actionId: PatientWorkspaceActionId) => void;
  onOpenCommunicationWorkspace: () => void;
  onOpenAppointmentsWorkspace: () => void;
  onOpenAlertsWorkspace: () => void;
  onOpenPlanWorkspace: () => void;
  onOpenWorklist: () => void;
  alerts: AlertItem[];
  seenAlertMap: SeenAlertMap;
  alertMutationPending: boolean;
  handleAlertStatusUpdate: (nextStatus: 'acknowledged' | 'resolved', alert: AlertItem) => void;
  alertsFreshnessLabel: string | null;
  patientPriorities: PatientPriorityItem[];
  recommendedActions: PatientRecommendedAction[];
  patientPrioritiesError: string | null;
  recommendedActionsError: string | null;
  refreshOverview: () => void;
  refreshCommunications: () => void;
  refreshGuidance: () => void;
  refreshHistory: () => void;
  communicationItems: DashboardCommunicationOverviewItem[];
  communicationTimeline: CommunicationTimelineEvent[];
  canQuickReplyFromPatientDetail: boolean;
  patientCommunicationBlockedBySafety: boolean;
  patientQuickReply: string;
  setPatientQuickReply: (value: string) => void;
  selectedQuickReplyTemplateId: string;
  setSelectedQuickReplyTemplateId: (value: string) => void;
  communicationAuthoring: ReturnType<typeof useCommunicationAuthoring>;
  handlePatientQuickReply: () => void;
  handleInsertPatientQuickReplyTemplate: () => void;
  handleInsertPatientQuickReplySignature: () => void;
  patientTasks: ClinicianTaskItem[];
  patientActiveTasks: ClinicianTaskItem[];
  patientRecentCompletedTasks: ClinicianTaskItem[];
  completingTaskId: string | null;
  handleCompleteTask: (taskId: string) => void;
  tasksFreshnessLabel: string | null;
  patientAppointments: AppointmentRequestItem[];
  appointmentsFreshnessLabel: string | null;
  rehab: RehabPayload | null;
  selectedRehabKey: string;
  setSelectedRehabKey: (value: string) => void;
  handleRehabSave: () => Promise<void>;
  rehabSaveError: string | null;
  isSavingRehab: boolean;
  promDue: PromDueCard[];
  completedProms: PromHistoryRow[];
  promTemplateKey: string;
  setPromTemplateKey: (value: string) => void;
  promDueAt: string;
  setPromDueAt: (value: string) => void;
  handleAssignProm: () => Promise<void>;
  promSaveError: string | null;
  isAssigningProm: boolean;
  pendingInsights: InsightItem[];
  approvedInsights: InsightItem[];
  handleGenerateInsights: () => Promise<void>;
  handleReviewPatientInsight: (insightId: string, status: 'approved' | 'rejected') => Promise<void>;
  isGeneratingInsights: boolean;
  insightReviewingId: string | null;
  insightActionError: string | null;
  insightActionNotice: string | null;
  patientPlan: ExercisePlan | null;
  patientRecoverySupport: PatientRecoverySupportConfig | null;
  recoverySupportDraft: {
    checkinMode: PatientRecoverySupportConfig['checkinMode'];
    nudgesEnabled: boolean;
    rationale: string;
    temporaryForceFullOption: TemporaryFullFlowOption;
  };
  setRecoverySupportCheckinMode: (value: PatientRecoverySupportConfig['checkinMode']) => void;
  setRecoverySupportNudgesEnabled: (value: boolean) => void;
  setRecoverySupportRationale: (value: string) => void;
  setRecoverySupportTemporaryFullFlowOption: (value: TemporaryFullFlowOption) => void;
  handleSaveRecoverySupport: () => Promise<void>;
  recoverySupportError: string | null;
  recoverySupportNotice: string | null;
  isSavingRecoverySupport: boolean;
  currentAdaptationDecision: CheckinAdaptationDecision | null;
  adaptationHistory: CheckinAdaptationHistoryEntry[];
  activeCaregiverAccessItems: CaregiverAccessItem[];
  thresholds: PatientThresholdConfig | null;
  coordinationRecord: ClinicianCoordinationRecord | null;
  safetyEvents: SafetyAuditEntry[];
  selectedDayPoint: TrendPointNormalized | null;
  selectedDayAlerts: AlertItem[];
  chronologyItems: PatientHistoryChronologyItem[];
  normalizedTrends: TrendPointNormalized[];
  trendSummary: TrendSummaryMetrics;
  showTrendsLoading: boolean;
  expandedTrendMetric: 'pain' | 'mood' | 'adherence' | null;
  setExpandedTrendMetric: (metric: 'pain' | 'mood' | 'adherence' | null) => void;
  setSelectedDayKey: (date: string | null) => void;
  recentSleepRows: Array<{ date: string; hours: number | null; quality: number | null; disturbances: number | null }>;
  recentBodyMapSummary: Array<{ region: string; label: string; count: number }>;
  recentHydrationSummary: { avgDailyMl: number | null; daysMeetingTarget: number };
  recentNutritionSummary: { trackedDays: number; avgFruitVeg: number | null; proteinOkHighDays: number };
  recentWearablesSummary: { trackedDays: number | null; avgSteps: number | null; avgActiveMinutes: number | null; avgRestingHr: number | null; source: string | null };
  recentMedicationSummary: { scheduled: number; taken: number; skipped: number; adherencePct: number | null };
  recentPhotos: SymptomPhotoItem[];
}

export function usePatientWorkspaceViewModel(): PatientWorkspaceViewModel {
  const { patientId = '' } = useParams<{ patientId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const clinicianIdentity = useClinicianIdentity();
  const communicationAuthoring = useCommunicationAuthoring();
  const communicationScopeKey = clinicianIdentity.authScopeId ?? clinicianIdentity.clinicianId;
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = useMemo(
    () => getPatientWorkspaceTabFromPath(location.pathname),
    [location.pathname],
  );
  const selectedDays = parsePatientWorkspaceDays(searchParams.get('days'));
  const supportDrawerOpen = usePatientWorkspaceUiStore((state) => state.supportDrawerOpen);
  const activeSupportView = usePatientWorkspaceUiStore((state) => state.activeSupportView);
  const selectedHistoryDate = usePatientWorkspaceUiStore((state) => state.selectedHistoryDate);
  const setSupportDrawerOpen = usePatientWorkspaceUiStore((state) => state.setSupportDrawerOpen);
  const setActiveSupportView = usePatientWorkspaceUiStore((state) => state.setActiveSupportView);
  const setSelectedHistoryDate = usePatientWorkspaceUiStore((state) => state.setSelectedHistoryDate);
  const [entryContext, setEntryContext] = useState<PatientEntryContext | null>(null);
  const [seenAlertMap, setSeenAlertMap] = useState<SeenAlertMap>(() => getSeenMap(CLINICIAN_BUCKET));
  const [communicationLocalState, setCommunicationLocalState] = useState(() =>
    readCommunicationWorkspaceLocalState(communicationScopeKey),
  );
  const [patientQuickReply, setPatientQuickReply] = useState('');
  const [selectedQuickReplyTemplateId, setSelectedQuickReplyTemplateId] = useState('');
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [selectedRehabKey, setSelectedRehabKey] = useState('');
  const [rehabSaveError, setRehabSaveError] = useState<string | null>(null);
  const [isSavingRehab, setIsSavingRehab] = useState(false);
  const [promTemplateKey, setPromTemplateKey] = useState('AURA_RECOVERY_5');
  const [promDueAt, setPromDueAt] = useState('');
  const [promSaveError, setPromSaveError] = useState<string | null>(null);
  const [isAssigningProm, setIsAssigningProm] = useState(false);
  const [insightActionError, setInsightActionError] = useState<string | null>(null);
  const [insightActionNotice, setInsightActionNotice] = useState<string | null>(null);
  const [isGeneratingInsights, setIsGeneratingInsights] = useState(false);
  const [insightReviewingId, setInsightReviewingId] = useState<string | null>(null);
  const [recoverySupportDraft, setRecoverySupportDraft] = useState({
    checkinMode: 'standard' as PatientRecoverySupportConfig['checkinMode'],
    nudgesEnabled: false,
    rationale: '',
    temporaryForceFullOption: 'off' as TemporaryFullFlowOption,
  });
  const [recoverySupportError, setRecoverySupportError] = useState<string | null>(null);
  const [recoverySupportNotice, setRecoverySupportNotice] = useState<string | null>(null);
  const pendingEntryContext = useMemo(
    () => readPatientEntryContextFromState(location.state, patientId),
    [location.state, patientId],
  );

  useEffect(() => {
    setCommunicationLocalState(readCommunicationWorkspaceLocalState(communicationScopeKey));
  }, [communicationScopeKey]);

  useEffect(() => {
    setSelectedHistoryDate(null);
    setPatientQuickReply('');
  }, [patientId, setSelectedHistoryDate]);

  useEffect(() => {
    if (!pendingEntryContext) {
      return;
    }

    setEntryContext(pendingEntryContext);
    navigate(
      {
        pathname: location.pathname,
        search: location.search,
      },
      { replace: true, state: null },
    );
  }, [location.pathname, location.search, navigate, pendingEntryContext]);

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

  const isOverviewWorkspace = activeTab === 'overview';
  const isCommunicationsWorkspace = activeTab === 'communications';
  const isGuidanceWorkspace = activeTab === 'guidance';
  const isHistoryWorkspace = activeTab === 'history';
  const shouldLoadOperationalBucket = isOverviewWorkspace || isCommunicationsWorkspace;
  const shouldLoadGuidanceBucket = isOverviewWorkspace || isGuidanceWorkspace;
  const shouldLoadSessionsBucket = isOverviewWorkspace || isHistoryWorkspace;
  const shouldLoadHistoryReferenceBucket = isHistoryWorkspace;

  const patientsQuery = usePatients();
  const patientContext = useMemo(
    () => patientsQuery.data?.find((patient) => patient.id === patientId) ?? null,
    [patientId, patientsQuery.data],
  );

  const patientCoordinationQuery = usePatientCoordination(patientId);
  const patientStatus = patientContext?.status ?? 'active';
  const shouldLoadDischargeSummary = patientStatus === 'discharged' || patientStatus === 'inactive';

  const trendsQuery = usePatientTrends(patientId, selectedDays);
  const recentSleepTo = useMemo(() => toDateOnlyUTC(new Date()), []);
  const recentSleepFrom = useMemo(() => addDaysToWeekStart(recentSleepTo, -6), [recentSleepTo]);
  const appointmentWindowFrom = useMemo(() => addDaysToWeekStart(recentSleepTo, -30), [recentSleepTo]);
  const appointmentWindowTo = useMemo(() => addDaysToWeekStart(recentSleepTo, 60), [recentSleepTo]);

  const patientRecentCheckinsQuery = useQuery({
    queryKey: ['patient-recent-checkins', patientId, recentSleepFrom, recentSleepTo],
    queryFn: async () => {
      const rows = await tryGetPatientCheckinsRange(patientId, recentSleepFrom, recentSleepTo);
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
    queryFn: () => getPatientHydrationRange(patientId, recentSleepFrom, recentSleepTo),
    enabled: Boolean(patientId) && shouldLoadHistoryReferenceBucket,
    staleTime: 7_000,
    retry: (failureCount, error) => failureCount < 2 && isRetryable(asAppError(error)),
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });

  const patientNutritionQuery = useQuery({
    queryKey: ['patient-nutrition', patientId, recentSleepFrom, recentSleepTo],
    queryFn: () => getPatientNutritionRange(patientId, recentSleepFrom, recentSleepTo),
    enabled: Boolean(patientId) && shouldLoadHistoryReferenceBucket,
    staleTime: 7_000,
    retry: (failureCount, error) => failureCount < 2 && isRetryable(asAppError(error)),
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });

  const patientMedicationAdherenceQuery = useQuery({
    queryKey: ['patient-medications-adherence', patientId, recentSleepFrom, recentSleepTo],
    queryFn: () => getPatientMedicationAdherence(patientId, recentSleepFrom, recentSleepTo),
    enabled: Boolean(patientId) && shouldLoadHistoryReferenceBucket,
    staleTime: 7_000,
    retry: (failureCount, error) => failureCount < 2 && isRetryable(asAppError(error)),
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });

  const patientPhotosQuery = useQuery({
    queryKey: ['patient-photos', patientId, recentSleepFrom, recentSleepTo],
    queryFn: () => getPatientPhotos(patientId, { limit: 20, from: recentSleepFrom, to: recentSleepTo }),
    enabled: Boolean(patientId) && shouldLoadHistoryReferenceBucket,
    staleTime: 7_000,
    retry: (failureCount, error) => failureCount < 2 && isRetryable(asAppError(error)),
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });

  const patientAlertsQuery = useQuery({
    queryKey: ['patient-alerts', patientId],
    queryFn: () => fetchPatientAlerts(patientId),
    enabled: Boolean(patientId),
    staleTime: 7_000,
    retry: (failureCount, error) => failureCount < 2 && isRetryable(asAppError(error)),
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });

  const patientSessionsQuery = useQuery({
    queryKey: ['patient-sessions', patientId],
    queryFn: () => getPatientExerciseSessions(patientId, 5),
    enabled: Boolean(patientId) && shouldLoadSessionsBucket,
    staleTime: 7_000,
    retry: (failureCount, error) => failureCount < 2 && isRetryable(asAppError(error)),
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });

  const patientRehabQuery = useQuery({
    queryKey: ['patient-rehab', patientId],
    queryFn: () => getRehabPhases(patientId),
    enabled: Boolean(patientId) && shouldLoadGuidanceBucket,
    staleTime: 7_000,
    retry: (failureCount, error) => failureCount < 2 && isRetryable(asAppError(error)),
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });

  const patientPromsQuery = useQuery({
    queryKey: ['patient-proms', patientId],
    queryFn: () => getPatientProms(patientId, 50),
    enabled: Boolean(patientId) && shouldLoadGuidanceBucket,
    staleTime: 7_000,
    retry: (failureCount, error) => failureCount < 2 && isRetryable(asAppError(error)),
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
  });

  const patientPlanQuery = useQuery({
    queryKey: ['patient-exercise-plan', patientId],
    queryFn: () => getExercisePlan(patientId),
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
        getPatientInsights(patientId, 'pending', 20),
        getPatientInsights(patientId, 'approved', 20),
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
        patientId,
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
      await Promise.allSettled([
        patientTasksQuery.refetch(),
        patientWorklistQuery.refetch(),
        patientCommunicationQuery.refetch(),
      ]);
    },
  });

  const saveRecoverySupportMutation = useMutation({
    mutationFn: () =>
      putPatientRecoverySupport(patientId, {
        checkinMode: recoverySupportDraft.checkinMode,
        nudgesEnabled: recoverySupportDraft.nudgesEnabled,
        rationale: recoverySupportDraft.rationale,
        temporaryForceFullUntil:
          recoverySupportDraft.checkinMode === 'adaptive'
            ? buildTemporaryFullFlowUntil(recoverySupportDraft.temporaryForceFullOption)
            : null,
      }),
    onSuccess: async () => {
      setRecoverySupportError(null);
      setRecoverySupportNotice('Recovery support settings updated.');
      await Promise.allSettled([
        patientRecoverySupportQuery.refetch(),
        patientWorklistQuery.refetch(),
        patientCommunicationQuery.refetch(),
      ]);
    },
    onError: (error) => {
      setRecoverySupportNotice(null);
      setRecoverySupportError(toUserMessage(asAppError(error)));
    },
  });

  const trendData = useMemo(() => (trendsQuery.data ?? []) as TrendPointRaw[], [trendsQuery.data]);
  const normalizedTrends = useMemo(
    () => normalizeTrendPoints(trendData, selectedDays),
    [selectedDays, trendData],
  );
  const trendSummary = useMemo(() => deriveTrendSummary(normalizedTrends), [normalizedTrends]);

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
        patientId,
        communicationLocalState,
      ),
    [communicationLocalState, patientCommunicationItems, patientId],
  );
  const communicationTimeline = useMemo<CommunicationTimelineEvent[]>(
    () => patientCommunicationThread?.timeline ?? [],
    [patientCommunicationThread],
  );
  const patientCommunicationBlockedBySafety = patientCommunicationItems.some((item) => item.flaggedBySafety);
  const canQuickReplyFromPatientDetail =
    patientCommunicationItems.length > 0 && !patientCommunicationBlockedBySafety;

  useEffect(() => {
    if (!isCommunicationsWorkspace || !patientId) {
      return;
    }

    void recordCommunicationThreadOpened(patientId, {
      sourceSurface: 'patient_detail_communication_panel',
    }).catch(() => undefined);
  }, [isCommunicationsWorkspace, patientId]);

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
  const nextPatientAppointment =
    patientAppointments.find((item) => Date.parse(item.startsAt) >= Date.now()) ??
    patientAppointments[0] ??
    null;
  const patientAlerts = useMemo(() => patientAlertsQuery.data ?? [], [patientAlertsQuery.data]);
  const openPatientAlerts = useMemo(
    () =>
      patientAlerts
        .filter((alert) => alert.status === 'open')
        .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)),
    [patientAlerts],
  );
  const openAlertCount = openPatientAlerts.length;
  const latestOpenAlert = openPatientAlerts[0] ?? null;
  const latestOpenAlertReason = latestOpenAlert ? formatAlertReasonText(latestOpenAlert.reason) : null;
  const patientSessions = useMemo(() => patientSessionsQuery.data ?? [], [patientSessionsQuery.data]);
  const patientRehab = useMemo<RehabPayload | null>(() => patientRehabQuery.data ?? null, [patientRehabQuery.data]);
  const promDue = useMemo<PromDueCard[]>(() => patientPromsQuery.data?.due ?? [], [patientPromsQuery.data?.due]);
  const completedProms = useMemo<PromHistoryRow[]>(
    () => patientPromsQuery.data?.completed ?? [],
    [patientPromsQuery.data?.completed],
  );
  const pendingInsights = useMemo<InsightItem[]>(
    () => patientInsightsQuery.data?.pending ?? [],
    [patientInsightsQuery.data?.pending],
  );
  const approvedInsights = useMemo<InsightItem[]>(
    () => patientInsightsQuery.data?.approved ?? [],
    [patientInsightsQuery.data?.approved],
  );
  const patientPlan = useMemo<ExercisePlan | null>(() => patientPlanQuery.data ?? null, [patientPlanQuery.data]);
  const thresholds = useMemo(
    () => patientThresholdsQuery.data ?? patientWorklistItem?.thresholdSummary ?? null,
    [patientThresholdsQuery.data, patientWorklistItem?.thresholdSummary],
  );
  const patientRecoverySupport = useMemo(
    () => patientRecoverySupportQuery.data?.recoverySupport ?? null,
    [patientRecoverySupportQuery.data?.recoverySupport],
  );
  const currentAdaptationDecision = useMemo<CheckinAdaptationDecision | null>(
    () => patientRecoverySupportQuery.data?.adaptationDecision ?? null,
    [patientRecoverySupportQuery.data?.adaptationDecision],
  );
  const adaptationHistory = useMemo<CheckinAdaptationHistoryEntry[]>(
    () => patientRecoverySupportQuery.data?.adaptationHistory ?? [],
    [patientRecoverySupportQuery.data?.adaptationHistory],
  );
  const caregiverAccessItems = useMemo<CaregiverAccessItem[]>(
    () => (patientCaregiverAccessQuery.data ?? []) as CaregiverAccessItem[],
    [patientCaregiverAccessQuery.data],
  );
  const activeCaregiverAccessItems = useMemo(
    () => caregiverAccessItems.filter((item) => !item.revokedAt),
    [caregiverAccessItems],
  );
  const safetyEvents = useMemo<SafetyAuditEntry[]>(
    () => ((patientSafetyEventsQuery.data ?? []) as SafetyAuditEntry[]).slice(0, 4),
    [patientSafetyEventsQuery.data],
  );
  const coordinationRecord = patientCoordinationQuery.data ?? null;
  const currentHandoff = coordinationRecord?.currentHandoff ?? null;
  const patientDisplayName = patientContext?.displayName?.trim() || patientWorklistItem?.patientName || patientId;
  const currentRehabPhaseTitle =
    patientRehab?.phases.find((phase) => phase.key === patientRehab.currentKey)?.title ??
    patientWorklistItem?.rehabPhase ??
    null;

  useEffect(() => {
    const phases = patientRehab?.phases ?? [];
    if (phases.length === 0) {
      setSelectedRehabKey('');
      return;
    }

    const preferredKey =
      patientRehab?.currentKey ??
      phases.find((phase) => phase.status === 'current')?.key ??
      phases[0]?.key ??
      '';
    setSelectedRehabKey(preferredKey);
  }, [patientRehab]);

  useEffect(() => {
    if (!patientRecoverySupport) {
      return;
    }

    setRecoverySupportDraft({
      checkinMode: patientRecoverySupport.checkinMode,
      nudgesEnabled: patientRecoverySupport.nudgesEnabled,
      rationale: patientRecoverySupport.rationale ?? '',
      temporaryForceFullOption: getTemporaryFullFlowOption(
        patientRecoverySupport.temporaryForceFullUntil,
      ),
    });
  }, [patientRecoverySupport]);

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

  const overviewFollowUpCount = patientActiveTasks.length + patientCommunicationItems.length;
  const latestExerciseSession = patientSessions[0] ?? null;
  const nextOpenTask = patientActiveTasks[0] ?? null;
  const nextPromDue = promDue[0] ?? null;
  const nextPendingInsight = pendingInsights[0] ?? null;

  const overviewActivityItems = useMemo(
    () =>
      [
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
            : patientCommunicationItems[0]?.messagePreview?.trim() ||
              'No open task or message queue needs follow-through',
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
      ] as Array<{ label: string; value: string; note: string }>,
    [
      latestExerciseSession,
      latestOpenAlertReason,
      nextOpenTask,
      nextPatientAppointment,
      openAlertCount,
      overviewFollowUpCount,
      patientCommunicationItems,
      trendSummary.lastCheckinDate,
    ],
  );

  const historyWindowItems = useMemo(
    () =>
      [
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
          value: latestExerciseSession
            ? formatDashboardRelativeTime(latestExerciseSession.startedAt)
            : 'No recent session',
          note: latestExerciseSession?.planTitle ?? 'Exercise sessions will appear here once completed',
        },
      ] as Array<{ label: string; value: string; note: string }>,
    [
      latestExerciseSession,
      trendSummary.adherence7d,
      trendSummary.avgPain7d,
      trendSummary.lastCheckinDate,
      trendSummary.latestMood,
      trendSummary.latestPain,
    ],
  );

  const latestCommunicationItem = patientCommunicationItems[0] ?? null;
  const shellFollowUpCount =
    (patientWorklistItem?.activeTaskCount ?? 0) + (patientWorklistItem?.communicationNeedsResponse ? 1 : 0);
  const lastActivityAt =
    latestCommunicationItem?.messageCreatedAt ??
    patientContext?.lastCheckinAt ??
    patientWorklistItem?.updatedAt ??
    null;
  const navLinks = useMemo(
    () => buildPatientWorkspaceNavLinks(patientId, location.search),
    [location.search, patientId],
  );

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
          : 'Use the active pane and governance surfaces below to confirm the next clinician step.');
  const normalizedCurrentContextTitle = currentContextTitle.replace(/\s+/g, ' ').trim().toLowerCase();
  const normalizedCurrentContextBody = currentContextBody.replace(/\s+/g, ' ').trim().toLowerCase();
  const reviewHint = (() => {
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

  const header = useMemo(
    () =>
      buildPatientWorkspaceHeader({
        patientId,
        patient: patientContext,
        entryContext,
        worklistItem: patientWorklistItem,
        currentRehabPhaseTitle,
        lastActivityAt,
        selectedDays,
        navLinks,
        openAlertCount,
        followUpCount: shellFollowUpCount,
        nextAppointment: nextPatientAppointment,
      }),
    [
      currentRehabPhaseTitle,
      entryContext,
      lastActivityAt,
      navLinks,
      nextPatientAppointment,
      openAlertCount,
      patientContext,
      patientId,
      patientWorklistItem,
      selectedDays,
      shellFollowUpCount,
    ],
  );

  const baseDecisionFacts = useMemo(
    () =>
      activeTab === 'communications'
        ? [
            {
              label: 'Response state',
              value:
                latestCommunicationItem?.responseDelayed || latestCommunicationItem?.responseState === 'delayed'
                  ? 'Response delayed'
                  : latestCommunicationItem?.reviewedAfterLatestInbound
                    ? 'Reviewed'
                    : latestCommunicationItem
                      ? 'Needs response'
                      : 'No open thread',
              note:
                latestCommunicationItem?.messagePreview?.trim() ||
                'No patient communication follow-through is active right now.',
            },
            {
              label: 'Tasks',
              value: patientActiveTasks.length ? `${patientActiveTasks.length} open` : 'Queue clear',
              note: nextOpenTask?.title ?? 'No active follow-through tasks.',
            },
            {
              label: 'Shared handoff',
              value: currentHandoff ? 'Available' : 'Unknown',
              note: currentHandoff?.summary || 'No current shared handoff saved.',
            },
            {
              label: 'Next appointment',
              value: nextPatientAppointment ? formatDashboardRelativeTime(nextPatientAppointment.startsAt) : 'Unknown',
              note: nextPatientAppointment?.note?.trim() || 'No appointment context in view.',
            },
          ]
        : activeTab === 'guidance'
          ? [
              {
                label: 'Rehab phase',
                value: currentRehabPhaseTitle ?? 'Unknown',
                note: patientRehab?.updatedAt
                  ? `Updated ${formatDashboardRelativeTime(patientRehab.updatedAt)}`
                  : 'Rehab phase has not been set.',
              },
              {
                label: 'Questionnaires',
                value: promDue.length > 0 ? `${promDue.length} due` : 'No PROMs due',
                note: nextPromDue?.title ?? 'No due questionnaire in this window.',
              },
              {
                label: 'Guidance',
                value: pendingInsights.length > 0 ? `${pendingInsights.length} pending` : 'No pending guidance',
                note: nextPendingInsight?.title ?? 'No pending guidance suggestion.',
              },
              {
                label: 'Recovery support',
                value: patientRecoverySupport ? patientRecoverySupport.checkinMode : 'Unknown',
                note: patientRecoverySupport?.rationale || 'Using current recovery-support configuration.',
              },
            ]
          : activeTab === 'history'
            ? historyWindowItems
            : overviewActivityItems,
    [
      activeTab,
      currentHandoff,
      currentRehabPhaseTitle,
      historyWindowItems,
      latestCommunicationItem,
      nextOpenTask,
      nextPatientAppointment,
      nextPendingInsight,
      nextPromDue,
      overviewActivityItems,
      patientActiveTasks.length,
      patientRehab?.updatedAt,
      patientRecoverySupport,
      pendingInsights.length,
      promDue.length,
    ],
  );

  const decisionStrip = useMemo(
    () =>
      buildPatientWorkspaceDecisionStrip({
        scopeLabel: buildActiveScopeLabel(activeTab),
        worklistItem: patientWorklistItem,
        latestOpenAlertReason,
        latestPain: trendSummary.latestPain,
        adherence7d: trendSummary.adherence7d,
        reviewHint,
        actions: recommendedActions.slice(0, 3).map((action) => ({
          id:
            action.actionKey === 'trends'
              ? 'history'
              : (action.actionKey as Exclude<PatientActionKey, 'trends'>),
          label: action.actionLabel,
        })),
        facts: baseDecisionFacts.slice(0, 4),
      }),
    [
      activeTab,
      baseDecisionFacts,
      latestOpenAlertReason,
      patientWorklistItem,
      recommendedActions,
      reviewHint,
      trendSummary.adherence7d,
      trendSummary.latestPain,
    ],
  );

  const overview = useMemo(
    () =>
      buildPatientOverviewVm({
        freshnessLabel: formatLoadedAgo(
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
        ),
        reviewWindowItems: overviewActivityItems,
        communicationItems: patientCommunicationItems,
        activeTasks: patientActiveTasks,
        nextAppointment: nextPatientAppointment,
        promDue,
        pendingInsights,
        approvedInsights,
        currentRehabPhaseTitle,
        sessions: patientSessions,
        trendSummary,
      }),
    [
      currentRehabPhaseTitle,
      nextPatientAppointment,
      overviewActivityItems,
      patientActiveTasks,
      patientAlertsQuery.dataUpdatedAt,
      patientAppointmentsQuery.dataUpdatedAt,
      patientCommunicationItems,
      patientCommunicationQuery.dataUpdatedAt,
      patientInsightsQuery.dataUpdatedAt,
      patientPromsQuery.dataUpdatedAt,
      patientRehabQuery.dataUpdatedAt,
      patientSessions,
      patientSessionsQuery.dataUpdatedAt,
      patientTasksQuery.dataUpdatedAt,
      patientWorklistQuery.dataUpdatedAt,
      pendingInsights,
      approvedInsights,
      promDue,
      trendsQuery.dataUpdatedAt,
      trendSummary,
    ],
  );

  const communications = useMemo(
    () =>
      buildPatientCommunicationsVm(
        formatLoadedAgo(
          maxUpdatedAt(
            patientCommunicationQuery.dataUpdatedAt,
            patientTasksQuery.dataUpdatedAt,
            patientAppointmentsQuery.dataUpdatedAt,
          ),
        ),
      ),
    [
      patientAppointmentsQuery.dataUpdatedAt,
      patientCommunicationQuery.dataUpdatedAt,
      patientTasksQuery.dataUpdatedAt,
    ],
  );

  const guidance = useMemo(
    () =>
      buildPatientGuidanceVm({
        freshnessLabel: formatLoadedAgo(
          maxUpdatedAt(
            patientPromsQuery.dataUpdatedAt,
            patientInsightsQuery.dataUpdatedAt,
            patientRehabQuery.dataUpdatedAt,
          ),
        ),
        rehab: patientRehab,
        promDue,
        completedProms,
        pendingInsights,
        approvedInsights,
        recoverySupport: patientRecoverySupport,
      }),
    [
      approvedInsights,
      completedProms,
      patientInsightsQuery.dataUpdatedAt,
      patientPromsQuery.dataUpdatedAt,
      patientRehab,
      patientRehabQuery.dataUpdatedAt,
      patientRecoverySupport,
      pendingInsights,
      promDue,
    ],
  );

  const history = useMemo(
    () =>
      buildPatientHistoryVm({
        freshnessLabel: formatLoadedAgo(
          maxUpdatedAt(
            trendsQuery.dataUpdatedAt,
            patientSessionsQuery.dataUpdatedAt,
            patientRecentCheckinsQuery.dataUpdatedAt,
            patientHydrationQuery.dataUpdatedAt,
            patientNutritionQuery.dataUpdatedAt,
            patientMedicationAdherenceQuery.dataUpdatedAt,
            patientPhotosQuery.dataUpdatedAt,
          ),
        ),
        summaryItems: historyWindowItems,
      }),
    [
      historyWindowItems,
      patientHydrationQuery.dataUpdatedAt,
      patientMedicationAdherenceQuery.dataUpdatedAt,
      patientNutritionQuery.dataUpdatedAt,
      patientPhotosQuery.dataUpdatedAt,
      patientRecentCheckinsQuery.dataUpdatedAt,
      patientSessionsQuery.dataUpdatedAt,
      trendsQuery.dataUpdatedAt,
    ],
  );

  const governance = useMemo(
    () =>
      buildPatientGovernanceVm({
        worklistItem: patientWorklistItem,
        communicationItems: patientCommunicationItems,
        currentHandoff,
        thresholds,
        recoverySupport: patientRecoverySupport,
        adaptationDecision: currentAdaptationDecision,
        adaptationHistory,
        safetyEvents,
      }),
    [
      adaptationHistory,
      currentAdaptationDecision,
      currentHandoff,
      patientCommunicationItems,
      patientRecoverySupport,
      patientWorklistItem,
      safetyEvents,
      thresholds,
    ],
  );

  const recentSleepRows = useMemo(
    () =>
      ((patientRecentCheckinsQuery.data ?? []) as TrendPointRaw[])
        .map((row) => {
          const hours = typeof row.sleep?.hours === 'number' ? row.sleep.hours : null;
          const quality = typeof row.sleep?.quality === 'number' ? row.sleep.quality : null;
          const disturbances = typeof row.sleep?.disturbances === 'number' ? row.sleep.disturbances : null;
          if (hours === null && quality === null && disturbances === null) {
            return null;
          }
          return { date: row.date, hours, quality, disturbances };
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

  const recentBodyMapSummary = useMemo(() => {
    const regionCounts = new Map<string, number>();
    ((patientRecentCheckinsQuery.data ?? []) as TrendPointRaw[]).forEach((row) => {
      row.bodyMap?.regions?.forEach((region) => {
        if (region.region) {
          regionCounts.set(region.region, (regionCounts.get(region.region) ?? 0) + 1);
        }
      });
    });

    return [...regionCounts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 3)
      .map(([region, count]) => ({
        region,
        label: region.replace(/_/g, ' '),
        count,
      }));
  }, [patientRecentCheckinsQuery.data]);

  const recentHydrationSummary = useMemo(() => {
    const days = patientHydrationQuery.data?.days ?? [];
    if (days.length === 0) {
      return { avgDailyMl: null, daysMeetingTarget: 0 };
    }

    const total = days.reduce((sum, day) => sum + (day.totalMl ?? 0), 0);
    return {
      avgDailyMl: Math.round((total / days.length) * 10) / 10,
      daysMeetingTarget: days.filter((day) => (day.totalMl ?? 0) >= 2000).length,
    };
  }, [patientHydrationQuery.data?.days]);

  const recentNutritionSummary = useMemo(() => {
    const days = (patientNutritionQuery.data?.days ?? []).filter((day) => day.entry !== null);
    if (days.length === 0) {
      return { trackedDays: 0, avgFruitVeg: null, proteinOkHighDays: 0 };
    }

    const fruitVegTotal = days.reduce((sum, day) => sum + (day.entry?.fruitVegServings ?? 0), 0);
    return {
      trackedDays: days.length,
      avgFruitVeg: Math.round((fruitVegTotal / days.length) * 10) / 10,
      proteinOkHighDays: days.filter((day) => {
        const protein = day.entry?.protein;
        return protein === 'ok' || protein === 'high';
      }).length,
    };
  }, [patientNutritionQuery.data?.days]);

  const recentWearablesSummary = useMemo(
    () => ({
      trackedDays: null,
      avgSteps: null,
      avgActiveMinutes: null,
      avgRestingHr: null,
      source: null,
    }),
    [],
  );

  const recentMedicationSummary = useMemo(() => {
    const days = patientMedicationAdherenceQuery.data?.days ?? [];
    if (days.length === 0) {
      return { scheduled: 0, taken: 0, skipped: 0, adherencePct: null };
    }

    const scheduled = days.reduce((sum, day) => sum + day.totalScheduled, 0);
    const taken = days.reduce((sum, day) => sum + day.taken, 0);
    const skipped = days.reduce((sum, day) => sum + day.skipped, 0);
    return {
      scheduled,
      taken,
      skipped,
      adherencePct: scheduled > 0 ? Math.round((taken / scheduled) * 100) : null,
    };
  }, [patientMedicationAdherenceQuery.data?.days]);

  const recentPhotos = useMemo<SymptomPhotoItem[]>(
    () => (patientPhotosQuery.data?.items ?? []).slice(0, 7),
    [patientPhotosQuery.data?.items],
  );

  const chronologyItems = useMemo(
    () =>
      buildHistoryChronologyItems({
        alerts: patientAlerts,
        communicationItems: patientCommunicationItems,
        tasks: patientTasks,
        sessions: patientSessions,
        coordination: coordinationRecord,
        safetyEvents,
        trends: normalizedTrends,
      }),
    [
      coordinationRecord,
      normalizedTrends,
      patientAlerts,
      patientCommunicationItems,
      patientSessions,
      patientTasks,
      safetyEvents,
    ],
  );

  const selectedDayPoint = useMemo(
    () => normalizedTrends.find((point) => point.date === selectedHistoryDate) ?? null,
    [normalizedTrends, selectedHistoryDate],
  );
  const selectedDayAlerts = useMemo(
    () => (selectedDayPoint ? alertsForDate(patientAlerts, selectedDayPoint.date) : []),
    [patientAlerts, selectedDayPoint],
  );

  const [expandedTrendMetric, setExpandedTrendMetric] = useState<'pain' | 'mood' | 'adherence' | null>(null);
  useEffect(() => {
    setExpandedTrendMetric(null);
  }, [selectedDays]);

  const showTrendsLoading = trendsQuery.isLoading && trendData.length === 0;

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

  const selectedQuickReplyTemplate = useMemo(
    () =>
      communicationAuthoring.templates.find((template) => template.id === selectedQuickReplyTemplateId) ?? null,
    [communicationAuthoring.templates, selectedQuickReplyTemplateId],
  );

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

  const openPatientWorkspaceTab = useCallback(
    (tabId: PatientWorkspaceTabId): void => {
      if (!patientId) {
        return;
      }

      navigate(
        {
          pathname: buildPatientWorkspacePath(patientId, tabId),
          search: location.search,
        },
        { replace: false },
      );
    },
    [location.search, navigate, patientId],
  );

  const onOpenCommunicationWorkspace = useCallback((): void => {
    if (!patientId) {
      return;
    }

    navigate(`/communication?patientId=${encodeURIComponent(patientId)}`);
  }, [navigate, patientId]);

  const onOpenAlertsWorkspace = useCallback((): void => {
    if (!patientId) {
      return;
    }

    navigate(`/alerts?patientId=${encodeURIComponent(patientId)}&source=chat`);
  }, [navigate, patientId]);

  const onOpenAppointmentsWorkspace = useCallback((): void => {
    navigate('/appointments');
  }, [navigate]);

  const onOpenPlanWorkspace = useCallback((): void => {
    if (!patientId) {
      return;
    }

    navigate(`/patients/${encodeURIComponent(patientId)}/plan`);
  }, [navigate, patientId]);

  const onOpenWorklist = useCallback((): void => {
    navigate('/worklist');
  }, [navigate]);

  const onDecisionAction = useCallback(
    (actionId: PatientWorkspaceActionId): void => {
      if (actionId === 'alerts') {
        onOpenAlertsWorkspace();
        return;
      }

      if (actionId === 'communication') {
        onOpenCommunicationWorkspace();
        return;
      }

      if (actionId === 'appointments') {
        onOpenAppointmentsWorkspace();
        return;
      }

      if (actionId === 'worklist') {
        onOpenWorklist();
        return;
      }

      if (actionId === 'plan') {
        onOpenPlanWorkspace();
        return;
      }

      if (actionId === 'tasks') {
        openPatientWorkspaceTab('communications');
        return;
      }

      openPatientWorkspaceTab('history');
    },
    [
      onOpenAlertsWorkspace,
      onOpenAppointmentsWorkspace,
      onOpenCommunicationWorkspace,
      onOpenPlanWorkspace,
      onOpenWorklist,
      openPatientWorkspaceTab,
    ],
  );

  const handleCompleteTask = useCallback(
    (taskId: string): void => {
      setCompletingTaskId(taskId);
      completeTaskMutation.mutate(taskId, {
        onSettled: () => {
          setCompletingTaskId((current) => (current === taskId ? null : current));
        },
      });
    },
    [completeTaskMutation],
  );

  const handleAlertStatusUpdate = useCallback(
    (nextStatus: 'acknowledged' | 'resolved', alert: AlertItem): void => {
      updateAlertMutation.mutate(
        { id: alert._id, status: nextStatus },
        {
          onSuccess: async () => {
            await patientAlertsQuery.refetch();
          },
        },
      );
    },
    [patientAlertsQuery, updateAlertMutation],
  );

  const handleRehabSave = useCallback(async (): Promise<void> => {
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
  }, [patientId, patientRehabQuery, selectedRehabKey]);

  const handleAssignProm = useCallback(async (): Promise<void> => {
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
  }, [patientId, patientPromsQuery, promDueAt, promTemplateKey]);

  const handleGenerateInsights = useCallback(async (): Promise<void> => {
    if (!patientId) {
      return;
    }

    setInsightActionError(null);
    setInsightActionNotice(null);
    setIsGeneratingInsights(true);
    try {
      const result = await generatePatientInsights(patientId, selectedDays);
      setInsightActionNotice(
        `Generated ${result.created} pending insight${result.created === 1 ? '' : 's'} (${result.skipped} duplicate${result.skipped === 1 ? '' : 's'} skipped).`,
      );
      await patientInsightsQuery.refetch();
    } catch (error) {
      setInsightActionError(toUserMessage(asAppError(error)));
    } finally {
      setIsGeneratingInsights(false);
    }
  }, [patientId, patientInsightsQuery, selectedDays]);

  const handleReviewPatientInsight = useCallback(
    async (insightId: string, status: 'approved' | 'rejected'): Promise<void> => {
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
    },
    [patientInsightsQuery],
  );

  const handleSaveRecoverySupport = useCallback(async (): Promise<void> => {
    setRecoverySupportNotice(null);
    setRecoverySupportError(null);
    await saveRecoverySupportMutation.mutateAsync();
  }, [saveRecoverySupportMutation]);

  const setSelectedDays = useCallback(
    (days: 14 | 30) => {
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.set('days', String(days));
        return next;
      });
    },
    [setSearchParams],
  );

  const openSupportView = useCallback(
    (view: PatientWorkspaceSupportView) => {
      setActiveSupportView(view);
      setSupportDrawerOpen(true);
    },
    [setActiveSupportView, setSupportDrawerOpen],
  );

  const refreshOverview = useCallback((): void => {
    void Promise.allSettled([
      patientsQuery.refetch(),
      trendsQuery.refetch(),
      patientAlertsQuery.refetch(),
      patientWorklistQuery.refetch(),
      patientAppointmentsQuery.refetch(),
      patientTasksQuery.refetch(),
      patientCommunicationQuery.refetch(),
      patientPromsQuery.refetch(),
      patientInsightsQuery.refetch(),
      patientRehabQuery.refetch(),
      patientSessionsQuery.refetch(),
      patientThresholdsQuery.refetch(),
      patientRecoverySupportQuery.refetch(),
      patientCaregiverAccessQuery.refetch(),
      patientSafetyEventsQuery.refetch(),
    ]);
  }, [
    patientAlertsQuery,
    patientAppointmentsQuery,
    patientCaregiverAccessQuery,
    patientCommunicationQuery,
    patientInsightsQuery,
    patientPromsQuery,
    patientRecoverySupportQuery,
    patientRehabQuery,
    patientSafetyEventsQuery,
    patientSessionsQuery,
    patientTasksQuery,
    patientThresholdsQuery,
    patientWorklistQuery,
    patientsQuery,
    trendsQuery,
  ]);

  const refreshCommunications = useCallback((): void => {
    void Promise.allSettled([
      patientCommunicationQuery.refetch(),
      patientTasksQuery.refetch(),
      patientAppointmentsQuery.refetch(),
      patientCoordinationQuery.refetch(),
    ]);
  }, [
    patientAppointmentsQuery,
    patientCommunicationQuery,
    patientCoordinationQuery,
    patientTasksQuery,
  ]);

  const refreshGuidance = useCallback((): void => {
    void Promise.allSettled([
      patientRehabQuery.refetch(),
      patientPromsQuery.refetch(),
      patientInsightsQuery.refetch(),
      patientPlanQuery.refetch(),
      patientRecoverySupportQuery.refetch(),
      patientCaregiverAccessQuery.refetch(),
      patientThresholdsQuery.refetch(),
    ]);
  }, [
    patientCaregiverAccessQuery,
    patientInsightsQuery,
    patientPlanQuery,
    patientPromsQuery,
    patientRecoverySupportQuery,
    patientRehabQuery,
    patientThresholdsQuery,
  ]);

  const refreshHistory = useCallback((): void => {
    void Promise.allSettled([
      trendsQuery.refetch(),
      patientSessionsQuery.refetch(),
      patientRecentCheckinsQuery.refetch(),
      patientHydrationQuery.refetch(),
      patientNutritionQuery.refetch(),
      patientMedicationAdherenceQuery.refetch(),
      patientPhotosQuery.refetch(),
    ]);
  }, [
    patientHydrationQuery,
    patientMedicationAdherenceQuery,
    patientNutritionQuery,
    patientPhotosQuery,
    patientRecentCheckinsQuery,
    patientSessionsQuery,
    trendsQuery,
  ]);

  const headerNotices = useMemo(
    () => [
      patientContext === null && !patientsQuery.isLoading
        ? {
            key: 'patient-missing',
            tone: 'warning' as const,
            title: 'Patient summary is limited',
            body: 'Basic patient identity loaded from the route, but the roster summary is not available yet.',
          }
        : null,
      patientCoordinationQuery.isError
        ? {
            key: 'coordination-error',
            tone: 'critical' as const,
            title: 'Shared coordination is temporarily unavailable',
            body: 'The main review lane remains available while shared coordination reloads.',
          }
        : null,
      shouldLoadDischargeSummary && patientDischargeSummaryQuery.error
        ? {
            key: 'discharge-summary-error',
            tone: 'warning' as const,
            title: 'Discharge summary is unavailable',
            body: 'Patient identity and shared coordination remain available while the discharge summary reloads.',
          }
        : null,
    ].filter((item): item is NonNullable<typeof item> => Boolean(item)),
    [
      patientContext,
      patientCoordinationQuery.isError,
      patientDischargeSummaryQuery.error,
      patientsQuery.isLoading,
      shouldLoadDischargeSummary,
    ],
  );

  return {
    patientId,
    activeTab,
    selectedDays,
    header,
    decisionStrip,
    overview,
    communications,
    guidance,
    history,
    governance,
    patientDisplayName,
    headerNotices,
    activeSupportView,
    supportDrawerOpen,
    setSupportDrawerOpen,
    setActiveSupportView,
    setSelectedDays,
    openSupportView,
    openPatientWorkspaceTab,
    onDecisionAction,
    onOpenCommunicationWorkspace,
    onOpenAppointmentsWorkspace,
    onOpenAlertsWorkspace,
    onOpenPlanWorkspace,
    onOpenWorklist,
    alerts: patientAlerts,
    seenAlertMap,
    alertMutationPending: updateAlertMutation.isPending,
    handleAlertStatusUpdate,
    alertsFreshnessLabel: formatLoadedAgo(patientAlertsQuery.dataUpdatedAt),
    patientPriorities,
    recommendedActions,
    patientPrioritiesError,
    recommendedActionsError,
    refreshOverview,
    refreshCommunications,
    refreshGuidance,
    refreshHistory,
    communicationItems: patientCommunicationItems,
    communicationTimeline,
    canQuickReplyFromPatientDetail,
    patientCommunicationBlockedBySafety,
    patientQuickReply,
    setPatientQuickReply,
    selectedQuickReplyTemplateId,
    setSelectedQuickReplyTemplateId,
    communicationAuthoring,
    handlePatientQuickReply,
    handleInsertPatientQuickReplyTemplate,
    handleInsertPatientQuickReplySignature,
    patientTasks,
    patientActiveTasks,
    patientRecentCompletedTasks,
    completingTaskId,
    handleCompleteTask,
    tasksFreshnessLabel: formatLoadedAgo(patientTasksQuery.dataUpdatedAt),
    patientAppointments,
    appointmentsFreshnessLabel: formatLoadedAgo(patientAppointmentsQuery.dataUpdatedAt),
    rehab: patientRehab,
    selectedRehabKey,
    setSelectedRehabKey,
    handleRehabSave,
    rehabSaveError,
    isSavingRehab,
    promDue,
    completedProms,
    promTemplateKey,
    setPromTemplateKey,
    promDueAt,
    setPromDueAt,
    handleAssignProm,
    promSaveError,
    isAssigningProm,
    pendingInsights,
    approvedInsights,
    handleGenerateInsights,
    handleReviewPatientInsight: handleReviewPatientInsight,
    isGeneratingInsights,
    insightReviewingId,
    insightActionError,
    insightActionNotice,
    patientPlan,
    patientRecoverySupport,
    recoverySupportDraft,
    setRecoverySupportCheckinMode: (value) =>
      setRecoverySupportDraft((current) => ({ ...current, checkinMode: value })),
    setRecoverySupportNudgesEnabled: (value) =>
      setRecoverySupportDraft((current) => ({ ...current, nudgesEnabled: value })),
    setRecoverySupportRationale: (value) =>
      setRecoverySupportDraft((current) => ({ ...current, rationale: value })),
    setRecoverySupportTemporaryFullFlowOption: (value) =>
      setRecoverySupportDraft((current) => ({ ...current, temporaryForceFullOption: value })),
    handleSaveRecoverySupport,
    recoverySupportError,
    recoverySupportNotice,
    isSavingRecoverySupport: saveRecoverySupportMutation.isPending,
    currentAdaptationDecision,
    adaptationHistory,
    activeCaregiverAccessItems,
    thresholds,
    coordinationRecord,
    safetyEvents,
    selectedDayPoint,
    selectedDayAlerts,
    chronologyItems,
    normalizedTrends,
    trendSummary,
    showTrendsLoading,
    expandedTrendMetric,
    setExpandedTrendMetric,
    setSelectedDayKey: setSelectedHistoryDate,
    recentSleepRows,
    recentBodyMapSummary,
    recentHydrationSummary,
    recentNutritionSummary,
    recentWearablesSummary,
    recentMedicationSummary,
    recentPhotos,
  };
}
