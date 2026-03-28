import {
  getClinicianProfile,
  subscribeClinicianProfile,
  type ClinicianAvailabilityStatus,
  type ClinicianDefaultCommunicationFilter,
  type ClinicianDefaultLandingRoute,
  type ClinicianDefaultPatientsPreset,
  type ClinicianProfile,
  type ClinicianWorkingDayToken,
  type ClinicianWorkspacePreferences,
} from './clinicianProfile';
import { PATIENT_TRIAGE_PRESETS, type PatientTriagePresetId } from '../utils/patientFilters';
import {
  COMMUNICATION_THREAD_VIEW_OPTIONS,
  type CommunicationThreadView,
} from './communicationWorkspace';

export interface ClinicianWorkspacePreferencesSnapshot extends ClinicianWorkspacePreferences {
  availabilityLabel: string;
  availabilityTone: 'positive' | 'attention' | 'muted';
  resolvedTimezone: string;
  workingHoursSummary: string;
  defaultLandingLabel: string;
  defaultPatientsPresetLabel: string;
  defaultCommunicationFilterLabel: string;
}

export const WORKING_DAY_OPTIONS: Array<{
  id: ClinicianWorkingDayToken;
  label: string;
  shortLabel: string;
}> = [
  { id: 'mon', label: 'Monday', shortLabel: 'Mon' },
  { id: 'tue', label: 'Tuesday', shortLabel: 'Tue' },
  { id: 'wed', label: 'Wednesday', shortLabel: 'Wed' },
  { id: 'thu', label: 'Thursday', shortLabel: 'Thu' },
  { id: 'fri', label: 'Friday', shortLabel: 'Fri' },
  { id: 'sat', label: 'Saturday', shortLabel: 'Sat' },
  { id: 'sun', label: 'Sunday', shortLabel: 'Sun' },
];

export const AVAILABILITY_STATUS_OPTIONS: Array<{
  id: ClinicianAvailabilityStatus;
  label: string;
  tone: ClinicianWorkspacePreferencesSnapshot['availabilityTone'];
}> = [
  { id: 'available', label: 'Available', tone: 'positive' },
  { id: 'in-review', label: 'In review', tone: 'attention' },
  { id: 'off-shift', label: 'Off shift', tone: 'muted' },
  { id: 'follow-up-block', label: 'Follow-up block', tone: 'attention' },
];

export const LANDING_ROUTE_OPTIONS: Array<{
  id: ClinicianDefaultLandingRoute;
  label: string;
}> = [
  { id: '/dashboard', label: 'Today' },
  { id: '/worklist', label: 'Queue' },
  { id: '/alerts', label: 'Safety' },
  { id: '/patients', label: 'Patients' },
  { id: '/communication', label: 'Inbox' },
];

const TIME_ZONE_FALLBACK = 'UTC';
const DEFAULT_PATIENTS_PRESET_LABEL = 'No default preset';
const DEFAULT_COMMUNICATION_FILTER_LABEL = 'All';

let cachedSnapshot: ClinicianWorkspacePreferencesSnapshot | null = null;
let cachedSnapshotKey: string | null = null;

function trimToUndefined(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function getBrowserTimeZone(): string {
  if (typeof Intl === 'undefined' || typeof Intl.DateTimeFormat !== 'function') {
    return TIME_ZONE_FALLBACK;
  }

  try {
    return trimToUndefined(Intl.DateTimeFormat().resolvedOptions().timeZone) ?? TIME_ZONE_FALLBACK;
  } catch {
    return TIME_ZONE_FALLBACK;
  }
}

function isValidTimeZone(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  try {
    new Intl.DateTimeFormat([], { timeZone: value }).format(Date.now());
    return true;
  } catch {
    return false;
  }
}

function toTimeSortValue(value: string): number {
  const [hours, minutes] = value.split(':').map((segment) => Number(segment));
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    return 0;
  }

  return hours * 60 + minutes;
}

function formatDayRange(enabledDays: ClinicianWorkingDayToken[]): string {
  const selected = WORKING_DAY_OPTIONS.filter((option) => enabledDays.includes(option.id));
  if (selected.length === 0) {
    return 'No days selected';
  }

  const ids = selected.map((option) => option.id);
  const isWeekdays =
    ids.length === 5 && ids.every((id, index) => id === WORKING_DAY_OPTIONS[index]?.id);
  if (isWeekdays) {
    return 'Mon-Fri';
  }

  const isAllWeek = ids.length === WORKING_DAY_OPTIONS.length;
  if (isAllWeek) {
    return 'Every day';
  }

  return selected.map((option) => option.shortLabel).join(', ');
}

