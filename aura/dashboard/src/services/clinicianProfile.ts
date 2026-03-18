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

export interface ClinicianProfile {
  displayName: string;
  clinicianId: string;
  roleTitle: string;
  specialty: string;
  bio: string;
  preferredPronouns?: string;
  contactNote: string;
  photo: ClinicianProfilePhoto | null;
}

interface StoredClinicianProfileRecord {
  version: 1;
  authScopeId: string;
  updatedAt: string;
  profile: ClinicianProfile;
}

interface AuthClinicianIdentity {
  scopeId: string;
  displayName?: string;
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
  fileName: 120,
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
const PROFILE_CHANGE_EVENT = 'aura:clinician-profile-change';
const TOKEN_STORAGE_KEYS = ['aura_access_token', 'aura_auth_token', 'clinicianToken'];

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

function normalizePositiveInteger(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  const next = Math.trunc(value);
  return next > 0 ? next : null;
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

function getAuthenticatedClinicianIdentity(): AuthClinicianIdentity | null {
  const token = getStoredClinicianToken();
  if (!token) {
    return null;
  }

  const sections = token.split('.');
  if (sections.length < 2) {
    return null;
  }

  const payload = decodeTokenSection(sections[1]) as { sub?: unknown; name?: unknown } | undefined;
  const scopeId = trimToUndefined(payload?.sub);
  if (!scopeId) {
    return null;
  }

  return {
    scopeId,
    displayName: trimToUndefined(payload?.name),
  };
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

  const candidate = value as Partial<StoredClinicianProfileRecord>;
  if (candidate.version !== 1 || trimToUndefined(candidate.authScopeId) !== authScopeId) {
    return null;
  }

  const updatedAt = trimToUndefined(candidate.updatedAt) ?? new Date().toISOString();

  return {
    version: 1,
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
    version: 1,
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
  return getAuthenticatedClinicianIdentity()?.scopeId ?? null;
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

  try {
    const raw = window.localStorage.getItem(getClinicianProfileStorageKey(identity.scopeId));
    if (raw) {
      const parsed = normalizeStoredRecord(JSON.parse(raw), identity.scopeId, fallback);
      if (parsed) {
        syncLegacyOutputs(parsed.profile);
        return parsed.profile;
      }
    }
  } catch {
    // Fall through to seeding below.
  }

  if (persistProfileRecord(identity.scopeId, fallback)) {
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

  const saved = persistProfileRecord(identity.scopeId, normalized);
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
    const activeScopeId = getActiveClinicianProfileScopeId();
    const activeKey = activeScopeId ? getClinicianProfileStorageKey(activeScopeId) : null;

    if (
      event.key &&
      event.key !== activeKey &&
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
