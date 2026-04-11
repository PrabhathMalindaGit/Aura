import PatientThresholdConfig from "../models/PatientThresholdConfig";
import { env } from "../env";

export const DEFAULT_MISSED_CHECKIN_DAYS = 2;
export const DEFAULT_RESPONSE_DELAY_HOURS = 24;
export const DEFAULT_SAFETY_FLAGGED_RESPONSE_DELAY_HOURS = 6;

export type PatientThresholdSnapshot = {
  patientId: string;
  painHighThreshold: number;
  missedCheckinDays: number;
  responseDelayHours: number;
  safetyFlaggedResponseDelayHours: number;
  rationale?: string;
  version: number;
  updatedBy?: {
    clinicianId: string;
    name?: string;
  };
  createdAt?: string;
  updatedAt?: string;
  configured: boolean;
};

export type SavePatientThresholdConfigInput = {
  patientId: string;
  painHighThreshold: number;
  missedCheckinDays: number;
  responseDelayHours: number;
  safetyFlaggedResponseDelayHours: number;
  rationale?: string;
  updatedBy: {
    clinicianId: string;
    name?: string;
  };
};

function toTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function toIsoString(value: unknown): string | undefined {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    return undefined;
  }

  return value.toISOString();
}

function createDefaultSnapshot(patientId: string): PatientThresholdSnapshot {
  return {
    patientId,
    painHighThreshold: env.PAIN_HIGH_THRESHOLD,
    missedCheckinDays: DEFAULT_MISSED_CHECKIN_DAYS,
    responseDelayHours: DEFAULT_RESPONSE_DELAY_HOURS,
    safetyFlaggedResponseDelayHours:
      DEFAULT_SAFETY_FLAGGED_RESPONSE_DELAY_HOURS,
    version: 0,
    configured: false,
  };
}

function mapThresholdDocument(
  doc: Record<string, unknown> | null | undefined,
  patientId: string
): PatientThresholdSnapshot {
  if (!doc) {
    return createDefaultSnapshot(patientId);
  }

  const updatedByRecord =
    doc.updatedBy && typeof doc.updatedBy === "object" && !Array.isArray(doc.updatedBy)
      ? (doc.updatedBy as Record<string, unknown>)
      : null;

  return {
    patientId,
    painHighThreshold:
      typeof doc.painHighThreshold === "number"
        ? doc.painHighThreshold
        : env.PAIN_HIGH_THRESHOLD,
    missedCheckinDays:
      typeof doc.missedCheckinDays === "number"
        ? doc.missedCheckinDays
        : DEFAULT_MISSED_CHECKIN_DAYS,
    responseDelayHours:
      typeof doc.responseDelayHours === "number"
        ? doc.responseDelayHours
        : DEFAULT_RESPONSE_DELAY_HOURS,
    safetyFlaggedResponseDelayHours:
      typeof doc.safetyFlaggedResponseDelayHours === "number"
        ? doc.safetyFlaggedResponseDelayHours
        : DEFAULT_SAFETY_FLAGGED_RESPONSE_DELAY_HOURS,
    rationale: toTrimmedString(doc.rationale),
    version: typeof doc.version === "number" ? doc.version : 1,
    updatedBy:
      updatedByRecord && typeof updatedByRecord.clinicianId === "string"
        ? {
            clinicianId: updatedByRecord.clinicianId,
            name: toTrimmedString(updatedByRecord.name),
          }
        : undefined,
    createdAt: toIsoString(doc.createdAt),
    updatedAt: toIsoString(doc.updatedAt),
    configured: true,
  };
}

export function getDefaultThresholdSnapshot(
  patientId: string
): PatientThresholdSnapshot {
  return createDefaultSnapshot(patientId);
}

export async function getPatientThresholdConfig(
  patientId: string
): Promise<PatientThresholdSnapshot> {
  const normalizedPatientId = patientId.trim();
  if (!normalizedPatientId) {
    return createDefaultSnapshot("");
  }

  const doc = await PatientThresholdConfig.findOne({
    patientId: normalizedPatientId,
  }).lean();
  return mapThresholdDocument(
    doc as Record<string, unknown> | null,
    normalizedPatientId
  );
}

export async function getPatientThresholdConfigMap(
  patientIds: string[]
): Promise<Map<string, PatientThresholdSnapshot>> {
  const normalizedPatientIds = Array.from(
    new Set(patientIds.map((value) => value.trim()).filter(Boolean))
  );

  if (normalizedPatientIds.length === 0) {
    return new Map();
  }

  const docs = await PatientThresholdConfig.find({
    patientId: { $in: normalizedPatientIds },
  }).lean();

  const docMap = new Map(
    docs.map((doc) => [
      typeof doc.patientId === "string" ? doc.patientId : "",
      doc as Record<string, unknown>,
    ])
  );

  return new Map(
    normalizedPatientIds.map((patientId) => [
      patientId,
      mapThresholdDocument(docMap.get(patientId), patientId),
    ])
  );
}

export async function savePatientThresholdConfig(
  input: SavePatientThresholdConfigInput
): Promise<{
  current: PatientThresholdSnapshot;
  previous: PatientThresholdSnapshot;
}> {
  const patientId = input.patientId.trim();
  const previous = await getPatientThresholdConfig(patientId);
  const existing = await PatientThresholdConfig.findOne({ patientId });
  const nextVersion = existing ? Math.max(existing.version ?? 1, 1) + 1 : 1;

  const updated = await PatientThresholdConfig.findOneAndUpdate(
    { patientId },
    {
      $set: {
        painHighThreshold: input.painHighThreshold,
        missedCheckinDays: input.missedCheckinDays,
        responseDelayHours: input.responseDelayHours,
        safetyFlaggedResponseDelayHours:
          input.safetyFlaggedResponseDelayHours,
        rationale: input.rationale?.trim() || undefined,
        version: nextVersion,
        updatedBy: {
          clinicianId: input.updatedBy.clinicianId,
          name: input.updatedBy.name,
        },
      },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }
  ).lean();

  return {
    previous,
    current: mapThresholdDocument(
      updated as Record<string, unknown>,
      patientId
    ),
  };
}
