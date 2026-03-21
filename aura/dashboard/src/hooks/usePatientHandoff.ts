import { useSyncExternalStore } from 'react';
import {
  getPatientHandoffRecord,
  subscribePatientHandoff,
  type PatientHandoffRecord,
} from '../services/patientHandoffWorkspace';

function normalizePatientId(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function usePatientHandoff(patientId: string | null | undefined): PatientHandoffRecord | null {
  const normalizedPatientId = normalizePatientId(patientId);

  return useSyncExternalStore(
    subscribePatientHandoff,
    () => getPatientHandoffRecord(normalizedPatientId),
    () => getPatientHandoffRecord(normalizedPatientId),
  );
}
