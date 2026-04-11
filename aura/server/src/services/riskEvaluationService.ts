import type { PatientThresholdSnapshot } from "./patientThresholdService";
import {
  getPatientThresholdConfig,
  getPatientThresholdConfigMap,
} from "./patientThresholdService";

export type RiskDecisionInput = {
  patientId: string;
  aiRisk: "low" | "high";
  aiReasons: string[];
  pain?: number;
  explicitReasonCodes?: string[];
  thresholds?: PatientThresholdSnapshot;
};

export type RiskDecision = {
  riskLevel: "low" | "high";
  reasonCodes: string[];
  thresholdReasonCodes: string[];
  thresholds: PatientThresholdSnapshot;
};

export type ResponseDelayState = {
  delayed: boolean;
  thresholdHours: number;
  elapsedHours: number;
};

function uniqueReasonCodes(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(values.map((value) => value?.trim()).filter(Boolean))
  ) as string[];
}

export async function evaluateRiskDecision(
  input: RiskDecisionInput
): Promise<RiskDecision> {
  const thresholds =
    input.thresholds ?? (await getPatientThresholdConfig(input.patientId));
  const thresholdReasonCodes =
    typeof input.pain === "number" && input.pain >= thresholds.painHighThreshold
      ? ["PAIN_GE_THRESHOLD"]
      : [];
  const reasonCodes = uniqueReasonCodes([
    ...input.aiReasons,
    ...(input.explicitReasonCodes ?? []),
    ...thresholdReasonCodes,
  ]);

  return {
    riskLevel:
      reasonCodes.length > 0 || input.aiRisk === "high" ? "high" : "low",
    reasonCodes,
    thresholdReasonCodes,
    thresholds,
  };
}

export function deriveMissedCheckinsFromThreshold(input: {
  patientStatus: "active" | "on_hold" | "discharged" | "inactive";
  referenceDate: Date | null;
  now: Date;
  thresholds: PatientThresholdSnapshot;
}): { flag: boolean; count: number } {
  if (
    input.patientStatus === "discharged" ||
    input.patientStatus === "inactive"
  ) {
    return {
      flag: false,
      count: 0,
    };
  }

  if (!input.referenceDate) {
    return {
      flag: true,
      count: 1,
    };
  }

  const msPerDay = 24 * 60 * 60 * 1000;
  const elapsedDays = Math.floor(
    (input.now.getTime() - input.referenceDate.getTime()) / msPerDay
  );
  const missedCount = Math.max(
    0,
    elapsedDays - (Math.max(input.thresholds.missedCheckinDays, 1) - 1)
  );

  return {
    flag: missedCount > 0,
    count: missedCount,
  };
}

export function deriveResponseDelayState(input: {
  messageCreatedAt: Date;
  flaggedBySafety: boolean;
  now: Date;
  thresholds: PatientThresholdSnapshot;
}): ResponseDelayState {
  const thresholdHours = input.flaggedBySafety
    ? input.thresholds.safetyFlaggedResponseDelayHours
    : input.thresholds.responseDelayHours;
  const elapsedMs = Math.max(
    input.now.getTime() - input.messageCreatedAt.getTime(),
    0
  );
  const elapsedHours = Math.round((elapsedMs / (60 * 60 * 1000)) * 10) / 10;

  return {
    delayed: elapsedMs >= thresholdHours * 60 * 60 * 1000,
    thresholdHours,
    elapsedHours,
  };
}

export async function getThresholdsForPatients(
  patientIds: string[]
): Promise<Map<string, PatientThresholdSnapshot>> {
  return getPatientThresholdConfigMap(patientIds);
}
