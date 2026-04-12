import { Router } from "express";
import { Types } from "mongoose";
import { z } from "zod";

import { requirePatientAuth } from "../middleware/patientAuth";
import {
  TASK_PRIORITY_VALUES,
  TASK_STATUS_VALUES,
  TASK_TYPE_VALUES,
} from "../models/Task";
import {
  linkTaskToCommunicationReview,
  recordCommunicationReview,
  requestCommunicationFollowUp,
  resolveCommunicationReview,
} from "../services/communicationReviewService";
import {
  recordFollowUpRequestedEvent,
  recordResolvedNoFollowUpEvent,
  recordReviewRecordedEvent,
} from "../services/communicationEventService";
import { getTrustedPatientMessageContext } from "../services/communicationTruthService";
import {
  assignTask,
  completeTask,
  createTask,
  getTaskById,
  listTasks,
  updateTask,
} from "../services/taskService";
import type { RequestWithUser } from "../types/auth";
import type { RequestWithPatient } from "../types/patientAuth";

const router = Router();
const MAX_LIMIT = 100;

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

const patientTasksQuerySchema = z.object({
  status: csvEnumArray(TASK_STATUS_VALUES),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).optional().default(50),
});

function cleanString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function extractPatientAction(meta: unknown):
  | {
      kind: string;
      label?: string;
    }
  | undefined {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return undefined;
  }

  const action = (meta as Record<string, unknown>).patientAction;
  if (!action || typeof action !== "object" || Array.isArray(action)) {
    return undefined;
  }

  const kind = cleanString((action as Record<string, unknown>).kind);
  if (!kind) {
    return undefined;
  }

  return {
    kind,
    label: cleanString((action as Record<string, unknown>).label),
  };
}

function mapPatientTask(task: Awaited<ReturnType<typeof getTaskById>> extends infer T
  ? T extends null
    ? never
    : T
  : never) {
  const meta =
    task.meta && typeof task.meta === "object" && !Array.isArray(task.meta)
      ? task.meta
      : undefined;

  return {
    id: task.id,
    title: task.title,
    description: task.description,
    type: task.type,
    priority: task.priority,
    status: task.status,
    dueAt: task.dueAt,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    completedAt: task.completedAt,
    cancelledAt: task.cancelledAt,
    sourceLabel: cleanString(task.source?.label),
    linkedAppointmentId: task.linkedAppointmentId,
    linkedMessageId: task.linkedMessageId,
    patientCompletable: meta?.patientCompletable === true,
    patientAction: extractPatientAction(meta),
  };
}

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

function toClinicianActor(requestWithUser: RequestWithUser) {
  return {
    clinicianId: requestWithUser.user?.id ?? "",
    displayName: requestWithUser.user?.name ?? requestWithUser.user?.id,
  };
}

