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
  fetchPhotoBlob,
  generatePatientInsights,
  getPatientMedicationAdherence,
  getPatientPhotos,
  getPatientInsights,
  getPatientExerciseSessions,
  getPatientHydrationRange,
  getPatientNutritionRange,
  getPatientProms,
  getRehabPhases,
  getPatientTrendsEndpointHint,
  isPatientTrendsEndpointMissing,
  listAlerts,
  reviewInsight,
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
  InsightItem,
  AlertStatus,
  PatientSummary,
  PromDueCard,
  PromHistoryRow,
  RehabPayload,
  SymptomPhotoItem,
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
import { bodyMapRegionLabel } from '../utils/bodyMap';

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
  const [isGeneratingInsights, setIsGeneratingInsights] = useState(false);
  const [insightReviewingId, setInsightReviewingId] = useState<string | null>(null);
  const [insightActionError, setInsightActionError] = useState<string | null>(null);
  const [insightActionNotice, setInsightActionNotice] = useState<string | null>(null);
  const [openingPhotoId, setOpeningPhotoId] = useState<string | null>(null);
  const [photoOpenError, setPhotoOpenError] = useState<string | null>(null);
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

  const openAlertCount = useMemo(
    () => patientAlerts.filter((alert) => alert.status === 'open').length,
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

      {patientInsightsQuery.error ? (
        <AlertBanner variant="error" title="Could not load insights">
          {toUserMessage(patientInsightsQuery.error)}
        </AlertBanner>
      ) : null}

      {patientRecentCheckinsQuery.error ? (
        <AlertBanner variant="error" title="Could not load recent sleep">
          {toUserMessage(patientRecentCheckinsQuery.error)}
        </AlertBanner>
      ) : null}

      {patientHydrationQuery.error ? (
        <AlertBanner variant="error" title="Could not load hydration">
          {toUserMessage(patientHydrationQuery.error)}
        </AlertBanner>
      ) : null}

      {patientNutritionQuery.error ? (
        <AlertBanner variant="error" title="Could not load nutrition">
          {toUserMessage(patientNutritionQuery.error)}
        </AlertBanner>
      ) : null}

      {patientMedicationAdherenceQuery.error ? (
        <AlertBanner variant="error" title="Could not load medication adherence">
          {toUserMessage(patientMedicationAdherenceQuery.error)}
        </AlertBanner>
      ) : null}

      {patientPhotosQuery.error ? (
        <AlertBanner variant="error" title="Could not load symptom photos">
          {toUserMessage(patientPhotosQuery.error)}
        </AlertBanner>
      ) : null}

      {photoOpenError ? (
        <AlertBanner variant="error" title="Could not open symptom photo">
          {photoOpenError}
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

      {insightActionError ? (
        <AlertBanner variant="error" title="Could not update insights">
          {insightActionError}
        </AlertBanner>
      ) : null}

      {insightActionNotice ? (
        <AlertBanner variant="success" title="Insights updated">
          {insightActionNotice}
        </AlertBanner>
      ) : null}

      <PatientSummaryCards metrics={trendSummary} openAlertCount={openAlertCount} />

      <Card
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
                <div
                  key={photo.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '0.75rem',
                  }}
                >
                  <p className="muted-text" style={{ margin: 0 }}>
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

      <Card
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
                    <div
                      key={insight.id}
                      style={{
                        border: '1px solid var(--color-border-muted)',
                        borderRadius: '0.75rem',
                        padding: '0.75rem',
                        display: 'grid',
                        gap: '0.4rem',
                      }}
                    >
                      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                        <Badge variant="default">{insightCategoryLabel(insight.category)}</Badge>
                        <Badge variant={insightConfidenceVariant(insight.confidence)}>
                          {insight.confidence}
                        </Badge>
                        <Badge variant="default">P{insight.priority}</Badge>
                      </div>
                      <strong>{insight.title}</strong>
                      <p className="muted-text" style={{ margin: 0 }}>
                        {insight.message}
                      </p>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
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
                    <div
                      key={insight.id}
                      style={{
                        border: '1px solid var(--color-border-muted)',
                        borderRadius: '0.75rem',
                        padding: '0.75rem',
                        display: 'grid',
                        gap: '0.35rem',
                      }}
                    >
                      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                        <Badge variant="default">{insightCategoryLabel(insight.category)}</Badge>
                        <Badge variant={insightConfidenceVariant(insight.confidence)}>
                          {insight.confidence}
                        </Badge>
                        <Badge variant="default">P{insight.priority}</Badge>
                      </div>
                      <strong>{insight.title}</strong>
                      <p className="muted-text" style={{ margin: 0 }}>
                        {insight.message}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Card>

      <Card title="Weekly report">
        <div className="stack stack--2">
          <p className="muted-text">
            View a deterministic weekly summary with check-ins, exercise sessions, PROMs, safety highlights, and next steps.
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
