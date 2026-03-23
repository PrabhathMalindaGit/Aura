import { fetchJson } from './apiClient';

export interface ClinicianSessionResponse {
  ok: true;
  clinician: {
    id: string;
    email: string;
    name: string | null;
    role: 'clinician' | 'admin';
  };
}

export function getClinicianSession(): Promise<ClinicianSessionResponse> {
  return fetchJson<ClinicianSessionResponse>('/auth/clinician/me');
}
