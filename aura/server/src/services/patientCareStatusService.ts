import Patient from "../models/Patient";

export type PatientStatusValue = "active" | "on_hold" | "discharged" | "inactive";

export type PatientActorSnapshot = {
  clinicianId: string;
  name?: string;
};

export type PatientDischargeSnapshot = {
  dischargedAt?: string;
  dischargedBy?: PatientActorSnapshot;
  independentModeEnabled: boolean;
  summary?: string;
  contactInstructions?: string;
  reactivatedAt?: string;
  reactivatedBy?: PatientActorSnapshot;
  lastExportedAt?: string;
  lastExportedBy?: PatientActorSnapshot;
};

export type PatientCareStatusSnapshot = {
  patientId: string;
  displayName?: string;
  status: PatientStatusValue;
  clinicianId?: string;
  discharge?: PatientDischargeSnapshot;
};

export type PatientAccessGate = {
  allowed: boolean;
  message?: string;
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

function mapActor(value: unknown): PatientActorSnapshot | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const clinicianId = toTrimmedString(record.clinicianId);
  if (!clinicianId) {
    return undefined;
  }

  return {
    clinicianId,
    name: toTrimmedString(record.name),
  };
}

export function mapPatientCareStatus(
  patient:
    | {
        patientId?: unknown;
        displayName?: unknown;
        status?: unknown;
        clinicianId?: unknown;
        discharge?: unknown;
      }
    | null
    | undefined,
  patientIdFallback = ""
): PatientCareStatusSnapshot {
  const patientId =
    toTrimmedString(patient?.patientId) ?? patientIdFallback.trim() ?? "";
  const dischargeRecord =
    patient?.discharge && typeof patient.discharge === "object" && !Array.isArray(patient.discharge)
      ? (patient.discharge as Record<string, unknown>)
      : null;

  const discharge = dischargeRecord
    ? {
        dischargedAt: toIsoString(dischargeRecord.dischargedAt),
        dischargedBy: mapActor(dischargeRecord.dischargedBy),
        independentModeEnabled: dischargeRecord.independentModeEnabled === true,
        summary: toTrimmedString(dischargeRecord.summary),
        contactInstructions: toTrimmedString(dischargeRecord.contactInstructions),
        reactivatedAt: toIsoString(dischargeRecord.reactivatedAt),
        reactivatedBy: mapActor(dischargeRecord.reactivatedBy),
        lastExportedAt: toIsoString(dischargeRecord.lastExportedAt),
        lastExportedBy: mapActor(dischargeRecord.lastExportedBy),
      }
    : undefined;

  return {
    patientId,
    displayName: toTrimmedString(patient?.displayName),
    status:
      patient?.status === "on_hold" ||
      patient?.status === "discharged" ||
      patient?.status === "inactive"
        ? patient.status
        : "active",
    clinicianId: toTrimmedString(patient?.clinicianId),
    discharge,
  };
}

export async function getPatientCareStatus(
  patientId: string
): Promise<PatientCareStatusSnapshot> {
  const normalizedPatientId = patientId.trim();
  if (!normalizedPatientId) {
    return mapPatientCareStatus(null, "");
  }

  const patient = await Patient.findOne({ patientId: normalizedPatientId }).lean();
  return mapPatientCareStatus(
    patient as Record<string, unknown> | null,
    normalizedPatientId
  );
}

export function isIndependentModeEnabled(
  patient: PatientCareStatusSnapshot | null | undefined
): boolean {
  return patient?.status === "discharged" && patient.discharge?.independentModeEnabled === true;
}

export function getCheckinAccessGate(
  patient: PatientCareStatusSnapshot | null | undefined
): PatientAccessGate {
  if (!patient || patient.status === "active" || patient.status === "on_hold") {
    return { allowed: true };
  }

  if (patient.status === "discharged" && patient.discharge?.independentModeEnabled === true) {
    return { allowed: true };
  }

  if (patient.status === "discharged") {
    return {
      allowed: false,
      message:
        "Check-ins are no longer being sent to your care team. You can still review your recovery progress.",
    };
  }

  return {
    allowed: false,
    message:
      "Active recovery tracking is no longer available for this account.",
  };
}

export function getChatAccessGate(
  patient: PatientCareStatusSnapshot | null | undefined
): PatientAccessGate {
  if (!patient || patient.status === "active" || patient.status === "on_hold") {
    return { allowed: true };
  }

  if (patient.status === "discharged") {
    return {
      allowed: false,
      message:
        "Messages are read-only after discharge. If you need new care, contact your clinic directly.",
    };
  }

  return {
    allowed: false,
    message: "Messages are no longer available for this account.",
  };
}

export function getExerciseAccessGate(
  patient: PatientCareStatusSnapshot | null | undefined
): PatientAccessGate {
  if (!patient || patient.status === "active" || patient.status === "on_hold") {
    return { allowed: true };
  }

  return {
    allowed: false,
    message:
      "Exercise plans are read-only in this care state. Historical plans remain available to review.",
  };
}
