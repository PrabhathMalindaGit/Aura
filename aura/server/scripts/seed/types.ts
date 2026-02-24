export type SeedStatus = "open" | "acknowledged" | "resolved";

export interface SeedSummary {
  patients: number;
  checkIns: number;
  chatMessages: number;
  alerts: number;
  careEvents: number;
  exercisePlans: number;
  promTemplates: number;
  promInstances: number;
}

export interface SeedOptions {
  now?: Date;
  resetFirst?: boolean;
}

export interface ResetSummary {
  usersDeleted: number;
  patientsDeleted: number;
  checkInsDeleted: number;
  chatMessagesDeleted: number;
  alertsDeleted: number;
  careEventsDeleted: number;
  exercisePlansDeleted: number;
  promTemplatesDeleted: number;
  promInstancesDeleted: number;
}

export interface SeedAlertDefinition {
  key: string;
  patientId: string;
  status: SeedStatus;
  reason: string;
  sourceType: "checkin" | "chat";
  sourceRef: string;
  createdAt: Date;
  acknowledgedAt?: Date;
  resolvedAt?: Date;
  seenAt?: Date;
  seenBy?: string[];
  assignedTo?: string;
  assignedToName?: string;
  assignedAt?: Date;
  riskFinal?: "low" | "medium" | "high";
  overrideReason?: string;
  overriddenBy?: string;
  overriddenByName?: string;
  overriddenAt?: Date;
  notificationStatus?: "unknown" | "failed";
  notificationAttemptedAt?: Date;
  notificationFailedAt?: Date;
  notificationError?: string;
}
