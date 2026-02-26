import { Router } from "express";
import { z } from "zod";

import { requirePatientAuth } from "../middleware/patientAuth";
import Patient from "../models/Patient";
import WearableDaily from "../models/WearableDaily";
import type { RequestWithUser } from "../types/auth";
import type { RequestWithPatient } from "../types/patientAuth";
import { logger } from "../utils/logger";

const router = Router();

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
const wearableSources = ["mock", "healthkit_stub", "googlefit_stub"] as const;
type WearableSource = (typeof wearableSources)[number];

const daySchema = z
  .object({
    date: z.string().regex(dateRegex),
    steps: z.number().int().min(0).max(100000).optional(),
    activeMinutes: z.number().int().min(0).max(300).optional(),
    restingHr: z.number().int().min(30).max(220).optional(),
  })
  .superRefine((value, ctx) => {
    if (
      typeof value.steps !== "number" &&
      typeof value.activeMinutes !== "number" &&
      typeof value.restingHr !== "number"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one metric is required (steps, activeMinutes, or restingHr).",
        path: ["steps"],
      });
    }
  });

const bulkBodySchema = z.object({
  source: z.enum(wearableSources).optional(),
  days: z.array(daySchema).min(1).max(31),
});

const rangeQuerySchema = z.object({
  from: z.string().regex(dateRegex).optional(),
  to: z.string().regex(dateRegex).optional(),
  source: z.enum(wearableSources).optional(),
});

