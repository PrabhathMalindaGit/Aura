import { getStoredClinicianToken } from './apiClient';
import {
  CLINICIAN_ID_STORAGE_KEY,
  CLINICIAN_NAME_STORAGE_KEY,
  CLINICIAN_PROFILE_STORAGE_PREFIX,
} from '../utils/storageKeys';

export type ClinicianProfilePhotoMime = 'image/jpeg' | 'image/png' | 'image/webp';

export interface ClinicianProfilePhoto {
  dataUrl: string;
  mimeType: ClinicianProfilePhotoMime;
  fileName: string;
  sizeBytes: number;
}

export type ClinicianAvailabilityStatus =
  | 'available'
  | 'in-review'
  | 'off-shift'
  | 'follow-up-block';

export type ClinicianWorkingDayToken =
  | 'mon'
  | 'tue'
  | 'wed'
  | 'thu'
  | 'fri'
  | 'sat'
  | 'sun';

export type ClinicianDefaultLandingRoute =
  | '/dashboard'
  | '/worklist'
  | '/alerts'
  | '/patients'
  | '/communication';

export type ClinicianDefaultPatientsPreset =
  | ''
  | 'active-alerts'
  | 'missed-checkins'
  | 'recently-active';

export type ClinicianDefaultCommunicationFilter =
  | 'all'
  | 'needs-response'
  | 'response-delayed'
  | 'safety-flagged'
  | 'reviewed';

export interface ClinicianWorkingHours {
  enabledDays: ClinicianWorkingDayToken[];
  startTime: string;
  endTime: string;
}

export interface ClinicianWorkspacePreferences {
  availabilityStatus: ClinicianAvailabilityStatus;
  teamLabel: string;
  timezone: string;
  workingHours: ClinicianWorkingHours;
  defaultLandingRoute: ClinicianDefaultLandingRoute;
  defaultPatientsPreset: ClinicianDefaultPatientsPreset;
  defaultCommunicationFilter: ClinicianDefaultCommunicationFilter;
}

export interface ClinicianCommunicationTemplate {
  id: string;
  title: string;
  body: string;
}

export interface ClinicianCommunicationAuthoring {
  defaultSignature: string;
  autoAppendSignature: boolean;
  templates: ClinicianCommunicationTemplate[];
}

export type ClinicianNotificationCueMode = 'default' | 'reduced';

export interface ClinicianNotificationCuePreference {
  cueMode: ClinicianNotificationCueMode;
}

export interface ClinicianNotificationQuietHours {
  enabled: boolean;
  startTime: string;
  endTime: string;
}

export interface ClinicianNotificationPreferences {
  communication: ClinicianNotificationCuePreference;
  safety: ClinicianNotificationCuePreference;
  quietHours: ClinicianNotificationQuietHours;
}

export interface ClinicianProfile {
  displayName: string;
  clinicianId: string;
  roleTitle: string;
  specialty: string;
  bio: string;
  preferredPronouns?: string;
  contactNote: string;
  photo: ClinicianProfilePhoto | null;
  workspacePreferences: ClinicianWorkspacePreferences;
  communicationAuthoring: ClinicianCommunicationAuthoring;
  notificationPreferences: ClinicianNotificationPreferences;
}

interface StoredClinicianProfileRecord {
  version: 2;
  authScopeId: string;
  updatedAt: string;
  profile: ClinicianProfile;
}

interface AuthClinicianIdentity {
  scopeId: string;
  displayName?: string;
  email?: string;
}

export interface SaveClinicianProfileResult {
  profile: ClinicianProfile;
  saved: boolean;
}

export const CLINICIAN_PROFILE_LIMITS = {
  displayName: 80,
  clinicianId: 48,
  roleTitle: 80,
  specialty: 80,
  bio: 280,
  preferredPronouns: 40,
  contactNote: 240,
  teamLabel: 80,
  timezone: 120,
  fileName: 120,
} as const;

export const CLINICIAN_COMMUNICATION_AUTHORING_LIMITS = {
  signature: 400,
  templateTitle: 80,
  templateBody: 500,
  templates: 8,
  templateId: 120,
} as const;

export const CLINICIAN_PROFILE_PHOTO_MIME_TYPES: ClinicianProfilePhotoMime[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
];

