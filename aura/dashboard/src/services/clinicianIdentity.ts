import { getStoredClinicianToken } from './apiClient';
import type { ClinicianProfilePhoto } from './clinicianProfile';
import {
  CLINICIAN_ID_STORAGE_KEY,
  CLINICIAN_NAME_STORAGE_KEY,
} from '../utils/storageKeys';
import {
  getActiveClinicianProfileScopeId,
  getClinicianProfile,
  getClinicianProfileStorageKey,
  setLegacyClinicianIdentityOutputs,
  subscribeClinicianProfile,
} from './clinicianProfile';

interface SavedClinicianProfileRecordShape {
  profile?: {
    displayName?: unknown;
    clinicianId?: unknown;
    roleTitle?: unknown;
    specialty?: unknown;
  };
}

interface AuthClinicianIdentity {
  scopeId: string;
  displayName?: string;
}

export interface ClinicianIdentity {
  authScopeId: string | null;
  clinicianId: string;
  displayName: string;
  roleTitle: string;
  specialty: string;
  secondaryLine: string;
  initials: string;
  photo: ClinicianProfilePhoto | null;
  preferredPronouns?: string;
  bio: string;
  contactNote: string;
}

const FALLBACK_CLINICIAN_LABEL = 'Clinician';
const FALLBACK_CLINICIAN_ID = 'clinician-1';
const FALLBACK_CLINICIAN_INITIALS = 'CL';

let cachedIdentitySnapshot: ClinicianIdentity | null = null;
let cachedIdentitySnapshotKey: string | null = null;

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

function readSavedProfileRecord(): SavedClinicianProfileRecordShape | null {
  if (!isBrowser()) {
    return null;
  }

  const authScopeId = getActiveClinicianProfileScopeId();
  if (!authScopeId) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(getClinicianProfileStorageKey(authScopeId));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }

    return parsed as SavedClinicianProfileRecordShape;
  } catch {
    return null;
  }
}

function buildInitials(value: string): string {
  const segments = value
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .split(/\s+/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length === 0) {
    return '';
  }

  return segments
    .slice(0, 2)
    .map((segment) => segment[0]?.toUpperCase() ?? '')
    .join('');
}

export function buildClinicianSecondaryLine(
  roleTitle?: string,
  specialty?: string,
): string {
  const nextRoleTitle = trimToUndefined(roleTitle);
  const nextSpecialty = trimToUndefined(specialty);

  if (nextRoleTitle && nextSpecialty) {
    return `${nextRoleTitle} · ${nextSpecialty}`;
  }

  return nextRoleTitle ?? nextSpecialty ?? '';
}

export function getClinicianInitials(
  displayName?: string,
  clinicianId?: string,
): string {
  return (
    buildInitials(displayName ?? '') ||
    buildInitials(clinicianId ?? '') ||
    FALLBACK_CLINICIAN_INITIALS
  );
}

