import { Router } from "express";
import { z } from "zod";

import { requirePatientAuth } from "../middleware/patientAuth";
import { validateBody } from "../middleware/validate";
import ExerciseSession from "../models/ExerciseSession";
import {
  getExerciseAccessGate,
  getPatientCareStatus,
} from "../services/patientCareStatusService";
import type { RequestWithUser } from "../types/auth";
import type { RequestWithPatient } from "../types/patientAuth";
import { isObjectId } from "../utils/ids";
import { logger } from "../utils/logger";

const router = Router();

const plannedSchema = z
  .object({
    sets: z.number().int().min(0).max(10).optional(),
    reps: z.number().int().min(0).max(100).optional(),
    holdSeconds: z.number().int().min(0).max(600).optional(),
    restSeconds: z.number().int().min(0).max(600).optional(),
  })
  .optional();

const exerciseInputSchema = z.object({
  itemKey: z.string().trim().min(1).max(120),
  nameSnapshot: z.string().trim().min(1).max(160),
  order: z.number().int().min(0).max(1000),
  planned: plannedSchema,
  completed: z.boolean(),
  setsDone: z.number().int().min(0).max(20).optional(),
  repsDone: z.number().int().min(0).max(200).optional(),
  difficulty: z.enum(["easy", "ok", "hard"]).optional(),
  painDuring: z.number().int().min(0).max(5).optional(),
  note: z.string().max(2000).optional(),
  completedAt: z.string().optional(),
});

const createSessionSchema = z.object({
  startedAt: z.string().min(1),
  endedAt: z.string().min(1),
  planVersion: z.number().int().min(1).optional(),
  planTitle: z.string().trim().min(1).max(160).optional(),
  planDayOfWeek: z.number().int().min(0).max(6).optional(),
  status: z.enum(["completed", "abandoned"]).optional(),
  exercises: z.array(exerciseInputSchema).min(1).max(50),
});

const listQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
});

const NOTE_MAX_LENGTH = 280;

function parseIsoDate(value: string): Date | null {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    return null;
  }
  return parsed;
}

function sanitizeNote(note?: string): string | undefined {
  if (typeof note !== "string") {
    return undefined;
  }
  const trimmed = note.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.length > NOTE_MAX_LENGTH ? trimmed.slice(0, NOTE_MAX_LENGTH) : trimmed;
}

function toListItem(
  session: {
    _id?: unknown;
    startedAt?: unknown;
    durationSeconds?: unknown;
    planTitle?: unknown;
    exercises?: unknown;
  }
): {
  id: string;
  startedAt: string;
  durationSeconds: number;
  exerciseCount: number;
  completedCount: number;
  avgPainDuring?: number;
  planTitle?: string;
} {
  const exercises = Array.isArray(session.exercises)
    ? (session.exercises as Array<{ completed?: unknown; painDuring?: unknown }>)
    : [];
  const completedCount = exercises.reduce(
    (count, item) => (item.completed === true ? count + 1 : count),
    0
  );
  const painValues = exercises
    .map((item) =>
      typeof item.painDuring === "number" && Number.isFinite(item.painDuring)
        ? item.painDuring
        : null
    )
    .filter((value): value is number => value !== null);
  const avgPainDuring =
    painValues.length > 0
      ? Math.round((painValues.reduce((sum, value) => sum + value, 0) / painValues.length) * 10) /
        10
      : undefined;

  return {
    id: String(session._id ?? ""),
    startedAt:
      session.startedAt instanceof Date
        ? session.startedAt.toISOString()
        : new Date(0).toISOString(),
    durationSeconds:
      typeof session.durationSeconds === "number" && Number.isFinite(session.durationSeconds)
        ? session.durationSeconds
        : 0,
    exerciseCount: exercises.length,
    completedCount,
    avgPainDuring,
    planTitle: typeof session.planTitle === "string" ? session.planTitle : undefined,
  };
}