export const MAX_CLINICIAN_PROFILE_PHOTO_BYTES = 500 * 1024;

const DEFAULT_CLINICIAN_ID = 'clinician-1';
const DEFAULT_DISPLAY_NAME = 'Clinician 1';
const DEFAULT_ROLE_TITLE = 'Rehab clinician';
const DEFAULT_SPECIALTY = 'Recovery follow-up';
const DEFAULT_AVAILABILITY_STATUS: ClinicianAvailabilityStatus = 'available';
const DEFAULT_WORKING_DAYS: ClinicianWorkingDayToken[] = ['mon', 'tue', 'wed', 'thu', 'fri'];
const DEFAULT_WORKING_START = '09:00';
const DEFAULT_WORKING_END = '17:00';
const DEFAULT_LANDING_ROUTE: ClinicianDefaultLandingRoute = '/dashboard';
const DEFAULT_PATIENTS_PRESET: ClinicianDefaultPatientsPreset = '';
const DEFAULT_COMMUNICATION_FILTER: ClinicianDefaultCommunicationFilter = 'all';
const DEFAULT_NOTIFICATION_CUE_MODE: ClinicianNotificationCueMode = 'default';
const DEFAULT_QUIET_HOURS_START = '22:00';
const DEFAULT_QUIET_HOURS_END = '07:00';
const PROFILE_CHANGE_EVENT = 'aura:clinician-profile-change';
const CLINICIAN_EMAIL_SCOPE_PREFIX = 'email:';
const TOKEN_STORAGE_KEYS = ['aura_access_token', 'aura_auth_token', 'clinicianToken'];
const VALID_AVAILABILITY_STATUSES = new Set<ClinicianAvailabilityStatus>([
  'available',
  'in-review',
  'off-shift',
  'follow-up-block',
]);
const VALID_WORKING_DAYS = new Set<ClinicianWorkingDayToken>([
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
  'sun',
]);
const VALID_LANDING_ROUTES = new Set<ClinicianDefaultLandingRoute>([
  '/dashboard',
  '/worklist',
  '/alerts',
  '/patients',
  '/communication',
]);
const VALID_PATIENTS_PRESETS = new Set<ClinicianDefaultPatientsPreset>([
  '',
  'active-alerts',
  'missed-checkins',
  'recently-active',
]);
const VALID_COMMUNICATION_FILTERS = new Set<ClinicianDefaultCommunicationFilter>([
  'all',
  'needs-response',
  'response-delayed',
  'safety-flagged',
  'reviewed',
]);
const VALID_NOTIFICATION_CUE_MODES = new Set<ClinicianNotificationCueMode>([
  'default',
  'reduced',
]);

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function trimToUndefined(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeSingleLine(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function normalizeTextarea(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .trim()
    .replace(/\n{3,}/g, '\n\n')
    .slice(0, maxLength);
}

function normalizeOptionalSingleLine(value: unknown, maxLength: number): string | undefined {
  const normalized = normalizeSingleLine(value, maxLength);
  return normalized || undefined;
}

function normalizeTimeValue(value: unknown, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback;
  }

  const trimmed = value.trim();
  if (!/^\d{2}:\d{2}$/.test(trimmed)) {
    return fallback;
  }

  const [hours, minutes] = trimmed.split(':').map((segment) => Number(segment));
  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return fallback;
  }

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function normalizeWorkingDays(
  value: unknown,
  fallback: ClinicianWorkingDayToken[],
): ClinicianWorkingDayToken[] {
  if (!Array.isArray(value)) {
    return [...fallback];
  }

  const normalized = value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry): entry is ClinicianWorkingDayToken => VALID_WORKING_DAYS.has(entry as ClinicianWorkingDayToken));

  if (normalized.length === 0) {
    return [...fallback];
  }

  return [...new Set(normalized)];
}

function normalizePositiveInteger(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  const next = Math.trunc(value);
  return next > 0 ? next : null;
}

function getBrowserTimeZone(): string {
  if (typeof Intl === 'undefined' || typeof Intl.DateTimeFormat !== 'function') {
    return 'UTC';
  }

  try {
    return trimToUndefined(Intl.DateTimeFormat().resolvedOptions().timeZone) ?? 'UTC';
  } catch {
    return 'UTC';
  }
}

