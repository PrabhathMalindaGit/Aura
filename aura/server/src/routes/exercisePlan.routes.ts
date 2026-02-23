import { Router } from "express";
import { z } from "zod";

import ExercisePlan from "../models/ExercisePlan";
import { requirePatientAuth } from "../middleware/patientAuth";
import { validateBody } from "../middleware/validate";
import type { RequestWithPatient } from "../types/patientAuth";
import type { RequestWithUser } from "../types/auth";
import { logger } from "../utils/logger";

const router = Router();

const dayOfWeekSchema = z.number().int().min(0).max(6);

const exercisePlanItemSchema = z.object({
  key: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(160),
  instructions: z.string().trim().min(1).max(2000),
  sets: z.number().int().min(0).max(10).optional(),
  reps: z.number().int().min(0).max(50).optional(),
  holdSeconds: z.number().int().min(0).max(600).optional(),
  restSeconds: z.number().int().min(0).max(600).optional(),
  intensity: z.enum(["easy", "moderate", "hard"]).optional(),
  videoUrl: z.string().url().max(2000).optional(),
  contraindications: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
  order: z.number().int().min(0).max(1000),
});

const putExercisePlanSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    timezone: z.string().trim().max(120).optional(),
    daysOfWeek: z.array(dayOfWeekSchema).min(1).max(7),
    items: z.array(exercisePlanItemSchema).max(30),
  })
  .superRefine((value, ctx) => {
    const uniqueDays = new Set(value.daysOfWeek);
    if (uniqueDays.size !== value.daysOfWeek.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["daysOfWeek"],
        message: "daysOfWeek cannot contain duplicates",
      });
    }

    const uniqueKeys = new Set<string>();
    value.items.forEach((item, index) => {
      if (uniqueKeys.has(item.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["items", index, "key"],
          message: "exercise keys must be unique",
        });
      } else {
        uniqueKeys.add(item.key);
      }
    });
  });

const todayQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  tzOffsetMinutes: z.coerce.number().int().min(-840).max(840).optional(),
});

function parseDateOnly(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return parsed;
}

