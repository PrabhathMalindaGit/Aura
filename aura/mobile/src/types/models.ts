export type PatientStatus = "active" | "on_hold" | "discharged" | "inactive";

export type ClinicianActor = {
  clinicianId?: string;
  name?: string;
};

export type PatientDischarge = {
  dischargedAt?: string;
  dischargedBy?: ClinicianActor;
  independentModeEnabled?: boolean;
  summary?: string;
  contactInstructions?: string;
  reactivatedAt?: string;
  reactivatedBy?: ClinicianActor;
  lastExportedAt?: string;
  lastExportedBy?: ClinicianActor;
};

export type Patient = {
  id: string;
  displayName?: string;
  status?: PatientStatus;
  clinicianId?: string;
  discharge?: PatientDischarge | null;
};

export type Risk = {
  level: "low" | "high";
  reasonCodes?: string[];
};

export type CheckInDraft = {
  date: string;
  mood: number;
  pain: number;
  adherence: {
    exercises: number;
    medication: boolean;
  };
  notes?: string;
};

export type ChatMessage = {
  id?: string;
  role: "patient" | "assistant" | "system";
  text: string;
  createdAt?: string;
};

export type CheckinAdaptationMode = "standard" | "shortened" | "expanded";
export type RecoverySupportCheckinMode = "standard" | "adaptive" | "force_full";

export type CheckinAdaptationDecision = {
  patientId: string;
  date: string;
  mode: CheckinAdaptationMode;
  reasonCodes: string[];
  explanation: string;
  configVersion: number;
  generatedAt: string;
  optionalSections: {
    recovery: boolean;
    support: boolean;
    dailyContext: boolean;
  };
};

export type RecoveryNudge = {
  patientId: string;
  kind: string;
  title: string;
  message: string;
  ruleCode: string;
  evidenceWindow: string;
  generatedAt: string;
};

export type RecoverySupportConfig = {
  patientId: string;
  checkinMode: RecoverySupportCheckinMode;
  nudgesEnabled: boolean;
  rationale?: string;
  version: number;
  configured: boolean;
  updatedAt?: string;
  createdAt?: string;
  updatedBy?: ClinicianActor;
};

export type DischargeSummary = {
  patientId: string;
  patientName: string;
  status: PatientStatus;
  dischargedAt?: string;
  independentModeEnabled: boolean;
  summary: string;
  recentTrendSummary: string;
  weeklyHeadline?: string;
  planStatus: string;
  nextSteps: string[];
  safetyInstructions: string[];
  generatedAt: string;
};

export type CaregiverAccessMeta = {
  inviteId: string;
  codeHint: string;
  expiresAt: string;
  usedAt: string | null;
  revokedAt: string | null;
  createdAt?: string | null;
  status?: CaregiverInviteStatus;
  relationship?: string | null;
  caregiverName?: string | null;
  lastAccessedAt?: string | null;
};

export type CaregiverInviteStatus =
  | "pending"
  | "active"
  | "expired"
  | "revoked";

export type CaregiverCareState =
  | "active"
  | "on_hold"
  | "discharged"
  | "independent_mode"
  | "inactive";
