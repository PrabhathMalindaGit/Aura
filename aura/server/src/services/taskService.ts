import Task, {
  TASK_PRIORITY_VALUES,
  TASK_STATUS_VALUES,
  TASK_TYPE_VALUES,
} from "../models/Task";

export type TaskType = (typeof TASK_TYPE_VALUES)[number];
export type TaskPriority = (typeof TASK_PRIORITY_VALUES)[number];
export type TaskStatus = (typeof TASK_STATUS_VALUES)[number];

export type TaskRecord = {
  id: string;
  patientId: string;
  title: string;
  description?: string;
  type: TaskType;
  priority: TaskPriority;
  status: TaskStatus;
  dueAt?: string;
  assignedTo?: string;
  createdBy: string;
  source?: {
    type?: string;
    entityType?: string;
    entityId?: string;
    label?: string;
  };
  linkedAlertId?: string;
  linkedAppointmentId?: string;
  linkedMessageId?: string;
  meta?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  cancelledAt?: string;
};

export type CreateTaskInput = {
  patientId: string;
  title: string;
  description?: string;
  type?: TaskType;
  priority?: TaskPriority;
  status?: Extract<TaskStatus, "open" | "in_progress">;
  dueAt?: Date | null;
  assignedTo?: string | null;
  createdBy: string;
  source?: {
    type?: string;
    entityType?: string;
    entityId?: string;
    label?: string;
  };
  linkedAlertId?: string;
  linkedAppointmentId?: string;
  linkedMessageId?: string;
  meta?: Record<string, unknown>;
};

export type UpdateTaskInput = {
  title?: string;
  description?: string | null;
  type?: TaskType;
  priority?: TaskPriority;
  status?: TaskStatus;
  dueAt?: Date | null;
  assignedTo?: string | null;
  source?: {
    type?: string;
    entityType?: string;
    entityId?: string;
    label?: string;
  };
  linkedAlertId?: string | null;
  linkedAppointmentId?: string | null;
  linkedMessageId?: string | null;
  meta?: Record<string, unknown>;
};

export type ListTasksFilters = {
  patientId?: string;
  status?: TaskStatus[];
  assignedTo?: string;
  dueFrom?: Date;
  dueTo?: Date;
  type?: TaskType[];
  sortBy?: "createdAt" | "dueAt" | "priority";
  sortDirection?: "asc" | "desc";
};

const PRIORITY_SORT_WEIGHT: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
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

function mapTask(task: Record<string, unknown>): TaskRecord {
  return {
    id: String(task._id ?? ""),
    patientId: toNonEmptyString(task.patientId) ?? "",
    title: toNonEmptyString(task.title) ?? "",
    description: toNonEmptyString(task.description),
    type: TASK_TYPE_VALUES.includes(task.type as TaskType)
      ? (task.type as TaskType)
      : "follow_up",
    priority: TASK_PRIORITY_VALUES.includes(task.priority as TaskPriority)
      ? (task.priority as TaskPriority)
      : "medium",
    status: TASK_STATUS_VALUES.includes(task.status as TaskStatus)
      ? (task.status as TaskStatus)
      : "open",
    dueAt: toIsoDate(task.dueAt),
    assignedTo: toNonEmptyString(task.assignedTo),
    createdBy: toNonEmptyString(task.createdBy) ?? "",
    source:
      task.source && typeof task.source === "object" && !Array.isArray(task.source)
        ? {
            type: toNonEmptyString((task.source as Record<string, unknown>).type),
            entityType: toNonEmptyString(
              (task.source as Record<string, unknown>).entityType
            ),
            entityId: toNonEmptyString((task.source as Record<string, unknown>).entityId),
            label: toNonEmptyString((task.source as Record<string, unknown>).label),
          }
        : undefined,
    linkedAlertId: toNonEmptyString(task.linkedAlertId),
    linkedAppointmentId: toNonEmptyString(task.linkedAppointmentId),
    linkedMessageId: toNonEmptyString(task.linkedMessageId),
    meta:
      task.meta && typeof task.meta === "object" && !Array.isArray(task.meta)
        ? (task.meta as Record<string, unknown>)
        : undefined,
    createdAt: toIsoDate(task.createdAt) ?? new Date(0).toISOString(),
    updatedAt: toIsoDate(task.updatedAt) ?? new Date(0).toISOString(),
    completedAt: toIsoDate(task.completedAt),
    cancelledAt: toIsoDate(task.cancelledAt),
  };
}

function normalizeTaskSortField(
  sortBy: ListTasksFilters["sortBy"]
): "createdAt" | "dueAt" | "priority" {
  return sortBy === "dueAt" || sortBy === "priority" ? sortBy : "createdAt";
}

function compareTasks(
  left: TaskRecord,
  right: TaskRecord,
  sortBy: "createdAt" | "dueAt" | "priority",
  sortDirection: "asc" | "desc"
): number {
  const direction = sortDirection === "asc" ? 1 : -1;

  if (sortBy === "priority") {
    const delta =
      PRIORITY_SORT_WEIGHT[left.priority] - PRIORITY_SORT_WEIGHT[right.priority];
    if (delta !== 0) {
      return delta * direction;
    }
    return (
      (Date.parse(left.createdAt) - Date.parse(right.createdAt)) * direction
    );
  }

  const leftValue =
    sortBy === "dueAt"
      ? Date.parse(left.dueAt ?? left.createdAt)
      : Date.parse(left.createdAt);
  const rightValue =
    sortBy === "dueAt"
      ? Date.parse(right.dueAt ?? right.createdAt)
      : Date.parse(right.createdAt);

  return (leftValue - rightValue) * direction;
}