export function getClinicianIdentity(): ClinicianIdentity {
  const profile = getClinicianProfile();
  const savedProfile = readSavedProfileRecord()?.profile;
  const authIdentity = getAuthenticatedClinicianIdentity();
  const legacyDisplayName = readStorageValue(CLINICIAN_NAME_STORAGE_KEY);
  const legacyClinicianId = readStorageValue(CLINICIAN_ID_STORAGE_KEY);
  const savedDisplayName = trimToUndefined(savedProfile?.displayName);
  const savedClinicianId = trimToUndefined(savedProfile?.clinicianId);
  const savedRoleTitle = trimToUndefined(savedProfile?.roleTitle);
  const savedSpecialty = trimToUndefined(savedProfile?.specialty);
  const displayName =
    savedDisplayName ??
    authIdentity?.displayName ??
    legacyDisplayName ??
    FALLBACK_CLINICIAN_LABEL;
  const clinicianId =
    savedClinicianId ??
    trimToUndefined(profile.clinicianId) ??
    authIdentity?.scopeId ??
    legacyClinicianId ??
    FALLBACK_CLINICIAN_ID;
  const roleTitle = savedRoleTitle ?? trimToUndefined(profile.roleTitle) ?? '';
  const specialty = savedSpecialty ?? trimToUndefined(profile.specialty) ?? '';
  const nextIdentity: ClinicianIdentity = {
    authScopeId: authIdentity?.scopeId ?? null,
    clinicianId,
    displayName,
    roleTitle,
    specialty,
    secondaryLine: buildClinicianSecondaryLine(roleTitle, specialty),
    initials: getClinicianInitials(displayName, clinicianId),
    photo: profile.photo,
    preferredPronouns: trimToUndefined(profile.preferredPronouns),
    bio: profile.bio,
    contactNote: profile.contactNote,
  };

  const snapshotKey = JSON.stringify({
    authScopeId: nextIdentity.authScopeId,
    clinicianId: nextIdentity.clinicianId,
    displayName: nextIdentity.displayName,
    roleTitle: nextIdentity.roleTitle,
    specialty: nextIdentity.specialty,
    secondaryLine: nextIdentity.secondaryLine,
    initials: nextIdentity.initials,
    preferredPronouns: nextIdentity.preferredPronouns ?? '',
    bio: nextIdentity.bio,
    contactNote: nextIdentity.contactNote,
    photo: nextIdentity.photo
      ? {
          dataUrl: nextIdentity.photo.dataUrl,
          mimeType: nextIdentity.photo.mimeType,
          fileName: nextIdentity.photo.fileName,
          sizeBytes: nextIdentity.photo.sizeBytes,
        }
      : null,
  });

  if (cachedIdentitySnapshot && cachedIdentitySnapshotKey === snapshotKey) {
    return cachedIdentitySnapshot;
  }

  cachedIdentitySnapshot = nextIdentity;
  cachedIdentitySnapshotKey = snapshotKey;
  return nextIdentity;
}

export function getClinicianId(): string {
  return getClinicianIdentity().clinicianId;
}

export function getClinicianName(): string {
  return getClinicianIdentity().displayName;
}

export function getClinicianSecondaryLine(): string {
  return getClinicianIdentity().secondaryLine;
}

export function getClinicianAuthScopeId(): string | null {
  return getClinicianIdentity().authScopeId;
}

export function getClinicianCommunicationScopeKey(): string {
  const identity = getClinicianIdentity();
  return identity.authScopeId ?? identity.clinicianId;
}

export function subscribeClinicianIdentity(
  listener: () => void,
): () => void {
  return subscribeClinicianProfile(() => {
    getClinicianIdentity();
    listener();
  });
}

export function setClinicianId(clinicianId: string): void {
  setLegacyClinicianIdentityOutputs({ clinicianId });
}

export function setClinicianName(clinicianName: string): void {
  setLegacyClinicianIdentityOutputs({ displayName: clinicianName });
}

export function setClinicianIdentity(clinicianId: string, clinicianName: string): void {
  setLegacyClinicianIdentityOutputs({
    clinicianId,
    displayName: clinicianName,
  });
}

export function getClinicianIdentityStorageKeys(): { clinicianIdKey: string; clinicianNameKey: string } {
  return {
    clinicianIdKey: CLINICIAN_ID_STORAGE_KEY,
    clinicianNameKey: CLINICIAN_NAME_STORAGE_KEY,
  };
}

export function clearClinicianIdentityForTests(): void {
  cachedIdentitySnapshot = null;
  cachedIdentitySnapshotKey = null;

  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return;
  }

  try {
    window.localStorage.removeItem(CLINICIAN_ID_STORAGE_KEY);
    window.localStorage.removeItem(CLINICIAN_NAME_STORAGE_KEY);
  } catch {
    // Ignore localStorage errors in test helpers.
  }
}
