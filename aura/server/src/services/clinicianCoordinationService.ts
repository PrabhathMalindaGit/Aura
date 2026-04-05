import ClinicianCoordination, {
  COORDINATION_NOTE_HISTORY_LIMIT,
  COORDINATION_NEXT_STEP_VALUES,
} from "../models/ClinicianCoordination";

export type CoordinationNextStep =
  (typeof COORDINATION_NEXT_STEP_VALUES)[number];

export type CoordinationAuthorSnapshot = {
  clinicianId: string;
  displayName: string;
};

export type CoordinationFollowUpOwner =
  | { kind: "unassigned" }
  | {
      kind: "clinician";
      clinicianId: string;
      displayName: string;
    }
  | {
      kind: "custom";
      label: string;
    };

export type ClinicianCoordinationRecord = {
  patientId: string;
  currentHandoff: {
    summary: string;
    nextStep: CoordinationNextStep;
    followUpOwner: CoordinationFollowUpOwner;
    updatedBy: CoordinationAuthorSnapshot;
    updatedAt: string;
  } | null;
  noteHistory: Array<{
    id: string;
    text: string;
    createdBy: CoordinationAuthorSnapshot;
    createdAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
};

export type SaveCurrentHandoffInput = {
  patientId: string;
  summary?: string;
  nextStep?: CoordinationNextStep;
  followUpOwner?: CoordinationFollowUpOwner;
  updatedBy: CoordinationAuthorSnapshot;
};

export type AppendCoordinationNoteInput = {
  patientId: string;
  text: string;
  createdBy: CoordinationAuthorSnapshot;
};

function toNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function toIsoDate(value: unknown): string | undefined {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    return undefined;
  }

  return value.toISOString();
}

function mapAuthorSnapshot(value: unknown): CoordinationAuthorSnapshot {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  return {
    clinicianId: toNonEmptyString(record.clinicianId) ?? "",
    displayName: toNonEmptyString(record.displayName) ?? "",
  };
}

function mapFollowUpOwner(value: unknown): CoordinationFollowUpOwner {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const kind = record.kind;

  if (kind === "clinician") {
    return {
      kind: "clinician",
      clinicianId: toNonEmptyString(record.clinicianId) ?? "",
      displayName: toNonEmptyString(record.displayName) ?? "",
    };
  }

  if (kind === "custom") {
    return {
      kind: "custom",
      label: toNonEmptyString(record.label) ?? "",
    };
  }

  return { kind: "unassigned" };
}

function mapCoordinationRecord(
  record: Record<string, unknown>
): ClinicianCoordinationRecord {
  const currentHandoffRecord =
    record.currentHandoff &&
    typeof record.currentHandoff === "object" &&
    !Array.isArray(record.currentHandoff)
      ? (record.currentHandoff as Record<string, unknown>)
      : null;
  const noteHistoryRows = Array.isArray(record.noteHistory)
    ? record.noteHistory
    : [];

  return {
    patientId: toNonEmptyString(record.patientId) ?? "",
    currentHandoff: currentHandoffRecord
      ? {
          summary: typeof currentHandoffRecord.summary === "string"
            ? currentHandoffRecord.summary
            : "",
          nextStep: COORDINATION_NEXT_STEP_VALUES.includes(
            currentHandoffRecord.nextStep as CoordinationNextStep
          )
            ? (currentHandoffRecord.nextStep as CoordinationNextStep)
            : "monitoring",
          followUpOwner: mapFollowUpOwner(currentHandoffRecord.followUpOwner),
          updatedBy: mapAuthorSnapshot(currentHandoffRecord.updatedBy),
          updatedAt:
            toIsoDate(currentHandoffRecord.updatedAt) ??
            new Date(0).toISOString(),
        }
      : null,
    noteHistory: noteHistoryRows
      .map((item) => {
        const noteRecord =
          item && typeof item === "object" && !Array.isArray(item)
            ? (item as Record<string, unknown>)
            : {};

        return {
          id: toNonEmptyString(noteRecord.id) ?? "",
          text: typeof noteRecord.text === "string" ? noteRecord.text : "",
          createdBy: mapAuthorSnapshot(noteRecord.createdBy),
          createdAt:
            toIsoDate(noteRecord.createdAt) ?? new Date(0).toISOString(),
        };
      })
      .filter(
        (item) =>
          item.id.length > 0 &&
          item.text.length > 0 &&
          item.createdBy.clinicianId.length > 0 &&
          item.createdBy.displayName.length > 0
      ),
    createdAt: toIsoDate(record.createdAt) ?? new Date(0).toISOString(),
    updatedAt: toIsoDate(record.updatedAt) ?? new Date(0).toISOString(),
  };
}

