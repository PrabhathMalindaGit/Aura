import PatientRecoverySupportConfig from "../models/PatientRecoverySupportConfig";

export type RecoverySupportCheckinMode = "standard" | "adaptive" | "force_full";

export type PatientRecoverySupportSnapshot = {
  patientId: string;
  checkinMode: RecoverySupportCheckinMode;
  nudgesEnabled: boolean;
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

export type SavePatientRecoverySupportConfigInput = {
  patientId: string;
  checkinMode: RecoverySupportCheckinMode;
  nudgesEnabled: boolean;
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

function createDefaultSnapshot(patientId: string): PatientRecoverySupportSnapshot {
  return {
    patientId,
    checkinMode: "standard",
    nudgesEnabled: false,
    version: 0,
    configured: false,
  };
}

function mapRecoverySupportDocument(
  doc: Record<string, unknown> | null | undefined,
  patientId: string
): PatientRecoverySupportSnapshot {
  if (!doc) {
    return createDefaultSnapshot(patientId);
  }

  const updatedByRecord =
    doc.updatedBy && typeof doc.updatedBy === "object" && !Array.isArray(doc.updatedBy)
      ? (doc.updatedBy as Record<string, unknown>)
      : null;

  return {
    patientId,
    checkinMode:
      doc.checkinMode === "adaptive" || doc.checkinMode === "force_full"
        ? doc.checkinMode
        : "standard",
    nudgesEnabled: doc.nudgesEnabled === true,
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

export function getDefaultPatientRecoverySupportSnapshot(
  patientId: string
): PatientRecoverySupportSnapshot {
  return createDefaultSnapshot(patientId);
}

export async function getPatientRecoverySupportConfig(
  patientId: string
): Promise<PatientRecoverySupportSnapshot> {
  const normalizedPatientId = patientId.trim();
  if (!normalizedPatientId) {
    return createDefaultSnapshot("");
  }

  const doc = await PatientRecoverySupportConfig.findOne({
    patientId: normalizedPatientId,
  }).lean();

  return mapRecoverySupportDocument(
    doc as Record<string, unknown> | null,
    normalizedPatientId
  );
}

export async function savePatientRecoverySupportConfig(
  input: SavePatientRecoverySupportConfigInput
): Promise<{
  current: PatientRecoverySupportSnapshot;
  previous: PatientRecoverySupportSnapshot;
}> {
  const patientId = input.patientId.trim();
  const previous = await getPatientRecoverySupportConfig(patientId);
  const existing = await PatientRecoverySupportConfig.findOne({ patientId });
  const nextVersion = existing ? Math.max(existing.version ?? 1, 1) + 1 : 1;

  const updated = await PatientRecoverySupportConfig.findOneAndUpdate(
    { patientId },
    {
      $set: {
        checkinMode: input.checkinMode,
        nudgesEnabled: input.nudgesEnabled,
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
    current: mapRecoverySupportDocument(
      updated as Record<string, unknown>,
      patientId
    ),
  };
}
