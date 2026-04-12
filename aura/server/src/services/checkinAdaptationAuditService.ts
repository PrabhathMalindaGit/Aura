import { createHash } from "node:crypto";

import CareEvent from "../models/CareEvent";
import type {
  CheckinAdaptationDecision,
  CheckinAdaptationDecisionSource,
  CheckinAdaptationEvaluation,
  CheckinAdaptationReasonDetail,
} from "./checkinAdaptationService";

export type CheckinAdaptationHistorySurface = "patient_checkin";

export type CheckinAdaptationHistoryEntry = {
  id: string;
  recordedAt: string;
  surface: CheckinAdaptationHistorySurface;
  decision: CheckinAdaptationDecision;
};

function normalizeHistorySurface(
  value: unknown,
): CheckinAdaptationHistorySurface {
  return value === "patient_checkin" ? value : "patient_checkin";
}

function normalizeReasonDetails(
  value: unknown,
): CheckinAdaptationReasonDetail[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object"))
    .map((entry): CheckinAdaptationReasonDetail => ({
      code: typeof entry.code === "string" ? entry.code : "",
      label: typeof entry.label === "string" ? entry.label : "",
      category:
        entry.category === "override" ||
        entry.category === "safety" ||
        entry.category === "cooldown" ||
        entry.category === "stability" ||
        entry.category === "adherence" ||
        entry.category === "engagement" ||
        entry.category === "configuration"
          ? entry.category
          : "configuration",
    }))
    .filter((entry) => entry.code.trim() && entry.label.trim());
}

function normalizeOptionalSections(
  value: unknown,
): CheckinAdaptationDecision["optionalSections"] {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    recovery: record.recovery !== false,
    support: record.support !== false,
    dailyContext: record.dailyContext !== false,
  };
}

function buildDecisionHash(
  evaluation: CheckinAdaptationEvaluation,
  surface: CheckinAdaptationHistorySurface,
): string {
  const payload = {
    surface,
    date: evaluation.auditPayload.date,
    mode: evaluation.decision.mode,
    decisionSource: evaluation.decision.decisionSource,
    reasonCodes: evaluation.decision.reasonCodes,
    configVersion: evaluation.decision.configVersion,
    thresholdVersion: evaluation.decision.thresholdVersion,
    recentCheckinsCount: evaluation.auditPayload.recentCheckinsCount,
    missedCheckins: evaluation.auditPayload.missedCheckins,
    openAlertCount: evaluation.auditPayload.openAlertCount,
    recentResolvedHighRiskAlertCount:
      evaluation.auditPayload.recentResolvedHighRiskAlertCount,
    temporaryForceFullUntil:
      evaluation.auditPayload.temporaryForceFullUntil ?? null,
    exercisePlanUpdatedAt: evaluation.auditPayload.exercisePlanUpdatedAt ?? null,
    rehabUpdatedAt: evaluation.auditPayload.rehabUpdatedAt ?? null,
    currentPhaseStartedAt: evaluation.auditPayload.currentPhaseStartedAt ?? null,
    thresholdUpdatedAt: evaluation.auditPayload.thresholdUpdatedAt ?? null,
    recoverySupportUpdatedAt:
      evaluation.auditPayload.recoverySupportUpdatedAt ?? null,
    checkinAdherenceRecent:
      evaluation.auditPayload.checkinAdherenceRecent ?? null,
    checkinAdherencePrevious:
      evaluation.auditPayload.checkinAdherencePrevious ?? null,
    exerciseSessionCompletionRecentRate:
      evaluation.auditPayload.exerciseSessionCompletionRecentRate ?? null,
    exerciseSessionCompletionPreviousRate:
      evaluation.auditPayload.exerciseSessionCompletionPreviousRate ?? null,
    exerciseSessionCompletionRecentTracked:
      evaluation.auditPayload.exerciseSessionCompletionRecentTracked ?? 0,
  };

  return createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
}

export async function recordCheckinAdaptationDecision(input: {
  patientId: string;
  evaluation: CheckinAdaptationEvaluation;
  surface: CheckinAdaptationHistorySurface;
}): Promise<void> {
  const patientId = input.patientId.trim();
  if (!patientId) {
    return;
  }

  const hash = buildDecisionHash(input.evaluation, input.surface);
  const existing = await CareEvent.findOne({
    type: "CHECKIN_ADAPTATION_APPLIED",
    patientId,
    "payload.hash": hash,
  })
    .select({ _id: 1 })
    .lean();

  if (existing) {
    return;
  }

  await CareEvent.create({
    type: "CHECKIN_ADAPTATION_APPLIED",
    patientId,
    payload: {
      hash,
      surface: input.surface,
      ...input.evaluation.auditPayload,
      explanation: input.evaluation.decision.explanation,
      optionalSections: input.evaluation.decision.optionalSections,
    },
  });
}

export async function listCheckinAdaptationHistory(
  patientIdInput: string,
  limit = 7,
): Promise<CheckinAdaptationHistoryEntry[]> {
  const patientId = patientIdInput.trim();
  if (!patientId) {
    return [];
  }

  const rows = await CareEvent.find({
    type: "CHECKIN_ADAPTATION_APPLIED",
    patientId,
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  const historyEntries = rows
    .map((row): CheckinAdaptationHistoryEntry | null => {
      const payload =
        row.payload && typeof row.payload === "object"
          ? (row.payload as Record<string, unknown>)
          : {};

      const decisionSource =
        payload.decisionSource === "persistent_force_full" ||
        payload.decisionSource === "temporary_force_full" ||
        payload.decisionSource === "hard_safety_expanded" ||
        payload.decisionSource === "cooldown_standard" ||
        payload.decisionSource === "adaptive_shortened" ||
        payload.decisionSource === "adaptive_standard_fallback" ||
        payload.decisionSource === "adaptive_expanded"
          ? (payload.decisionSource as CheckinAdaptationDecisionSource)
          : "adaptive_standard_fallback";

      const mode =
        payload.mode === "shortened" ||
        payload.mode === "expanded" ||
        payload.mode === "standard"
          ? payload.mode
          : "standard";
      const patientIdValue =
        typeof payload.patientId === "string" ? payload.patientId : patientId;
      const date = typeof payload.date === "string" ? payload.date : "";
      const generatedAt =
        typeof payload.generatedAt === "string" ? payload.generatedAt : "";
      const clinicianSummary =
        typeof payload.clinicianSummary === "string"
          ? payload.clinicianSummary
          : "";

      if (!date || !generatedAt) {
        return null;
      }

      return {
        id: String(row._id),
        recordedAt:
          row.createdAt instanceof Date
            ? row.createdAt.toISOString()
            : generatedAt,
        surface: normalizeHistorySurface(payload.surface),
        decision: {
          patientId: patientIdValue,
          date,
          mode,
          decisionSource,
          reasonCodes: Array.isArray(payload.reasonCodes)
            ? payload.reasonCodes.filter(
                (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
              )
            : [],
          reasonDetails: normalizeReasonDetails(payload.reasonDetails),
          clinicianSummary,
          explanation:
            typeof payload.explanation === "string" ? payload.explanation : undefined,
          configVersion:
            typeof payload.configVersion === "number" ? payload.configVersion : 0,
          thresholdVersion:
            typeof payload.thresholdVersion === "number" ? payload.thresholdVersion : 0,
          generatedAt,
          optionalSections: normalizeOptionalSections(payload.optionalSections),
        },
      };
    })
    .filter((entry): entry is CheckinAdaptationHistoryEntry => entry !== null);

  return historyEntries;
}