function toDateOnlyLocal(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

function parseDateOnly(value: string): Date | null {
  if (!dateRegex.test(value)) {
    return null;
  }

  const [yearString, monthString, dayString] = value.split("-");
  const year = Number.parseInt(yearString, 10);
  const month = Number.parseInt(monthString, 10);
  const day = Number.parseInt(dayString, 10);
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

function addDays(dateOnly: string, deltaDays: number): string {
  const parsed = parseDateOnly(dateOnly);
  if (!parsed) {
    return dateOnly;
  }
  const shifted = new Date(parsed.getTime() + deltaDays * 24 * 60 * 60 * 1000);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(
    2,
    "0"
  )}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
}

function compareDateOnly(left: string, right: string): number {
  return Date.parse(`${left}T00:00:00.000Z`) - Date.parse(`${right}T00:00:00.000Z`);
}

function resolveRange(from?: string, to?: string): { from: string; to: string } | null {
  const today = toDateOnlyLocal(new Date());
  const resolvedFrom = from ?? to ?? addDays(today, -6);
  const resolvedTo = to ?? from ?? today;

  if (!parseDateOnly(resolvedFrom) || !parseDateOnly(resolvedTo)) {
    return null;
  }

  if (compareDateOnly(resolvedFrom, resolvedTo) > 0) {
    return null;
  }

  return {
    from: resolvedFrom,
    to: resolvedTo,
  };
}

function roundToOne(value: number): number {
  return Math.round(value * 10) / 10;
}

function avg(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return roundToOne(values.reduce((sum, value) => sum + value, 0) / values.length);
}

type WearableDay = {
  date: string;
  steps?: number;
  activeMinutes?: number;
  restingHr?: number;
};

async function readDailyRows(
  patientId: string,
  source: WearableSource,
  from: string,
  to: string
): Promise<WearableDay[]> {
  const rows = await WearableDaily.find({
    patientId,
    source,
    date: {
      $gte: from,
      $lte: to,
    },
  })
    .sort({ date: 1 })
    .select({ date: 1, steps: 1, activeMinutes: 1, restingHr: 1 })
    .lean();

  return rows.map((row) => ({
    date: typeof row.date === "string" ? row.date : "",
    steps: typeof row.steps === "number" && Number.isFinite(row.steps) ? row.steps : undefined,
    activeMinutes:
      typeof row.activeMinutes === "number" && Number.isFinite(row.activeMinutes)
        ? row.activeMinutes
        : undefined,
    restingHr:
      typeof row.restingHr === "number" && Number.isFinite(row.restingHr)
        ? row.restingHr
        : undefined,
  }));
}

function buildSummary(days: WearableDay[]) {
  const stepsValues = days
    .map((day) => day.steps)
    .filter((value): value is number => typeof value === "number");
  const activeValues = days
    .map((day) => day.activeMinutes)
    .filter((value): value is number => typeof value === "number");
  const hrValues = days
    .map((day) => day.restingHr)
    .filter((value): value is number => typeof value === "number");

  return {
    trackedDays: days.length,
    avgSteps: avg(stepsValues),
    avgActiveMinutes: avg(activeValues),
    avgRestingHr: avg(hrValues),
    totalSteps: Math.round(stepsValues.reduce((sum, value) => sum + value, 0)),
    totalActiveMinutes: Math.round(activeValues.reduce((sum, value) => sum + value, 0)),
  };
}

router.post("/patient/wearables/daily/bulk", requirePatientAuth, async (req, res) => {
  const requestWithPatient = req as RequestWithPatient;
  const patientId = requestWithPatient.patient?.id;
  if (!patientId) {
    return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  }

  const parsedBody = bulkBodySchema.safeParse(req.body);
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

  const source: WearableSource = parsedBody.data.source ?? "mock";
  const dedupedMap = new Map<string, z.infer<typeof daySchema>>();
  for (const day of parsedBody.data.days) {
    dedupedMap.set(day.date, day);
  }
  const dedupedDays = [...dedupedMap.values()].sort((left, right) =>
    compareDateOnly(left.date, right.date)
  );
  const dates = dedupedDays.map((day) => day.date);

  try {
    const existing = await WearableDaily.find({
      patientId,
      source,
      date: { $in: dates },
    })
      .select({ date: 1 })
      .lean();
    const existingDates = new Set(
      existing
        .map((row) => (typeof row.date === "string" ? row.date : ""))
        .filter(Boolean)
    );

    const now = new Date();
    await WearableDaily.bulkWrite(
      dedupedDays.map((day) => {
        const unsetPayload: Record<string, ""> = {};
        if (typeof day.steps !== "number") {
          unsetPayload.steps = "";
        }
        if (typeof day.activeMinutes !== "number") {
          unsetPayload.activeMinutes = "";
        }
        if (typeof day.restingHr !== "number") {
          unsetPayload.restingHr = "";
        }

        return {
          updateOne: {
            filter: {
              patientId,
              source,
              date: day.date,
            },
            update: {
              $set: {
                patientId,
                source,
                date: day.date,
                ...(typeof day.steps === "number" ? { steps: day.steps } : {}),
                ...(typeof day.activeMinutes === "number"
                  ? { activeMinutes: day.activeMinutes }
                  : {}),
                ...(typeof day.restingHr === "number" ? { restingHr: day.restingHr } : {}),
                updatedAt: now,
              },
              ...(Object.keys(unsetPayload).length > 0 ? { $unset: unsetPayload } : {}),
            },
            upsert: true,
          },
        };
      }),
      { ordered: false }
    );

    const upserted = dedupedDays.filter((day) => !existingDates.has(day.date)).length;
    const updated = dedupedDays.length - upserted;

    return res.json({
      ok: true,
      source,
      upserted,
      updated,
    });
  } catch (error) {
    logger.error("Bulk upsert wearables failed", {
      route: "POST /patient/wearables/daily/bulk",
      patientId,
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

router.get("/patient/wearables/daily", requirePatientAuth, async (req, res) => {
  const requestWithPatient = req as RequestWithPatient;
  const patientId = requestWithPatient.patient?.id;
  if (!patientId) {
    return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  }

  const parsedQuery = rangeQuerySchema.safeParse(req.query);
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

  const range = resolveRange(parsedQuery.data.from, parsedQuery.data.to);
  if (!range) {
    return res.status(400).json({
      ok: false,
      error: "VALIDATION_ERROR",
      details: [{ path: "from/to", message: "from and to must be valid YYYY-MM-DD dates with from <= to" }],
    });
  }

  const source: WearableSource = parsedQuery.data.source ?? "mock";

  try {
    const days = await readDailyRows(patientId, source, range.from, range.to);
    return res.json({
      ok: true,
      source,
      from: range.from,
      to: range.to,
      days,
    });
  } catch (error) {
    logger.error("Get wearables daily failed", {
      route: "GET /patient/wearables/daily",
      patientId,
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

router.get("/patient/wearables/summary", requirePatientAuth, async (req, res) => {
  const requestWithPatient = req as RequestWithPatient;
  const patientId = requestWithPatient.patient?.id;
  if (!patientId) {
    return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  }

  const parsedQuery = rangeQuerySchema.safeParse(req.query);
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

  const range = resolveRange(parsedQuery.data.from, parsedQuery.data.to);
  if (!range) {
    return res.status(400).json({
      ok: false,
      error: "VALIDATION_ERROR",
      details: [{ path: "from/to", message: "from and to must be valid YYYY-MM-DD dates with from <= to" }],
    });
  }

  const source: WearableSource = parsedQuery.data.source ?? "mock";

  try {
    const days = await readDailyRows(patientId, source, range.from, range.to);
    const summary = buildSummary(days);
    return res.json({
      ok: true,
      source,
      from: range.from,
      to: range.to,
      ...summary,
    });
  } catch (error) {
    logger.error("Get wearables summary failed", {
      route: "GET /patient/wearables/summary",
      patientId,
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

router.get("/clinician/patients/:patientId/wearables/daily", async (req, res) => {
  const requestWithUser = req as RequestWithUser;
  if (!requestWithUser.user) {
    return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  }

  const patientId = typeof req.params.patientId === "string" ? req.params.patientId.trim() : "";
  if (!patientId) {
    return res.status(400).json({
      ok: false,
      error: "VALIDATION_ERROR",
      details: [{ path: "patientId", message: "patientId is required" }],
    });
  }

  const parsedQuery = rangeQuerySchema.safeParse(req.query);
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

  const range = resolveRange(parsedQuery.data.from, parsedQuery.data.to);
  if (!range) {
    return res.status(400).json({
      ok: false,
      error: "VALIDATION_ERROR",
      details: [{ path: "from/to", message: "from and to must be valid YYYY-MM-DD dates with from <= to" }],
    });
  }

  const source: WearableSource = parsedQuery.data.source ?? "mock";

  try {
    const patient = await Patient.findOne({ patientId }).select({ patientId: 1 }).lean();
    if (!patient) {
      return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    }

    const days = await readDailyRows(patientId, source, range.from, range.to);
    return res.json({
      ok: true,
      patientId,
      source,
      from: range.from,
      to: range.to,
      days,
    });
  } catch (error) {
    logger.error("Get clinician wearables daily failed", {
      route: "GET /clinician/patients/:patientId/wearables/daily",
      patientId,
      clinicianId: requestWithUser.user.id,
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

router.get("/clinician/patients/:patientId/wearables/summary", async (req, res) => {
  const requestWithUser = req as RequestWithUser;
  if (!requestWithUser.user) {
    return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  }

  const patientId = typeof req.params.patientId === "string" ? req.params.patientId.trim() : "";
  if (!patientId) {
    return res.status(400).json({
      ok: false,
      error: "VALIDATION_ERROR",
      details: [{ path: "patientId", message: "patientId is required" }],
    });
  }

  const parsedQuery = rangeQuerySchema.safeParse(req.query);
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

  const range = resolveRange(parsedQuery.data.from, parsedQuery.data.to);
  if (!range) {
    return res.status(400).json({
      ok: false,
      error: "VALIDATION_ERROR",
      details: [{ path: "from/to", message: "from and to must be valid YYYY-MM-DD dates with from <= to" }],
    });
  }

  const source: WearableSource = parsedQuery.data.source ?? "mock";

  try {
    const patient = await Patient.findOne({ patientId }).select({ patientId: 1 }).lean();
    if (!patient) {
      return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    }

    const days = await readDailyRows(patientId, source, range.from, range.to);
    const summary = buildSummary(days);
    return res.json({
      ok: true,
      patientId,
      source,
      from: range.from,
      to: range.to,
      ...summary,
    });
  } catch (error) {
    logger.error("Get clinician wearables summary failed", {
      route: "GET /clinician/patients/:patientId/wearables/summary",
      patientId,
      clinicianId: requestWithUser.user.id,
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

export default router;
