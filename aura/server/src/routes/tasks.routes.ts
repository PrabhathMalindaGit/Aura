import { Router } from "express";
import { Types } from "mongoose";
import { z } from "zod";

import {
  TASK_PRIORITY_VALUES,
  TASK_STATUS_VALUES,
  TASK_TYPE_VALUES,
} from "../models/Task";
import {
  linkTaskToCommunicationReview,
  resolveCommunicationReview,
} from "../services/communicationReviewService";
import {
  assignTask,
  completeTask,
  createTask,
  getTaskById,
  listTasks,
  updateTask,
} from "../services/taskService";
import type { RequestWithUser } from "../types/auth";

const router = Router();

const csvEnumArray = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess((value) => {
    if (Array.isArray(value)) {
      return value.flatMap((entry) =>
        typeof entry === "string"
          ? entry
              .split(",")
              .map((part) => part.trim())
              .filter(Boolean)
          : []
      );
    }

    if (typeof value === "string") {
      return value
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
    }

    return value;
  }, z.array(z.enum(values)).optional());

const taskSourceSchema = z
  .object({
    type: z.string().trim().min(1).max(80).optional(),
    entityType: z.string().trim().min(1).max(80).optional(),
    entityId: z.string().trim().min(1).max(120).optional(),
    label: z.string().trim().min(1).max(160).optional(),
  })
  .optional();

const createTaskSchema = z.object({
  patientId: z.string().trim().min(1),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional(),
  type: z.enum(TASK_TYPE_VALUES).optional(),
  priority: z.enum(TASK_PRIORITY_VALUES).optional(),
  status: z.enum(["open", "in_progress"]).optional(),
  dueAt: z.string().trim().optional(),
  assignedTo: z.union([z.string().trim().min(1), z.null()]).optional(),
  source: taskSourceSchema,
  linkedAlertId: z.string().trim().min(1).optional(),
  linkedAppointmentId: z.string().trim().min(1).optional(),
  linkedMessageId: z.string().trim().min(1).optional(),
  meta: z.record(z.unknown()).optional(),
});

const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(160).optional(),
    description: z.union([z.string().trim().max(2000), z.null()]).optional(),
    type: z.enum(TASK_TYPE_VALUES).optional(),
    priority: z.enum(TASK_PRIORITY_VALUES).optional(),
    status: z.enum(TASK_STATUS_VALUES).optional(),
    dueAt: z.union([z.string().trim(), z.null()]).optional(),
    assignedTo: z.union([z.string().trim().min(1), z.null()]).optional(),
    source: taskSourceSchema,
    linkedAlertId: z.union([z.string().trim().min(1), z.null()]).optional(),
    linkedAppointmentId: z.union([z.string().trim().min(1), z.null()]).optional(),
    linkedMessageId: z.union([z.string().trim().min(1), z.null()]).optional(),
    meta: z.record(z.unknown()).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    path: ["body"],
    message: "At least one field must be provided",
  });

const listTasksQuerySchema = z.object({
  patientId: z.string().trim().min(1).optional(),
  status: csvEnumArray(TASK_STATUS_VALUES),
  assignedTo: z.string().trim().min(1).optional(),
  dueFrom: z.string().trim().optional(),
  dueTo: z.string().trim().optional(),
  type: csvEnumArray(TASK_TYPE_VALUES),
  sortBy: z.enum(["createdAt", "dueAt", "priority"]).optional().default("createdAt"),
  sortDirection: z.enum(["asc", "desc"]).optional().default("desc"),
});

function parseIsoDateTime(
  value: string | undefined | null,
  path: string,
  details: Array<{ path: string; message: string }>
): Date | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value === "") {
    return null;
  }

  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    details.push({
      path,
      message: `${path} must be a valid ISO datetime string`,
    });
    return undefined;
  }

  return parsed;
}

function isObjectId(value: string): boolean {
  return Types.ObjectId.isValid(value);
}