function toDetailResponse(session: Record<string, unknown>) {
  const listBase = toListItem(session);
  const endedAt =
    session.endedAt instanceof Date ? session.endedAt.toISOString() : new Date(0).toISOString();
  const status =
    session.status === "completed" || session.status === "abandoned"
      ? session.status
      : "completed";
  const planVersion =
    typeof session.planVersion === "number" && Number.isFinite(session.planVersion)
      ? session.planVersion
      : undefined;
  const planDayOfWeek =
    typeof session.planDayOfWeek === "number" && Number.isFinite(session.planDayOfWeek)
      ? session.planDayOfWeek
      : undefined;
  const exercises = Array.isArray(session.exercises)
    ? session.exercises
        .map((entry) => {
          const item = entry as Record<string, unknown>;
          return {
            itemKey: typeof item.itemKey === "string" ? item.itemKey : "",
            nameSnapshot: typeof item.nameSnapshot === "string" ? item.nameSnapshot : "",
            order: typeof item.order === "number" ? item.order : 0,
            planned:
              item.planned && typeof item.planned === "object"
                ? {
                    sets:
                      typeof (item.planned as { sets?: unknown }).sets === "number"
                        ? (item.planned as { sets: number }).sets
                        : undefined,
                    reps:
                      typeof (item.planned as { reps?: unknown }).reps === "number"
                        ? (item.planned as { reps: number }).reps
                        : undefined,
                    holdSeconds:
                      typeof (item.planned as { holdSeconds?: unknown }).holdSeconds === "number"
                        ? (item.planned as { holdSeconds: number }).holdSeconds
                        : undefined,
                    restSeconds:
                      typeof (item.planned as { restSeconds?: unknown }).restSeconds === "number"
                        ? (item.planned as { restSeconds: number }).restSeconds
                        : undefined,
                  }
                : undefined,
            completed: item.completed === true,
            setsDone: typeof item.setsDone === "number" ? item.setsDone : undefined,
            repsDone: typeof item.repsDone === "number" ? item.repsDone : undefined,
            difficulty:
              item.difficulty === "easy" || item.difficulty === "ok" || item.difficulty === "hard"
                ? item.difficulty
                : undefined,
            painDuring: typeof item.painDuring === "number" ? item.painDuring : undefined,
            note: typeof item.note === "string" ? item.note : undefined,
            completedAt:
              item.completedAt instanceof Date ? item.completedAt.toISOString() : undefined,
          };
        })
        .sort((left, right) => left.order - right.order)
    : [];

  return {
    ...listBase,
    endedAt,
    status,
    planVersion,
    planDayOfWeek,
    exercises,
  };
}

