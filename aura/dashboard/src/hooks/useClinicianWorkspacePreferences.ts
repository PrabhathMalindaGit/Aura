import { useSyncExternalStore } from 'react';
import {
  getClinicianWorkspacePreferences,
  subscribeClinicianWorkspacePreferences,
  type ClinicianWorkspacePreferencesSnapshot,
} from '../services/clinicianWorkspacePreferences';

export function useClinicianWorkspacePreferences(): ClinicianWorkspacePreferencesSnapshot {
  return useSyncExternalStore(
    subscribeClinicianWorkspacePreferences,
    getClinicianWorkspacePreferences,
    getClinicianWorkspacePreferences,
  );
}
