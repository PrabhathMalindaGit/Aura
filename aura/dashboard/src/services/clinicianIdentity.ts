import { CLINICIAN_ID_STORAGE_KEY, CLINICIAN_NAME_STORAGE_KEY } from '../utils/storageKeys';
import {
  getClinicianProfile,
  setLegacyClinicianIdentityOutputs,
} from './clinicianProfile';

export function getClinicianId(): string {
  return getClinicianProfile().clinicianId;
}

export function getClinicianName(): string {
  return getClinicianProfile().displayName;
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
