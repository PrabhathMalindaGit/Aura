import { useSyncExternalStore } from 'react';
import {
  getClinicianIdentity,
  subscribeClinicianIdentity,
  type ClinicianIdentity,
} from '../services/clinicianIdentity';

export function useClinicianIdentity(): ClinicianIdentity {
  return useSyncExternalStore(
    subscribeClinicianIdentity,
    getClinicianIdentity,
    getClinicianIdentity,
  );
}