function normalizeFollowUpOwner(
  value: CoordinationFollowUpOwner | undefined
): CoordinationFollowUpOwner {
  if (!value || value.kind === "unassigned") {
    return { kind: "unassigned" };
  }

  if (value.kind === "custom") {
    return {
      kind: "custom",
      label: value.label.trim(),
    };
  }

  return {
    kind: "clinician",
    clinicianId: value.clinicianId.trim(),
    displayName: value.displayName.trim(),
  };
}

function isBlankCurrentHandoff(input: {
  summary: string;
  nextStep: CoordinationNextStep;
  followUpOwner: CoordinationFollowUpOwner;
}): boolean {
  return (
    input.summary.length === 0 &&
    input.nextStep === "monitoring" &&
    input.followUpOwner.kind === "unassigned"
  );
}

export async function getClinicianCoordinationByPatient(
  patientId: string
): Promise<ClinicianCoordinationRecord | null> {
  const row = await ClinicianCoordination.findOne({ patientId }).lean();
  if (!row) {
    return null;
  }

  return mapCoordinationRecord(row as Record<string, unknown>);
}

export async function saveClinicianCurrentHandoff(
  input: SaveCurrentHandoffInput
): Promise<ClinicianCoordinationRecord | null> {
  const summary = (input.summary ?? "").trim();
  const nextStep = input.nextStep ?? "monitoring";
  const followUpOwner = normalizeFollowUpOwner(input.followUpOwner);
  const shouldClear = isBlankCurrentHandoff({
    summary,
    nextStep,
    followUpOwner,
  });

  let coordination = await ClinicianCoordination.findOne({
    patientId: input.patientId,
  });

  if (!coordination) {
    if (shouldClear) {
      return null;
    }

    coordination = new ClinicianCoordination({
      patientId: input.patientId,
      noteHistory: [],
    });
  }

  if (shouldClear) {
    coordination.currentHandoff = undefined;

    if (!Array.isArray(coordination.noteHistory) || coordination.noteHistory.length === 0) {
      await coordination.deleteOne();
      return null;
    }

    await coordination.save();
    return mapCoordinationRecord(
      coordination.toObject() as Record<string, unknown>
    );
  }

  coordination.currentHandoff = {
    summary,
    nextStep,
    followUpOwner,
    updatedBy: input.updatedBy,
    updatedAt: new Date(),
  };

  await coordination.save();
  return mapCoordinationRecord(coordination.toObject() as Record<string, unknown>);
}

export async function appendClinicianCoordinationNote(
  input: AppendCoordinationNoteInput
): Promise<ClinicianCoordinationRecord> {
  let coordination = await ClinicianCoordination.findOne({
    patientId: input.patientId,
  });

  if (!coordination) {
    coordination = new ClinicianCoordination({
      patientId: input.patientId,
      noteHistory: [],
    });
  }

  const existingNotes = Array.isArray(coordination.noteHistory)
    ? coordination.noteHistory.map((note) => ({
        id: note.id,
        text: note.text,
        createdBy: note.createdBy,
        createdAt: note.createdAt,
      }))
    : [];

  coordination.set(
    "noteHistory",
    [
      {
        text: input.text.trim(),
        createdBy: input.createdBy,
        createdAt: new Date(),
      },
      ...existingNotes,
    ].slice(0, COORDINATION_NOTE_HISTORY_LIMIT)
  );

  await coordination.save();
  return mapCoordinationRecord(coordination.toObject() as Record<string, unknown>);
}
