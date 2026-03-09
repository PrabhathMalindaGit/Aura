import { apiFetchJson } from "@/src/api/client";
import type {
  PatientTaskActionHint,
  PatientTaskItem,
  PatientTaskPriority,
  PatientTaskStatus,
  PatientTaskType,
} from "@/src/types/task";

function toTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeActionHint(value: unknown): PatientTaskActionHint | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as {
    kind?: unknown;
    label?: unknown;
  };
  const kind = toTrimmedString(record.kind);
  if (!kind) {
    return undefined;
  }

  return {
    kind,
    label: toTrimmedString(record.label),
  };
}

function normalizeTask(value: unknown): PatientTaskItem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as {
    id?: unknown;
    title?: unknown;
    description?: unknown;
    type?: unknown;
    priority?: unknown;
    status?: unknown;
    dueAt?: unknown;
    createdAt?: unknown;
    updatedAt?: unknown;
    completedAt?: unknown;
    cancelledAt?: unknown;
    sourceLabel?: unknown;
    linkedAppointmentId?: unknown;
    linkedMessageId?: unknown;
    patientCompletable?: unknown;
    patientAction?: unknown;
  };

  const id = toTrimmedString(record.id);
  const title = toTrimmedString(record.title);
  const createdAt = toTrimmedString(record.createdAt);
  const updatedAt = toTrimmedString(record.updatedAt);
  const type =
    record.type === "follow_up" ||
    record.type === "appointment" ||
    record.type === "safety_review" ||
    record.type === "adherence_review" ||
    record.type === "communication" ||
    record.type === "custom"
      ? (record.type as PatientTaskType)
      : null;
  const priority =
    record.priority === "low" ||
    record.priority === "medium" ||
    record.priority === "high" ||
    record.priority === "urgent"
      ? (record.priority as PatientTaskPriority)
      : null;
  const status =
    record.status === "open" ||
    record.status === "in_progress" ||
    record.status === "completed" ||
    record.status === "cancelled"
      ? (record.status as PatientTaskStatus)
      : null;

  if (!id || !title || !createdAt || !updatedAt || !type || !priority || !status) {
    return null;
  }

  return {
    id,
    title,
    description: toTrimmedString(record.description),
    type,
    priority,
    status,
    dueAt: toTrimmedString(record.dueAt),
    createdAt,
    updatedAt,
    completedAt: toTrimmedString(record.completedAt),
    cancelledAt: toTrimmedString(record.cancelledAt),
    sourceLabel: toTrimmedString(record.sourceLabel),
    linkedAppointmentId: toTrimmedString(record.linkedAppointmentId),
    linkedMessageId: toTrimmedString(record.linkedMessageId),
    patientCompletable: record.patientCompletable === true,
    patientAction: normalizeActionHint(record.patientAction),
  };
}

export async function listPatientTasks(
  token: string,
  params: {
    status?: PatientTaskStatus[];
    limit?: number;
  } = {},
): Promise<PatientTaskItem[]> {
  const query = new URLSearchParams();
  if (Array.isArray(params.status) && params.status.length > 0) {
    query.set("status", params.status.join(","));
  }
  if (typeof params.limit === "number" && Number.isFinite(params.limit)) {
    query.set("limit", String(Math.max(1, Math.trunc(params.limit))));
  }

  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  const payload = await apiFetchJson<{ items?: unknown }>(`/patient/tasks${suffix}`, {
    method: "GET",
    token,
  });

  const items = Array.isArray(payload?.items) ? payload.items : [];
  return items
    .map((item) => normalizeTask(item))
    .filter((item): item is PatientTaskItem => Boolean(item));
}

export async function completePatientTask(
  token: string,
  taskId: string,
): Promise<PatientTaskItem> {
  const payload = await apiFetchJson<{ item?: unknown }>(
    `/patient/tasks/${encodeURIComponent(taskId)}/complete`,
    {
      method: "POST",
      token,
    },
  );

  const item = normalizeTask(payload.item);
  if (!item) {
    throw {
      title: "Unexpected response",
      message: "Could not parse the completed task response.",
      kind: "unknown",
      retryable: false,
    };
  }

  return item;
}
