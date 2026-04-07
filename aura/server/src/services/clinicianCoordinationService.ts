import ClinicianCoordination, {
  COORDINATION_NOTE_HISTORY_LIMIT,
  COORDINATION_NEXT_STEP_VALUES,
} from "../models/ClinicianCoordination";
import { getTaskById, type TaskRecord } from "./taskService";
import { isObjectId } from "../utils/ids";

export type CoordinationNextStep =
  (typeof COORDINATION_NEXT_STEP_VALUES)[number];

export type CoordinationAuthorSnapshot = {
  clinicianId: string;
  displayName: string;
};

export type CoordinationLinkedTaskSummary = Pick<
  TaskRecord,
  | "id"
  | "title"
  | "type"
  | "priority"
  | "status"
  | "dueAt"
  | "assignedTo"
  | "source"
  | "updatedAt"
>;

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
    linkedTaskId?: string;
    linkedTask?: CoordinationLinkedTaskSummary | null;
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
  linkedTaskId?: string | null;
  updatedBy: CoordinationAuthorSnapshot;
};

export type AppendCoordinationNoteInput = {
  patientId: string;
  text: string;
  createdBy: CoordinationAuthorSnapshot;
};

export class ClinicianCoordinationValidationError extends Error {
  readonly code = "VALIDATION_ERROR";
  readonly path: string;

  constructor(path: string, message: string) {
    super(message);
    this.name = "ClinicianCoordinationValidationError";
    this.path = path;
  }
}

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

function mapLinkedTaskSummary(task: TaskRecord): CoordinationLinkedTaskSummary {
  return {
    id: task.id,
    title: task.title,
    type: task.type,
    priority: task.priority,
    status: task.status,
    dueAt: task.dueAt,
    assignedTo: task.assignedTo,
    source: task.source,
    updatedAt: task.updatedAt,
  };
}

async function resolveLinkedTaskSummary(params: {
  patientId: string;
  linkedTaskId?: string;
}): Promise<CoordinationLinkedTaskSummary | null> {
  if (!params.linkedTaskId || !isObjectId(params.linkedTaskId)) {
    return null;
  }

  const task = await getTaskById(params.linkedTaskId);
  if (!task || task.patientId !== params.patientId) {
    return null;
  }

  return mapLinkedTaskSummary(task);
}

async function assertLinkedTaskBelongsToPatient(params: {
  patientId: string;
  linkedTaskId?: string;
}): Promise<string | undefined> {
  if (!params.linkedTaskId) {
    return undefined;
  }

  if (!isObjectId(params.linkedTaskId)) {
    throw new ClinicianCoordinationValidationError(
      "linkedTaskId",
      "linkedTaskId must reference an existing task."
    );
  }

  const task = await getTaskById(params.linkedTaskId);
  if (!task) {
    throw new ClinicianCoordinationValidationError(
      "linkedTaskId",
      "linkedTaskId must reference an existing task."
    );
  }

  if (task.patientId !== params.patientId) {
    throw new ClinicianCoordinationValidationError(
      "linkedTaskId",
      "linkedTaskId must reference a task for this patient."
    );
  }

  return task.id;
}

async function mapCoordinationRecord(
  record: Record<string, unknown>
): Promise<ClinicianCoordinationRecord> {
  const currentHandoffRecord =
    record.currentHandoff &&
    typeof record.currentHandoff === "object" &&
    !Array.isArray(record.currentHandoff)
      ? (record.currentHandoff as Record<string, unknown>)
      : null;
  const noteHistoryRows = Array.isArray(record.noteHistory)
    ? record.noteHistory
    : [];
  const patientId = toNonEmptyString(record.patientId) ?? "";
  const linkedTaskId = currentHandoffRecord
    ? toNonEmptyString(currentHandoffRecord.linkedTaskId)
    : undefined;
  const linkedTask = currentHandoffRecord
    ? await resolveLinkedTaskSummary({
        patientId,
        linkedTaskId,
      })
    : null;

  return {
    patientId,
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
          linkedTaskId,
          linkedTask: linkedTaskId ? linkedTask : undefined,
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
  linkedTaskId?: string;
}): boolean {
  return (
    input.summary.length === 0 &&
    input.nextStep === "monitoring" &&
    input.followUpOwner.kind === "unassigned" &&
    !input.linkedTaskId
  );
}

export async function getClinicianCoordinationByPatient(
  patientId: string
): Promise<ClinicianCoordinationRecord | null> {
  const row = await ClinicianCoordination.findOne({ patientId }).lean();
  if (!row) {
    return null;
  }

  return await mapCoordinationRecord(row as Record<string, unknown>);
}

export async function saveClinicianCurrentHandoff(
  input: SaveCurrentHandoffInput
): Promise<ClinicianCoordinationRecord | null> {
  const summary = (input.summary ?? "").trim();
  const nextStep = input.nextStep ?? "monitoring";
  const followUpOwner = normalizeFollowUpOwner(input.followUpOwner);
  const linkedTaskId = await assertLinkedTaskBelongsToPatient({
    patientId: input.patientId,
    linkedTaskId: toNonEmptyString(input.linkedTaskId),
  });
  const shouldClear = isBlankCurrentHandoff({
    summary,
    nextStep,
    followUpOwner,
    linkedTaskId,
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
    return await mapCoordinationRecord(
      coordination.toObject() as Record<string, unknown>
    );
  }

  coordination.currentHandoff = {
    summary,
    nextStep,
    followUpOwner,
    linkedTaskId,
    updatedBy: input.updatedBy,
    updatedAt: new Date(),
  };

  await coordination.save();
  return await mapCoordinationRecord(coordination.toObject() as Record<string, unknown>);
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
  return await mapCoordinationRecord(coordination.toObject() as Record<string, unknown>);
}