function createDefaultWorkspacePreferences(): ClinicianWorkspacePreferences {
  return {
    availabilityStatus: DEFAULT_AVAILABILITY_STATUS,
    teamLabel: '',
    timezone: getBrowserTimeZone(),
    workingHours: {
      enabledDays: [...DEFAULT_WORKING_DAYS],
      startTime: DEFAULT_WORKING_START,
      endTime: DEFAULT_WORKING_END,
    },
    defaultLandingRoute: DEFAULT_LANDING_ROUTE,
    defaultPatientsPreset: DEFAULT_PATIENTS_PRESET,
    defaultCommunicationFilter: DEFAULT_COMMUNICATION_FILTER,
  };
}

function createDefaultCommunicationAuthoring(): ClinicianCommunicationAuthoring {
  return {
    defaultSignature: '',
    autoAppendSignature: false,
    templates: [],
  };
}

function createDefaultNotificationPreferences(): ClinicianNotificationPreferences {
  return {
    communication: {
      cueMode: DEFAULT_NOTIFICATION_CUE_MODE,
    },
    safety: {
      cueMode: DEFAULT_NOTIFICATION_CUE_MODE,
    },
    quietHours: {
      enabled: false,
      startTime: DEFAULT_QUIET_HOURS_START,
      endTime: DEFAULT_QUIET_HOURS_END,
    },
  };
}

function normalizeWorkspacePreferences(
  value: unknown,
  fallback: ClinicianWorkspacePreferences,
): ClinicianWorkspacePreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      ...fallback,
      workingHours: {
        ...fallback.workingHours,
        enabledDays: [...fallback.workingHours.enabledDays],
      },
    };
  }

  const candidate = value as Partial<ClinicianWorkspacePreferences>;
  const workingHoursCandidate =
    candidate.workingHours && typeof candidate.workingHours === 'object' && !Array.isArray(candidate.workingHours)
      ? (candidate.workingHours as Partial<ClinicianWorkingHours>)
      : undefined;
  const availabilityStatus = trimToUndefined(candidate.availabilityStatus);
  const defaultLandingRoute = trimToUndefined(candidate.defaultLandingRoute);
  const defaultPatientsPreset = trimToUndefined(candidate.defaultPatientsPreset);
  const defaultCommunicationFilter = trimToUndefined(candidate.defaultCommunicationFilter);

  return {
    availabilityStatus: VALID_AVAILABILITY_STATUSES.has(availabilityStatus as ClinicianAvailabilityStatus)
      ? (availabilityStatus as ClinicianAvailabilityStatus)
      : fallback.availabilityStatus,
    teamLabel: normalizeSingleLine(candidate.teamLabel, CLINICIAN_PROFILE_LIMITS.teamLabel),
    timezone:
      normalizeSingleLine(candidate.timezone, CLINICIAN_PROFILE_LIMITS.timezone) || fallback.timezone,
    workingHours: {
      enabledDays: normalizeWorkingDays(
        workingHoursCandidate?.enabledDays,
        fallback.workingHours.enabledDays,
      ),
      startTime: normalizeTimeValue(workingHoursCandidate?.startTime, fallback.workingHours.startTime),
      endTime: normalizeTimeValue(workingHoursCandidate?.endTime, fallback.workingHours.endTime),
    },
    defaultLandingRoute: VALID_LANDING_ROUTES.has(defaultLandingRoute as ClinicianDefaultLandingRoute)
      ? (defaultLandingRoute as ClinicianDefaultLandingRoute)
      : fallback.defaultLandingRoute,
    defaultPatientsPreset: VALID_PATIENTS_PRESETS.has(defaultPatientsPreset as ClinicianDefaultPatientsPreset)
      ? (defaultPatientsPreset as ClinicianDefaultPatientsPreset)
      : fallback.defaultPatientsPreset,
    defaultCommunicationFilter: VALID_COMMUNICATION_FILTERS.has(
      defaultCommunicationFilter as ClinicianDefaultCommunicationFilter,
    )
      ? (defaultCommunicationFilter as ClinicianDefaultCommunicationFilter)
      : fallback.defaultCommunicationFilter,
  };
}

function buildCommunicationTemplateId(baseId: string, usedIds: Set<string>, index: number): string {
  const fallbackId = baseId || `communication-template-${index + 1}`;
  let nextId = fallbackId;
  let suffix = 2;

  while (usedIds.has(nextId)) {
    nextId = `${fallbackId}-${suffix}`;
    suffix += 1;
  }

  usedIds.add(nextId);
  return nextId;
}