router.post(
  "/patient/exercise-sessions",
  requirePatientAuth,
  validateBody(createSessionSchema),
  async (req, res) => {
    const requestWithPatient = req as RequestWithPatient;
    const patientId = requestWithPatient.patient?.id;

    if (!patientId) {
      return res.status(401).json({
        ok: false,
        error: "UNAUTHORIZED",
      });
    }

    try {
      const careStatus = await getPatientCareStatus(patientId);
      const accessGate = getExerciseAccessGate(careStatus);
      if (!accessGate.allowed) {
        return res.status(403).json({
          ok: false,
          error: "FORBIDDEN",
          message: accessGate.message,
        });
      }
      const body = req.body as z.infer<typeof createSessionSchema>;
      const startedAt = parseIsoDate(body.startedAt);
      const endedAt = parseIsoDate(body.endedAt);

      if (!startedAt || !endedAt) {
        return res.status(400).json({
          ok: false,
          error: "VALIDATION_ERROR",
          details: [
            {
              path: "startedAt/endedAt",
              message: "startedAt and endedAt must be valid ISO timestamps",
            },
          ],
        });
      }

      if (endedAt.getTime() < startedAt.getTime()) {
        return res.status(400).json({
          ok: false,
          error: "VALIDATION_ERROR",
          details: [
            {
              path: "endedAt",
              message: "endedAt must be after startedAt",
            },
          ],
        });
      }

      const durationSeconds = Math.max(
        0,
        Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000)
      );

      const exercises = body.exercises.map((exercise) => ({
        itemKey: exercise.itemKey,
        nameSnapshot: exercise.nameSnapshot,
        order: exercise.order,
        planned: exercise.planned,
        completed: exercise.completed,
        setsDone: exercise.setsDone,
        repsDone: exercise.repsDone,
        difficulty: exercise.difficulty,
        painDuring: exercise.painDuring,
        note: sanitizeNote(exercise.note),
        completedAt: exercise.completedAt ? parseIsoDate(exercise.completedAt) ?? undefined : undefined,
      }));

      const created = await ExerciseSession.create({
        patientId,
        planPatientId: patientId,
        planVersion: body.planVersion,
        planTitle: body.planTitle,
        planDayOfWeek: body.planDayOfWeek,
        startedAt,
        endedAt,
        durationSeconds,
        status: body.status ?? "completed",
        exercises,
      });

      return res.json({
        ok: true,
        sessionId: String(created._id),
        createdAt: created.createdAt?.toISOString() ?? new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Create patient exercise session failed", {
        route: "POST /patient/exercise-sessions",
        patientId,
        message: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({
        ok: false,
        error: "INTERNAL_ERROR",
      });
    }
  }
);

router.get("/patient/exercise-sessions", requirePatientAuth, async (req, res) => {
  const requestWithPatient = req as RequestWithPatient;
  const patientId = requestWithPatient.patient?.id;

  if (!patientId) {
    return res.status(401).json({
      ok: false,
      error: "UNAUTHORIZED",
    });
  }

  const parsedQuery = listQuerySchema.safeParse(req.query);
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

  try {
    const sessions = await ExerciseSession.find({ patientId })
      .sort({ startedAt: -1 })
      .limit(parsedQuery.data.limit)
      .lean();

    return res.json({
      ok: true,
      sessions: sessions.map((session) => toListItem(session as Record<string, unknown>)),
    });
  } catch (error) {
    logger.error("List patient exercise sessions failed", {
      route: "GET /patient/exercise-sessions",
      patientId,
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({
      ok: false,
      error: "INTERNAL_ERROR",
    });
  }
});

router.get("/patient/exercise-sessions/:id", requirePatientAuth, async (req, res) => {
  const requestWithPatient = req as RequestWithPatient;
  const patientId = requestWithPatient.patient?.id;
  const sessionId = typeof req.params.id === "string" ? req.params.id.trim() : "";

  if (!patientId) {
    return res.status(401).json({
      ok: false,
      error: "UNAUTHORIZED",
    });
  }

  if (!sessionId || !isObjectId(sessionId)) {
    return res.status(400).json({
      ok: false,
      error: "VALIDATION_ERROR",
      details: [
        {
          path: "id",
          message: "Invalid session id",
        },
      ],
    });
  }

  try {
    const session = await ExerciseSession.findOne({ _id: sessionId, patientId }).lean();
    if (!session) {
      return res.status(404).json({
        ok: false,
        error: "NOT_FOUND",
      });
    }

    return res.json({
      ok: true,
      session: toDetailResponse(session as Record<string, unknown>),
    });
  } catch (error) {
    logger.error("Get patient exercise session failed", {
      route: "GET /patient/exercise-sessions/:id",
      patientId,
      sessionId,
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({
      ok: false,
      error: "INTERNAL_ERROR",
    });
  }
});

router.get("/clinician/patients/:patientId/exercise-sessions", async (req, res) => {
  const requestWithUser = req as RequestWithUser;
  const patientId = typeof req.params.patientId === "string" ? req.params.patientId.trim() : "";

  if (!requestWithUser.user) {
    return res.status(401).json({
      ok: false,
      error: "UNAUTHORIZED",
    });
  }

  if (!patientId) {
    return res.status(400).json({
      ok: false,
      error: "VALIDATION_ERROR",
      details: [
        {
          path: "patientId",
          message: "patientId is required",
        },
      ],
    });
  }

  const parsedQuery = listQuerySchema.safeParse(req.query);
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

  try {
    const sessions = await ExerciseSession.find({ patientId })
      .sort({ startedAt: -1 })
      .limit(parsedQuery.data.limit)
      .lean();

    return res.json({
      ok: true,
      patientId,
      sessions: sessions.map((session) => toListItem(session as Record<string, unknown>)),
    });
  } catch (error) {
    logger.error("List clinician exercise sessions failed", {
      route: "GET /clinician/patients/:patientId/exercise-sessions",
      patientId,
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({
      ok: false,
      error: "INTERNAL_ERROR",
    });
  }
});

router.get("/clinician/exercise-sessions/:id", async (req, res) => {
  const requestWithUser = req as RequestWithUser;
  const sessionId = typeof req.params.id === "string" ? req.params.id.trim() : "";

  if (!requestWithUser.user) {
    return res.status(401).json({
      ok: false,
      error: "UNAUTHORIZED",
    });
  }

  if (!sessionId || !isObjectId(sessionId)) {
    return res.status(400).json({
      ok: false,
      error: "VALIDATION_ERROR",
      details: [
        {
          path: "id",
          message: "Invalid session id",
        },
      ],
    });
  }

  try {
    const session = await ExerciseSession.findById(sessionId).lean();
    if (!session) {
      return res.status(404).json({
        ok: false,
        error: "NOT_FOUND",
      });
    }

    return res.json({
      ok: true,
      session: toDetailResponse(session as Record<string, unknown>),
    });
  } catch (error) {
    logger.error("Get clinician exercise session failed", {
      route: "GET /clinician/exercise-sessions/:id",
      sessionId,
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({
      ok: false,
      error: "INTERNAL_ERROR",
    });
  }
});

export default router;
