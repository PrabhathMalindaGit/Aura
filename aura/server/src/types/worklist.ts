export type WorklistRecord = {
  patientId: string;
  patientName: string;
  patientStatus: "active" | "on_hold" | "discharged" | "inactive";
  rehabPhase?: string;
  lastCheckinAt?: string;
  openAlertsCount: number;
  latestRiskLevel: "low" | "high";
  lastPainScore?: number;
  adherenceSummary: {
    exercisesPct?: number;
    medicationTaken?: boolean;
  };
  nextAppointmentAt?: string;
  missedCheckins: {
    flag: boolean;
    count: number;
  };
  communicationNeedsResponse: boolean;
  activeTaskCount: number;
  topIssue?: string;
  reviewReason?: string;
  priorityScore: number;
  updatedAt: string;
};

export type WorklistResponse = {
  ok: true;
  items: WorklistRecord[];
  total: number;
};