router.get("/clinician/tasks", async (req, res) => {
  const requestWithUser = req as RequestWithUser;
  if (!requestWithUser.user) {
    return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  }

  const parsedQuery = listTasksQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    return res.status(400).json({
      ok: false,
      error: "VALIDATION_ERROR",
      details: parsedQuery.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }

  const details: Array<{ path: string; message: string }> = [];
  const dueFrom = parseIsoDateTime(parsedQuery.data.dueFrom, "dueFrom", details);
  const dueTo = parseIsoDateTime(parsedQuery.data.dueTo, "dueTo", details);
  if (dueFrom instanceof Date && dueTo instanceof Date && dueFrom.getTime() > dueTo.getTime()) {
    details.push({
      path: "dueFrom",
      message: "dueFrom must be earlier than or equal to dueTo",
    });
  }

  if (details.length > 0) {
    return res.status(400).json({
      ok: false,
      error: "VALIDATION_ERROR",
      details,
    });
  }

  const tasks = await listTasks({
    patientId: parsedQuery.data.patientId,
    status: parsedQuery.data.status,
    assignedTo: parsedQuery.data.assignedTo,
    dueFrom: dueFrom instanceof Date ? dueFrom : undefined,
    dueTo: dueTo instanceof Date ? dueTo : undefined,
    type: parsedQuery.data.type,
    sortBy: parsedQuery.data.sortBy,
    sortDirection: parsedQuery.data.sortDirection,
  });

  return res.json({
    ok: true,
    tasks,
  });
});

router.post("/clinician/tasks", async (req, res) => {
  const requestWithUser = req as RequestWithUser;
  if (!requestWithUser.user) {
    return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  }

  const parsedBody = createTaskSchema.safeParse(req.body);
  if (!parsedBody.success) {
    return res.status(400).json({
      ok: false,
      error: "VALIDATION_ERROR",
      details: parsedBody.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }

  const details: Array<{ path: string; message: string }> = [];
  const dueAt = parseIsoDateTime(parsedBody.data.dueAt, "dueAt", details);
  if (details.length > 0) {
    return res.status(400).json({
      ok: false,
      error: "VALIDATION_ERROR",
      details,
    });
  }

  const task = await createTask({
    patientId: parsedBody.data.patientId,
    title: parsedBody.data.title,
    description: parsedBody.data.description,
    type: parsedBody.data.type,
    priority: parsedBody.data.priority,
    status: parsedBody.data.status,
    dueAt: dueAt instanceof Date ? dueAt : undefined,
    assignedTo: parsedBody.data.assignedTo,
    createdBy: requestWithUser.user.id,
    source: parsedBody.data.source,
    linkedAlertId: parsedBody.data.linkedAlertId,
    linkedAppointmentId: parsedBody.data.linkedAppointmentId,
    linkedMessageId: parsedBody.data.linkedMessageId,
    meta: parsedBody.data.meta,
  });

  if (task.linkedMessageId) {
    await linkTaskToCommunicationReview(task.linkedMessageId, task.id);
  }

  return res.status(201).json({
    ok: true,
    task,
  });
});

router.patch("/clinician/tasks/:id", async (req, res) => {
  const requestWithUser = req as RequestWithUser;
  if (!requestWithUser.user) {
    return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  }

  const taskId = String(req.params.id ?? "");
  if (!isObjectId(taskId)) {
    return res.status(400).json({
      ok: false,
      error: "VALIDATION_ERROR",
      details: [{ path: "id", message: "id must be a valid task id" }],
    });
  }

  const parsedBody = updateTaskSchema.safeParse(req.body);
  if (!parsedBody.success) {
    return res.status(400).json({
      ok: false,
      error: "VALIDATION_ERROR",
      details: parsedBody.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }

  const details: Array<{ path: string; message: string }> = [];
  const dueAt = parseIsoDateTime(parsedBody.data.dueAt, "dueAt", details);
  if (details.length > 0) {
    return res.status(400).json({
      ok: false,
      error: "VALIDATION_ERROR",
      details,
    });
  }

  const nextAssignedTo =
    parsedBody.data.assignedTo !== undefined
      ? parsedBody.data.assignedTo
      : undefined;
  const nextStatus = parsedBody.data.status;

  const task =
    nextAssignedTo !== undefined && Object.keys(parsedBody.data).length === 1
      ? await assignTask(taskId, nextAssignedTo)
      : await updateTask(taskId, {
          ...parsedBody.data,
          dueAt,
        });

  if (!task) {
    return res.status(404).json({ ok: false, error: "NOT_FOUND" });
  }

  if (task.linkedMessageId) {
    if (nextStatus === "completed" || task.status === "completed") {
      await resolveCommunicationReview(task.linkedMessageId);
    } else {
      await linkTaskToCommunicationReview(task.linkedMessageId, task.id);
    }
  }

  return res.json({
    ok: true,
    task,
  });
});

router.post("/clinician/tasks/:id/complete", async (req, res) => {
  const requestWithUser = req as RequestWithUser;
  if (!requestWithUser.user) {
    return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  }

  const taskId = String(req.params.id ?? "");
  if (!isObjectId(taskId)) {
    return res.status(400).json({
      ok: false,
      error: "VALIDATION_ERROR",
      details: [{ path: "id", message: "id must be a valid task id" }],
    });
  }

  const existingTask = await getTaskById(taskId);
  if (!existingTask) {
    return res.status(404).json({ ok: false, error: "NOT_FOUND" });
  }

  const task = await completeTask(taskId);
  if (!task) {
    return res.status(404).json({ ok: false, error: "NOT_FOUND" });
  }

  if (existingTask.linkedMessageId || task.linkedMessageId) {
    await resolveCommunicationReview(existingTask.linkedMessageId ?? task.linkedMessageId ?? "");
  }

  return res.json({
    ok: true,
    task,
  });
});

export default router;
