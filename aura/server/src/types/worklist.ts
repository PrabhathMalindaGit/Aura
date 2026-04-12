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
  communicationSummary?: {
    needsResponseCount: number;
    flaggedBySafetyCount: number;
    latestMessageAt?: string;
    delayedResponse: boolean;
    responseDelayed?: boolean;
    responseDelayHours?: number;
    responseAgeHours?: number;
    responseDueAt?: string;
    reviewedAfterLatestInbound?: boolean;
    lastReviewedAt?: string;
    lastReviewedBy?: {
      clinicianId: string;
      displayName?: string;
    };
    resolutionKind?: "no_follow_up_needed";
  };
  activeTaskCount: number;
  proms: {
    dueCount: number;
    overdueCount: number;
    nextDueAt?: string;
  };
  thresholdSummary?: {
    painHighThreshold: number;
    missedCheckinDays: number;
    responseDelayHours: number;
    safetyFlaggedResponseDelayHours: number;
    configured: boolean;
    updatedAt?: string;
    updatedByName?: string;
  };
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