function normalizeCommunicationAuthoring(
  value: unknown,
  fallback: ClinicianCommunicationAuthoring,
): ClinicianCommunicationAuthoring {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      ...fallback,
      templates: [...fallback.templates],
    };
  }

  const candidate = value as Partial<ClinicianCommunicationAuthoring>;
  const usedIds = new Set<string>();
  const templates = Array.isArray(candidate.templates)
    ? candidate.templates
        .map((entry, index) => {
          if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
            return null;
          }

          const templateCandidate = entry as Partial<ClinicianCommunicationTemplate>;
          const title = normalizeSingleLine(
            templateCandidate.title,
            CLINICIAN_COMMUNICATION_AUTHORING_LIMITS.templateTitle,
          );
          const body = normalizeTextarea(
            templateCandidate.body,
            CLINICIAN_COMMUNICATION_AUTHORING_LIMITS.templateBody,
          );

          if (!title || !body) {
            return null;
          }

          const baseId = normalizeSingleLine(
            templateCandidate.id,
            CLINICIAN_COMMUNICATION_AUTHORING_LIMITS.templateId,
          );

          return {
            id: buildCommunicationTemplateId(baseId, usedIds, index),
            title,
            body,
          } satisfies ClinicianCommunicationTemplate;
        })
        .filter((entry): entry is ClinicianCommunicationTemplate => Boolean(entry))
        .slice(0, CLINICIAN_COMMUNICATION_AUTHORING_LIMITS.templates)
    : [...fallback.templates];

  return {
    defaultSignature: normalizeTextarea(
      candidate.defaultSignature,
      CLINICIAN_COMMUNICATION_AUTHORING_LIMITS.signature,
    ),
    autoAppendSignature:
      typeof candidate.autoAppendSignature === 'boolean'
        ? candidate.autoAppendSignature
        : fallback.autoAppendSignature,
    templates,
  };
}

function normalizeNotificationCuePreference(
  value: unknown,
  fallback: ClinicianNotificationCuePreference,
): ClinicianNotificationCuePreference {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...fallback };
  }

  const candidate = value as Partial<ClinicianNotificationCuePreference>;
  const cueMode = trimToUndefined(candidate.cueMode);

  return {
    cueMode: VALID_NOTIFICATION_CUE_MODES.has(cueMode as ClinicianNotificationCueMode)
      ? (cueMode as ClinicianNotificationCueMode)
      : fallback.cueMode,
  };
}

function normalizeNotificationQuietHours(
  value: unknown,
  fallback: ClinicianNotificationQuietHours,
): ClinicianNotificationQuietHours {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...fallback };
  }

  const candidate = value as Partial<ClinicianNotificationQuietHours>;

  return {
    enabled: typeof candidate.enabled === 'boolean' ? candidate.enabled : fallback.enabled,
    startTime: normalizeTimeValue(candidate.startTime, fallback.startTime),
    endTime: normalizeTimeValue(candidate.endTime, fallback.endTime),
  };
}

function normalizeNotificationPreferences(
  value: unknown,
  fallback: ClinicianNotificationPreferences,
): ClinicianNotificationPreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      communication: { ...fallback.communication },
      safety: { ...fallback.safety },
      quietHours: { ...fallback.quietHours },
    };
  }

  const candidate = value as Partial<ClinicianNotificationPreferences>;

  return {
    communication: normalizeNotificationCuePreference(
      candidate.communication,
      fallback.communication,
    ),
    safety: normalizeNotificationCuePreference(candidate.safety, fallback.safety),
    quietHours: normalizeNotificationQuietHours(candidate.quietHours, fallback.quietHours),
  };
}

function readStorageValue(key: string): string | undefined {
  if (!isBrowser()) {
    return undefined;
  }

  try {
    return trimToUndefined(window.localStorage.getItem(key));
  } catch {
    return undefined;
  }
}

function writeStorageValue(key: string, value: string | undefined): void {
  if (!isBrowser()) {
    return;
  }

  try {
    if (value) {
      window.localStorage.setItem(key, value);
      return;
    }

    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage errors for compatibility keys.
  }
}