function buildTaskFilter(filters: ListTasksFilters): Record<string, unknown> {
  const query: Record<string, unknown> = {};

  if (filters.patientId) {
    query.patientId = filters.patientId;
  }
  if (filters.assignedTo) {
    query.assignedTo = filters.assignedTo;
  }
  if (Array.isArray(filters.status) && filters.status.length > 0) {
    query.status = { $in: filters.status };
  }
  if (Array.isArray(filters.type) && filters.type.length > 0) {
    query.type = { $in: filters.type };
  }

  const dueAt: Record<string, Date> = {};
  if (filters.dueFrom) {
    dueAt.$gte = filters.dueFrom;
  }
  if (filters.dueTo) {
    dueAt.$lte = filters.dueTo;
  }
  if (Object.keys(dueAt).length > 0) {
    query.dueAt = dueAt;
  }

  return query;
}

export async function createTask(input: CreateTaskInput): Promise<TaskRecord> {
  const created = await Task.create({
    patientId: input.patientId,
    title: input.title,
    description: input.description,
    type: input.type ?? "follow_up",
    priority: input.priority ?? "medium",
    status: input.status ?? "open",
    dueAt: input.dueAt ?? null,
    assignedTo: input.assignedTo ?? undefined,
    createdBy: input.createdBy,
    source: input.source ?? { type: "manual" },
    linkedAlertId: input.linkedAlertId,
    linkedAppointmentId: input.linkedAppointmentId,
    linkedMessageId: input.linkedMessageId,
    meta: input.meta,
  });

  return mapTask(created.toObject());
}

export async function listTasks(filters: ListTasksFilters = {}): Promise<TaskRecord[]> {
  const sortBy = normalizeTaskSortField(filters.sortBy);
  const sortDirection = filters.sortDirection === "asc" ? "asc" : "desc";

  const rows = await Task.find(buildTaskFilter(filters)).lean();
  return rows
    .map((row) => mapTask(row as Record<string, unknown>))
    .sort((left, right) => compareTasks(left, right, sortBy, sortDirection));
}

export async function getTaskById(id: string): Promise<TaskRecord | null> {
  const row = await Task.findById(id).lean();
  if (!row) {
    return null;
  }
  return mapTask(row as Record<string, unknown>);
}

export async function updateTask(
  id: string,
  input: UpdateTaskInput
): Promise<TaskRecord | null> {
  const update: Record<string, unknown> = {};

  if (input.title !== undefined) {
    update.title = input.title;
  }
  if (input.description !== undefined) {
    update.description = input.description ?? undefined;
  }
  if (input.type !== undefined) {
    update.type = input.type;
  }
  if (input.priority !== undefined) {
    update.priority = input.priority;
  }
  if (input.status !== undefined) {
    update.status = input.status;
    if (input.status === "completed") {
      update.completedAt = new Date();
      update.cancelledAt = null;
    }
    if (input.status === "cancelled") {
      update.cancelledAt = new Date();
    }
    if (input.status === "open" || input.status === "in_progress") {
      update.completedAt = null;
      update.cancelledAt = null;
    }
  }
  if (input.dueAt !== undefined) {
    update.dueAt = input.dueAt ?? null;
  }
  if (input.assignedTo !== undefined) {
    update.assignedTo = input.assignedTo ?? undefined;
  }
  if (input.source !== undefined) {
    update.source = input.source ?? { type: "manual" };
  }
  if (input.linkedAlertId !== undefined) {
    update.linkedAlertId = input.linkedAlertId ?? undefined;
  }
  if (input.linkedAppointmentId !== undefined) {
    update.linkedAppointmentId = input.linkedAppointmentId ?? undefined;
  }
  if (input.linkedMessageId !== undefined) {
    update.linkedMessageId = input.linkedMessageId ?? undefined;
  }
  if (input.meta !== undefined) {
    update.meta = input.meta;
  }

  const task = await Task.findByIdAndUpdate(id, { $set: update }, { new: true }).lean();
  if (!task) {
    return null;
  }
  return mapTask(task as Record<string, unknown>);
}

export async function completeTask(id: string): Promise<TaskRecord | null> {
  const existing = await Task.findById(id);
  if (!existing) {
    return null;
  }

  if (existing.status !== "completed") {
    existing.status = "completed";
    existing.completedAt = new Date();
    existing.cancelledAt = null;
    await existing.save();
  }

  return mapTask(existing.toObject());
}

export async function assignTask(
  id: string,
  assignedTo: string | null
): Promise<TaskRecord | null> {
  const task = await Task.findByIdAndUpdate(
    id,
    {
      $set: {
        assignedTo: assignedTo ?? undefined,
      },
    },
    { new: true }
  ).lean();

  if (!task) {
    return null;
  }

  return mapTask(task as Record<string, unknown>);
}