function toDateKeyUtc(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate()
  ).padStart(2, "0")}`;
}

function toDateKeyLocal(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

function resolveDateContext(input: {
  date?: string;
  tzOffsetMinutes?: number;
}): { dateKey: string; dayOfWeek: number } {
  if (input.date) {
    const parsed = parseDateOnly(input.date);
    if (!parsed) {
      throw new Error("Invalid date");
    }

    return {
      dateKey: input.date,
      dayOfWeek: parsed.getUTCDay(),
    };
  }

  if (typeof input.tzOffsetMinutes === "number") {
    const shifted = new Date(Date.now() + input.tzOffsetMinutes * 60_000);
    return {
      dateKey: toDateKeyUtc(shifted),
      dayOfWeek: shifted.getUTCDay(),
    };
  }

  const now = new Date();
  return {
    dateKey: toDateKeyLocal(now),
    dayOfWeek: now.getDay(),
  };
}

function normalizeDays(days: number[]): number[] {
  return Array.from(new Set(days)).sort((left, right) => left - right);
}

type ExercisePlanItemRecord = {
  key?: unknown;
  name?: unknown;
  instructions?: unknown;
  sets?: unknown;
  reps?: unknown;
  holdSeconds?: unknown;
  restSeconds?: unknown;
  intensity?: unknown;
  videoUrl?: unknown;
  contraindications?: unknown;
  order?: unknown;
};

function mapPlanItem(value: ExercisePlanItemRecord) {
  return {
    key: typeof value.key === "string" ? value.key : "",
    name: typeof value.name === "string" ? value.name : "",
    instructions: typeof value.instructions === "string" ? value.instructions : "",
    sets: typeof value.sets === "number" ? value.sets : undefined,
    reps: typeof value.reps === "number" ? value.reps : undefined,
    holdSeconds: typeof value.holdSeconds === "number" ? value.holdSeconds : undefined,
    restSeconds: typeof value.restSeconds === "number" ? value.restSeconds : undefined,
    intensity:
      value.intensity === "easy" || value.intensity === "moderate" || value.intensity === "hard"
        ? value.intensity
        : undefined,
    videoUrl: typeof value.videoUrl === "string" ? value.videoUrl : undefined,
    contraindications: Array.isArray(value.contraindications)
      ? value.contraindications.filter(
          (entry): entry is string => typeof entry === "string" && entry.trim().length > 0
        )
      : undefined,
    order: typeof value.order === "number" ? value.order : 0,
  };
}

function mapPlanDocument(plan: {
  title?: unknown;
  timezone?: unknown;
  daysOfWeek?: unknown;
  items?: unknown;
  version?: unknown;
  updatedAt?: unknown;
  updatedBy?: unknown;
}) {
  const days = Array.isArray(plan.daysOfWeek)
    ? plan.daysOfWeek.filter((day): day is number => typeof day === "number")
    : [];
  const items = Array.isArray(plan.items)
    ? plan.items.map((item) => mapPlanItem(item as ExercisePlanItemRecord))
    : [];
  const sortedItems = [...items].sort((left, right) => left.order - right.order);

  const updatedByRecord = (plan.updatedBy ?? {}) as { clinicianId?: unknown; name?: unknown };
  const updatedAtDate = plan.updatedAt instanceof Date ? plan.updatedAt : null;

  return {
    title: typeof plan.title === "string" ? plan.title : "",
    timezone: typeof plan.timezone === "string" ? plan.timezone : undefined,
    daysOfWeek: normalizeDays(days),
    items: sortedItems,
    version: typeof plan.version === "number" ? plan.version : 1,
    updatedAt: updatedAtDate ? updatedAtDate.toISOString() : new Date(0).toISOString(),
    updatedBy:
      typeof updatedByRecord.clinicianId === "string"
        ? {
            clinicianId: updatedByRecord.clinicianId,
            name:
              typeof updatedByRecord.name === "string"
                ? updatedByRecord.name
                : undefined,
          }
        : undefined,
  };
}

router.get("/patient/exercise-plan/today", requirePatientAuth, async (req, res) => {
  const requestWithPatient = req as RequestWithPatient;
  const patientId = requestWithPatient.patient?.id;

  if (!patientId) {
    return res.status(401).json({
      ok: false,
      error: "UNAUTHORIZED",
    });
  }

  const parsedQuery = todayQuerySchema.safeParse(req.query);
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
    const { dateKey, dayOfWeek } = resolveDateContext(parsedQuery.data);
    const planDoc = await ExercisePlan.findOne({ patientId }).lean();

    if (!planDoc) {
      return res.json({
        ok: true,
        patientId,
        date: dateKey,
        dayOfWeek,
        plan: null,
      });
    }

    const mappedPlan = mapPlanDocument(planDoc as Record<string, unknown>);
    const shouldIncludeItems = mappedPlan.daysOfWeek.includes(dayOfWeek);

    return res.json({
      ok: true,
      patientId,
      date: dateKey,
      dayOfWeek,
      plan: {
        title: mappedPlan.title,
        timezone: mappedPlan.timezone,
        daysOfWeek: mappedPlan.daysOfWeek,
        items: shouldIncludeItems ? mappedPlan.items : [],
        version: mappedPlan.version,
        updatedAt: mappedPlan.updatedAt,
      },
    });
  } catch (error) {
    logger.error("Get patient exercise plan failed", {
      route: "GET /patient/exercise-plan/today",
      patientId,
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({
      ok: false,
      error: "INTERNAL_ERROR",
    });
  }
});

router.get("/clinician/patients/:patientId/exercise-plan", async (req, res) => {
  const patientId =
    typeof req.params.patientId === "string" ? req.params.patientId.trim() : "";

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

  try {
    const planDoc = await ExercisePlan.findOne({ patientId }).lean();

    return res.json({
      ok: true,
      patientId,
      plan: planDoc ? mapPlanDocument(planDoc as Record<string, unknown>) : null,
    });
  } catch (error) {
    logger.error("Get clinician exercise plan failed", {
      route: "GET /clinician/patients/:patientId/exercise-plan",
      patientId,
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({
      ok: false,
      error: "INTERNAL_ERROR",
    });
  }
});

router.put(
  "/clinician/patients/:patientId/exercise-plan",
  validateBody(putExercisePlanSchema),
  async (req, res) => {
    const requestWithUser = req as RequestWithUser;
    const patientId =
      typeof req.params.patientId === "string" ? req.params.patientId.trim() : "";

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

    if (!requestWithUser.user) {
      return res.status(401).json({
        ok: false,
        error: "UNAUTHORIZED",
      });
    }

    const body = req.body as z.infer<typeof putExercisePlanSchema>;

    try {
      const existing = await ExercisePlan.findOne({ patientId });
      const nextVersion = existing ? Math.max(existing.version ?? 1, 1) + 1 : 1;
      const normalizedItems = [...body.items].sort((left, right) => left.order - right.order);

      const updated = await ExercisePlan.findOneAndUpdate(
        { patientId },
        {
          $set: {
            title: body.title,
            timezone: body.timezone,
            daysOfWeek: normalizeDays(body.daysOfWeek),
            items: normalizedItems,
            version: nextVersion,
            updatedBy: {
              clinicianId: requestWithUser.user.id,
              name: requestWithUser.user.name,
            },
          },
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        }
      ).lean();

      return res.json({
        ok: true,
        patientId,
        plan: mapPlanDocument(updated as Record<string, unknown>),
      });
    } catch (error) {
      logger.error("Put clinician exercise plan failed", {
        route: "PUT /clinician/patients/:patientId/exercise-plan",
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

export default router;