function decodeTokenSection(section: string): unknown {
  try {
    const base64 = section.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    return JSON.parse(atob(padded));
  } catch {
    return undefined;
  }
}

function normalizeEmailScopeValue(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  return normalized || undefined;
}

function getAuthenticatedClinicianIdentity(): AuthClinicianIdentity | null {
  const token = getStoredClinicianToken();
  if (!token) {
    return null;
  }

  const sections = token.split('.');
  if (sections.length < 2) {
    return null;
  }

  const payload = decodeTokenSection(sections[1]) as
    | { sub?: unknown; name?: unknown; email?: unknown }
    | undefined;
  const scopeId = trimToUndefined(payload?.sub);
  if (!scopeId) {
    return null;
  }

  return {
    scopeId,
    displayName: trimToUndefined(payload?.name),
    email: normalizeEmailScopeValue(payload?.email),
  };
}

function getPrimaryClinicianProfileScopeId(identity: AuthClinicianIdentity): string {
  return identity.email
    ? `${CLINICIAN_EMAIL_SCOPE_PREFIX}${identity.email}`
    : identity.scopeId;
}

function getLegacyClinicianProfileScopeIds(identity: AuthClinicianIdentity): string[] {
  const primaryScopeId = getPrimaryClinicianProfileScopeId(identity);
  return identity.scopeId !== primaryScopeId ? [identity.scopeId] : [];
}

function readLegacyClinicianIdentity(): { clinicianId?: string; displayName?: string } {
  return {
    clinicianId: readStorageValue(CLINICIAN_ID_STORAGE_KEY),
    displayName: readStorageValue(CLINICIAN_NAME_STORAGE_KEY),
  };
}

function createDefaultProfile(
  identity: AuthClinicianIdentity | null,
  options: { includeLegacyFallback?: boolean } = {},
): ClinicianProfile {
  const legacy = options.includeLegacyFallback === false ? {} : readLegacyClinicianIdentity();

  return {
    displayName:
      normalizeSingleLine(
        identity?.displayName ?? legacy.displayName ?? DEFAULT_DISPLAY_NAME,
        CLINICIAN_PROFILE_LIMITS.displayName,
      ) || DEFAULT_DISPLAY_NAME,
    clinicianId:
      normalizeSingleLine(
        identity?.scopeId ?? legacy.clinicianId ?? DEFAULT_CLINICIAN_ID,
        CLINICIAN_PROFILE_LIMITS.clinicianId,
      ) || DEFAULT_CLINICIAN_ID,
    roleTitle: DEFAULT_ROLE_TITLE,
    specialty: DEFAULT_SPECIALTY,
    bio: '',
    preferredPronouns: undefined,
    contactNote: '',
    photo: null,
    workspacePreferences: createDefaultWorkspacePreferences(),
    communicationAuthoring: createDefaultCommunicationAuthoring(),
    notificationPreferences: createDefaultNotificationPreferences(),
  };
}

function normalizePhoto(value: unknown): ClinicianProfilePhoto | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Partial<ClinicianProfilePhoto>;
  const mimeType = trimToUndefined(candidate.mimeType);
  const dataUrl = trimToUndefined(candidate.dataUrl);
  const fileName =
    normalizeSingleLine(candidate.fileName, CLINICIAN_PROFILE_LIMITS.fileName) || 'profile-photo';
  const sizeBytes = normalizePositiveInteger(candidate.sizeBytes);

  if (
    !mimeType ||
    !CLINICIAN_PROFILE_PHOTO_MIME_TYPES.includes(mimeType as ClinicianProfilePhotoMime) ||
    !dataUrl ||
    !dataUrl.startsWith(`data:${mimeType};`) ||
    !sizeBytes ||
    sizeBytes > MAX_CLINICIAN_PROFILE_PHOTO_BYTES
  ) {
    return null;
  }

  return {
    dataUrl,
    mimeType: mimeType as ClinicianProfilePhotoMime,
    fileName,
    sizeBytes,
  };
}

