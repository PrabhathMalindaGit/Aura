const CLINICIAN_ID_KEY = 'aura_clinician_id';
const CLINICIAN_NAME_KEY = 'aura_clinician_name';

const DEFAULT_CLINICIAN_ID = 'clinician-1';
const DEFAULT_CLINICIAN_NAME = 'Clinician 1';

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readStorageValue(key: string, fallback: string): string {
  if (!isBrowser()) {
    return fallback;
  }

  try {
    const value = window.localStorage.getItem(key)?.trim();
    return value ? value : fallback;
  } catch {
    return fallback;
  }
}

function writeStorageValue(key: string, value: string): void {
  if (!isBrowser()) {
    return;
  }

  try {
    const next = value.trim();
    if (next) {
      window.localStorage.setItem(key, next);
      return;
    }

    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage write errors to keep UI usable.
  }
}

export function getClinicianId(): string {
  return readStorageValue(CLINICIAN_ID_KEY, DEFAULT_CLINICIAN_ID);
}

export function getClinicianName(): string {
  return readStorageValue(CLINICIAN_NAME_KEY, DEFAULT_CLINICIAN_NAME);
}

export function setClinicianId(clinicianId: string): void {
  writeStorageValue(CLINICIAN_ID_KEY, clinicianId);
}

export function setClinicianName(clinicianName: string): void {
  writeStorageValue(CLINICIAN_NAME_KEY, clinicianName);
}

export function setClinicianIdentity(clinicianId: string, clinicianName: string): void {
  setClinicianId(clinicianId);
  setClinicianName(clinicianName);
}

export function getClinicianIdentityStorageKeys(): { clinicianIdKey: string; clinicianNameKey: string } {
  return {
    clinicianIdKey: CLINICIAN_ID_KEY,
    clinicianNameKey: CLINICIAN_NAME_KEY,
  };
}

export function clearClinicianIdentityForTests(): void {
  if (!isBrowser()) {
    return;
  }

  try {
    window.localStorage.removeItem(CLINICIAN_ID_KEY);
    window.localStorage.removeItem(CLINICIAN_NAME_KEY);
  } catch {
    // Ignore localStorage errors in test helpers.
  }
}
