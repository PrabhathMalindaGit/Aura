export type ProvenanceSource =
  | 'clinician-entered'
  | 'patient-reported'
  | 'device-captured'
  | 'ai-suggested'
  | 'unknown';

export interface QueueRowVm {
  id: string;
  title: string;
  subtitle?: string;
  severity: 'neutral' | 'warning' | 'critical';
  provenance: ProvenanceSource[];
  changedAt?: string;
}

export interface InboxThreadVm {
  id: string;
  patientLabel: string;
  summary: string;
  needsResponse: boolean;
  provenance: ProvenanceSource[];
  lastActivityAt?: string;
}

export interface PatientWorkspaceHeaderVm {
  patientId: string;
  displayName: string;
  statusLabel: string;
  lastReviewedAt?: string;
  lastEditedAt?: string;
  provenance: ProvenanceSource[];
}

export interface GovernanceEventVm {
  id: string;
  label: string;
  detail?: string;
  source: ProvenanceSource;
  updatedAt?: string;
}