function normalizeProfile(
  value: unknown,
  fallback: ClinicianProfile,
): ClinicianProfile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...fallback };
  }

  const candidate = value as Partial<ClinicianProfile>;
  const displayName = normalizeSingleLine(candidate.displayName, CLINICIAN_PROFILE_LIMITS.displayName);
  const clinicianId = normalizeSingleLine(candidate.clinicianId, CLINICIAN_PROFILE_LIMITS.clinicianId);
  const roleTitle = normalizeSingleLine(candidate.roleTitle, CLINICIAN_PROFILE_LIMITS.roleTitle);
  const specialty = normalizeSingleLine(candidate.specialty, CLINICIAN_PROFILE_LIMITS.specialty);

  return {
    displayName: displayName || fallback.displayName,
    clinicianId: clinicianId || fallback.clinicianId,
    roleTitle: roleTitle || DEFAULT_ROLE_TITLE,
    specialty: specialty || DEFAULT_SPECIALTY,
    bio: normalizeTextarea(candidate.bio, CLINICIAN_PROFILE_LIMITS.bio),
    preferredPronouns: normalizeOptionalSingleLine(
      candidate.preferredPronouns,
      CLINICIAN_PROFILE_LIMITS.preferredPronouns,
    ),
    contactNote: normalizeTextarea(candidate.contactNote, CLINICIAN_PROFILE_LIMITS.contactNote),
    photo: normalizePhoto(candidate.photo),
    workspacePreferences: normalizeWorkspacePreferences(
      candidate.workspacePreferences,
      fallback.workspacePreferences,
    ),
    communicationAuthoring: normalizeCommunicationAuthoring(
      candidate.communicationAuthoring,
      fallback.communicationAuthoring,
    ),
    notificationPreferences: normalizeNotificationPreferences(
      candidate.notificationPreferences,
      fallback.notificationPreferences,
    ),
  };
}

function normalizeStoredRecord(
  value: unknown,
  authScopeId: string,
  fallback: ClinicianProfile,
): StoredClinicianProfileRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Partial<StoredClinicianProfileRecord> & { version?: unknown };
  if (
    (candidate.version !== 1 && candidate.version !== 2) ||
    trimToUndefined(candidate.authScopeId) !== authScopeId
  ) {
    return null;
  }

  const updatedAt = trimToUndefined(candidate.updatedAt) ?? new Date().toISOString();

  return {
    version: 2,
    authScopeId,
    updatedAt,
    profile: normalizeProfile(candidate.profile, fallback),
  };
}

function emitClinicianProfileChange(profile: ClinicianProfile): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<ClinicianProfile>(PROFILE_CHANGE_EVENT, {
      detail: profile,
    }),
  );
}