function formatTimeLabel(value: string): string {
  const [rawHours, rawMinutes] = value.split(':');
  const hours = Number(rawHours);
  const minutes = Number(rawMinutes);

  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    return value;
  }

  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${String(minutes).padStart(2, '0')} ${period}`;
}

export function formatWorkingHoursSummary(
  workingHours: ClinicianWorkspacePreferences['workingHours'],
): string {
  const dayRange = formatDayRange(workingHours.enabledDays);

  if (toTimeSortValue(workingHours.endTime) <= toTimeSortValue(workingHours.startTime)) {
    return `${dayRange} · ${formatTimeLabel(workingHours.startTime)}-${formatTimeLabel(workingHours.endTime)}`;
  }

  return `${dayRange} · ${formatTimeLabel(workingHours.startTime)}-${formatTimeLabel(workingHours.endTime)}`;
}

export function getAvailabilityStatusLabel(
  availabilityStatus: ClinicianAvailabilityStatus,
): string {
  return (
    AVAILABILITY_STATUS_OPTIONS.find((option) => option.id === availabilityStatus)?.label ??
    'Available'
  );
}

export function getAvailabilityTone(
  availabilityStatus: ClinicianAvailabilityStatus,
): ClinicianWorkspacePreferencesSnapshot['availabilityTone'] {
  return (
    AVAILABILITY_STATUS_OPTIONS.find((option) => option.id === availabilityStatus)?.tone ??
    'positive'
  );
}

export function getDefaultLandingRoute(
  route: string | undefined,
): ClinicianDefaultLandingRoute {
  return (
    LANDING_ROUTE_OPTIONS.find((option) => option.id === route)?.id ?? '/dashboard'
  );
}

export function getDefaultLandingRouteLabel(route: ClinicianDefaultLandingRoute): string {
  return LANDING_ROUTE_OPTIONS.find((option) => option.id === route)?.label ?? 'Today';
}

export function getDefaultPatientsPresetLabel(
  presetId: ClinicianDefaultPatientsPreset,
): string {
  if (!presetId) {
    return DEFAULT_PATIENTS_PRESET_LABEL;
  }

  return PATIENT_TRIAGE_PRESETS.find((preset) => preset.id === presetId)?.label ?? DEFAULT_PATIENTS_PRESET_LABEL;
}

export function getDefaultCommunicationFilterLabel(
  filter: ClinicianDefaultCommunicationFilter,
): string {
  return (
    COMMUNICATION_THREAD_VIEW_OPTIONS.find((option) => option.id === filter)?.label ??
    DEFAULT_COMMUNICATION_FILTER_LABEL
  );
}

export function getResolvedWorkspaceTimeZone(value: string | undefined): string {
  if (isValidTimeZone(value)) {
    return value as string;
  }

  const browserTimeZone = getBrowserTimeZone();
  return isValidTimeZone(browserTimeZone) ? browserTimeZone : TIME_ZONE_FALLBACK;
}

function buildSnapshot(profile: ClinicianProfile): ClinicianWorkspacePreferencesSnapshot {
  const preferences = profile.workspacePreferences;
  return {
    ...preferences,
    resolvedTimezone: getResolvedWorkspaceTimeZone(preferences.timezone),
    availabilityLabel: getAvailabilityStatusLabel(preferences.availabilityStatus),
    availabilityTone: getAvailabilityTone(preferences.availabilityStatus),
    workingHoursSummary: formatWorkingHoursSummary(preferences.workingHours),
    defaultLandingLabel: getDefaultLandingRouteLabel(
      getDefaultLandingRoute(preferences.defaultLandingRoute),
    ),
    defaultPatientsPresetLabel: getDefaultPatientsPresetLabel(
      preferences.defaultPatientsPreset as ClinicianDefaultPatientsPreset,
    ),
    defaultCommunicationFilterLabel: getDefaultCommunicationFilterLabel(
      preferences.defaultCommunicationFilter,
    ),
  };
}

export function getClinicianWorkspacePreferences(): ClinicianWorkspacePreferencesSnapshot {
  const nextSnapshot = buildSnapshot(getClinicianProfile());
  const snapshotKey = JSON.stringify(nextSnapshot);

  if (cachedSnapshot && cachedSnapshotKey === snapshotKey) {
    return cachedSnapshot;
  }

  cachedSnapshot = nextSnapshot;
  cachedSnapshotKey = snapshotKey;
  return nextSnapshot;
}

export function getPreferredDashboardLandingPath(): ClinicianDefaultLandingRoute {
  return getDefaultLandingRoute(getClinicianWorkspacePreferences().defaultLandingRoute);
}

export function getSavedPatientsPreset(): PatientTriagePresetId | '' {
  const preset = getClinicianWorkspacePreferences().defaultPatientsPreset;
  return PATIENT_TRIAGE_PRESETS.some((entry) => entry.id === preset)
    ? (preset as PatientTriagePresetId)
    : '';
}

export function getSavedCommunicationFilter(): CommunicationThreadView {
  const savedFilter = getClinicianWorkspacePreferences().defaultCommunicationFilter;
  return COMMUNICATION_THREAD_VIEW_OPTIONS.some((option) => option.id === savedFilter)
    ? (savedFilter as CommunicationThreadView)
    : 'all';
}

export function subscribeClinicianWorkspacePreferences(listener: () => void): () => void {
  return subscribeClinicianProfile(() => {
    getClinicianWorkspacePreferences();
    listener();
  });
}

export function getSupportedTimeZoneOptions(): string[] {
  const currentTimeZone = getResolvedWorkspaceTimeZone(undefined);

  if (typeof Intl === 'undefined' || typeof (Intl as typeof Intl & {
    supportedValuesOf?: (key: string) => string[];
  }).supportedValuesOf !== 'function') {
    return [currentTimeZone, TIME_ZONE_FALLBACK];
  }

  try {
    const values = (Intl as typeof Intl & {
      supportedValuesOf: (key: string) => string[];
    }).supportedValuesOf('timeZone');
    return [currentTimeZone, ...values.filter((value) => value !== currentTimeZone)];
  } catch {
    return [currentTimeZone, TIME_ZONE_FALLBACK];
  }
}