router.get("/patient/tasks", requirePatientAuth, async (req, res) => {
  const requestWithPatient = req as RequestWithPatient;
  const patientId = requestWithPatient.patient?.id;
  if (!patientId) {
    return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  }

  const parsedQuery = patientTasksQuerySchema.safeParse(req.query);
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

  const statuses =
    parsedQuery.data.status && parsedQuery.data.status.length > 0
      ? parsedQuery.data.status
      : (["open", "in_progress"] as const);

  const tasks = await listTasks({
    patientId,
    status: [...statuses],
    sortBy: "dueAt",
    sortDirection: "asc",
  });

  return res.json({
    ok: true,
    items: tasks.slice(0, parsedQuery.data.limit).map((task) => mapPatientTask(task)),
  });
});

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
    const trustedMessage = await getTrustedPatientMessageContext({
      patientId: task.patientId,
      messageId: task.linkedMessageId,
    });
    if (trustedMessage) {
      const actor = toClinicianActor(requestWithUser);
      await Promise.all([
        linkTaskToCommunicationReview(trustedMessage.messageId, task.id),
        requestCommunicationFollowUp(trustedMessage.messageId, {
          taskId: task.id,
        }),
        recordFollowUpRequestedEvent({
          patientId: task.patientId,
          messageId: trustedMessage.messageId,
          actor: {
            actorType: "clinician",
            actorId: actor.clinicianId,
            actorDisplayName: actor.displayName,
          },
          sourceSurface: "clinician_task_create",
          sourceRecordId: task.id,
        }),
        recordCommunicationReview(trustedMessage.messageId, actor),
        recordReviewRecordedEvent({
          patientId: task.patientId,
          messageId: trustedMessage.messageId,
          actor: {
            actorType: "clinician",
            actorId: actor.clinicianId,
            actorDisplayName: actor.displayName,
          },
          sourceSurface: "clinician_task_create",
          sourceRecordId: task.id,
        }),
      ]);
    }
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
  const existingTask = await getTaskById(taskId);
  if (!existingTask) {
    return res.status(404).json({ ok: false, error: "NOT_FOUND" });
  }

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
    const trustedMessage = await getTrustedPatientMessageContext({
      patientId: task.patientId,
      messageId: task.linkedMessageId,
    });
    if (trustedMessage) {
      const actor = toClinicianActor(requestWithUser);
      if (nextStatus === "completed" || task.status === "completed") {
        await Promise.all([
          resolveCommunicationReview(trustedMessage.messageId, {
            resolvedBy: actor,
          }),
          recordResolvedNoFollowUpEvent({
            patientId: task.patientId,
            messageId: trustedMessage.messageId,
            actor: {
              actorType: "clinician",
              actorId: actor.clinicianId,
              actorDisplayName: actor.displayName,
            },
            sourceSurface: "clinician_task_complete",
            sourceRecordId: task.id,
          }),
        ]);
      } else {
        await Promise.all([
          linkTaskToCommunicationReview(trustedMessage.messageId, task.id),
          requestCommunicationFollowUp(trustedMessage.messageId, {
            taskId: task.id,
          }),
          recordFollowUpRequestedEvent({
            patientId: task.patientId,
            messageId: trustedMessage.messageId,
            actor: {
              actorType: "clinician",
              actorId: actor.clinicianId,
              actorDisplayName: actor.displayName,
            },
            sourceSurface: "clinician_task_update",
            sourceRecordId: task.id,
          }),
        ]);

        const transitionedToInProgress =
          existingTask.status !== "in_progress" && task.status === "in_progress";
        if (transitionedToInProgress) {
          await Promise.all([
            recordCommunicationReview(trustedMessage.messageId, actor),
            recordReviewRecordedEvent({
              patientId: task.patientId,
              messageId: trustedMessage.messageId,
              actor: {
                actorType: "clinician",
                actorId: actor.clinicianId,
                actorDisplayName: actor.displayName,
              },
              sourceSurface: "clinician_task_start",
              sourceRecordId: task.id,
            }),
          ]);
        }
      }
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
    const linkedMessageId =
      existingTask.linkedMessageId ?? task.linkedMessageId ?? "";
    const trustedMessage = await getTrustedPatientMessageContext({
      patientId: existingTask.patientId,
      messageId: linkedMessageId,
    });
    if (trustedMessage) {
      const actor = toClinicianActor(requestWithUser);
      await Promise.all([
        resolveCommunicationReview(trustedMessage.messageId, {
          resolvedBy: actor,
        }),
        recordResolvedNoFollowUpEvent({
          patientId: existingTask.patientId,
          messageId: trustedMessage.messageId,
          actor: {
            actorType: "clinician",
            actorId: actor.clinicianId,
            actorDisplayName: actor.displayName,
          },
          sourceSurface: "clinician_task_complete",
          sourceRecordId: task.id,
        }),
      ]);
    }
  }

  return res.json({
    ok: true,
    task,
  });
});

router.post("/patient/tasks/:id/complete", requirePatientAuth, async (req, res) => {
  const requestWithPatient = req as RequestWithPatient;
  const patientId = requestWithPatient.patient?.id;
  if (!patientId) {
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
  if (!existingTask || existingTask.patientId !== patientId) {
    return res.status(404).json({ ok: false, error: "NOT_FOUND" });
  }

  const meta =
    existingTask.meta &&
    typeof existingTask.meta === "object" &&
    !Array.isArray(existingTask.meta)
      ? existingTask.meta
      : undefined;
  if (meta?.patientCompletable !== true) {
    return res.status(409).json({
      ok: false,
      error: "ACTION_NOT_ALLOWED",
      message: "This task can only be completed after the related action is done.",
    });
  }

  const task =
    existingTask.status === "completed"
      ? existingTask
      : await completeTask(taskId);
  if (!task) {
    return res.status(404).json({ ok: false, error: "NOT_FOUND" });
  }

  return res.json({
    ok: true,
    item: mapPatientTask(task),
  });
});

export default router;