function persistProfileRecord(
  authScopeId: string,
  profile: ClinicianProfile,
): boolean {
  if (!isBrowser()) {
    return false;
  }

  const record: StoredClinicianProfileRecord = {
    version: 2,
    authScopeId,
    updatedAt: new Date().toISOString(),
    profile,
  };

  try {
    window.localStorage.setItem(getClinicianProfileStorageKey(authScopeId), JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

function syncLegacyOutputs(profile: ClinicianProfile): void {
  writeStorageValue(
    CLINICIAN_ID_STORAGE_KEY,
    normalizeSingleLine(profile.clinicianId, CLINICIAN_PROFILE_LIMITS.clinicianId) || undefined,
  );
  writeStorageValue(
    CLINICIAN_NAME_STORAGE_KEY,
    normalizeSingleLine(profile.displayName, CLINICIAN_PROFILE_LIMITS.displayName) || undefined,
  );
}

export function getClinicianProfileStorageKey(authScopeId: string): string {
  return `${CLINICIAN_PROFILE_STORAGE_PREFIX}:${authScopeId.trim()}`;
}

export function getActiveClinicianProfileScopeId(): string | null {
  const identity = getAuthenticatedClinicianIdentity();
  return identity ? getPrimaryClinicianProfileScopeId(identity) : null;
}

export function getDefaultClinicianProfile(): ClinicianProfile {
  return createDefaultProfile(getAuthenticatedClinicianIdentity());
}

export function getDefaultClinicianProfileForAuthIdentity(): ClinicianProfile {
  return createDefaultProfile(getAuthenticatedClinicianIdentity(), { includeLegacyFallback: false });
}

export function getClinicianProfile(): ClinicianProfile {
  const identity = getAuthenticatedClinicianIdentity();
  const fallback = createDefaultProfile(identity);

  if (!identity || !isBrowser()) {
    return fallback;
  }

  const activeScopeId = getPrimaryClinicianProfileScopeId(identity);

  try {
    const scopeIdsToCheck = [activeScopeId, ...getLegacyClinicianProfileScopeIds(identity)];

    for (const scopeId of scopeIdsToCheck) {
      const raw = window.localStorage.getItem(getClinicianProfileStorageKey(scopeId));
      if (!raw) {
        continue;
      }

      const parsed = normalizeStoredRecord(JSON.parse(raw), scopeId, fallback);
      if (!parsed) {
        continue;
      }

      if (scopeId !== activeScopeId) {
        persistProfileRecord(activeScopeId, parsed.profile);
      }

      syncLegacyOutputs(parsed.profile);
      return parsed.profile;
    }
  } catch {
    // Fall through to seeding below.
  }

  if (persistProfileRecord(activeScopeId, fallback)) {
    syncLegacyOutputs(fallback);
  }

  return fallback;
}

export function setClinicianProfile(profile: ClinicianProfile): SaveClinicianProfileResult {
  const identity = getAuthenticatedClinicianIdentity();
  const fallback = createDefaultProfile(identity);
  const normalized = normalizeProfile(profile, fallback);

  if (!identity) {
    return {
      profile: normalized,
      saved: false,
    };
  }

  const activeScopeId = getPrimaryClinicianProfileScopeId(identity);
  const saved = persistProfileRecord(activeScopeId, normalized);
  if (saved) {
    syncLegacyOutputs(normalized);
    emitClinicianProfileChange(normalized);
  }

  return {
    profile: normalized,
    saved,
  };
}

export function subscribeClinicianProfile(
  listener: (profile: ClinicianProfile) => void,
): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const onStorage = (event: StorageEvent): void => {
    const identity = getAuthenticatedClinicianIdentity();
    const activeScopeId = identity ? getPrimaryClinicianProfileScopeId(identity) : null;
    const activeKey = activeScopeId ? getClinicianProfileStorageKey(activeScopeId) : null;
    const legacyKeys = identity
      ? getLegacyClinicianProfileScopeIds(identity).map((scopeId) =>
          getClinicianProfileStorageKey(scopeId),
        )
      : [];

    if (
      event.key &&
      event.key !== activeKey &&
      !legacyKeys.includes(event.key) &&
      event.key !== CLINICIAN_ID_STORAGE_KEY &&
      event.key !== CLINICIAN_NAME_STORAGE_KEY &&
      !TOKEN_STORAGE_KEYS.includes(event.key)
    ) {
      return;
    }

    listener(getClinicianProfile());
  };

  const onCustomEvent = (event: Event): void => {
    const customEvent = event as CustomEvent<ClinicianProfile>;
    listener(customEvent.detail ?? getClinicianProfile());
  };

  window.addEventListener('storage', onStorage);
  window.addEventListener(PROFILE_CHANGE_EVENT, onCustomEvent as EventListener);

  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(PROFILE_CHANGE_EVENT, onCustomEvent as EventListener);
  };
}

export function setLegacyClinicianIdentityOutputs(identity: {
  clinicianId?: string;
  displayName?: string;
}): void {
  if (Object.prototype.hasOwnProperty.call(identity, 'clinicianId')) {
    writeStorageValue(
      CLINICIAN_ID_STORAGE_KEY,
      normalizeSingleLine(identity.clinicianId, CLINICIAN_PROFILE_LIMITS.clinicianId) || undefined,
    );
  }

  if (Object.prototype.hasOwnProperty.call(identity, 'displayName')) {
    writeStorageValue(
      CLINICIAN_NAME_STORAGE_KEY,
      normalizeSingleLine(identity.displayName, CLINICIAN_PROFILE_LIMITS.displayName) || undefined,
    );
  }
}

export function clearClinicianProfileForTests(authScopeId?: string): void {
  if (!isBrowser()) {
    return;
  }

  try {
    if (authScopeId) {
      window.localStorage.removeItem(getClinicianProfileStorageKey(authScopeId));
      return;
    }

    const keys: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key && key.startsWith(`${CLINICIAN_PROFILE_STORAGE_PREFIX}:`)) {
        keys.push(key);
      }
    }

    keys.forEach((key) => {
      window.localStorage.removeItem(key);
    });
  } catch {
    // Ignore localStorage errors in test helpers.
  }
}
