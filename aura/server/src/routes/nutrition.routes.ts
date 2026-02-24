import { Router } from "express";
import { z } from "zod";

import { requirePatientAuth } from "../middleware/patientAuth";
import NutritionLog from "../models/NutritionLog";
import Patient from "../models/Patient";
import type { RequestWithUser } from "../types/auth";
import type { RequestWithPatient } from "../types/patientAuth";
import { isObjectId } from "../utils/ids";
import { logger } from "../utils/logger";

const router = Router();

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
const MAX_NOTES_LENGTH = 280;

const nutritionLogSchema = z.object({
  date: z.string().regex(dateRegex).optional(),
  protein: z.enum(["low", "ok", "high"]),
  fruitVegServings: z.number().int().min(0).max(6),
  antiInflammatoryFocus: z.boolean(),
  mealRegularity: z.enum(["irregular", "mostly", "regular"]),
  appetite: z.enum(["low", "normal", "high"]).optional(),
  notes: z.string().max(2_000).optional(),
});

const rangeQuerySchema = z.object({
  from: z.string().regex(dateRegex).optional(),
  to: z.string().regex(dateRegex).optional(),
});

const todayQuerySchema = z.object({
  date: z.string().regex(dateRegex).optional(),
});

function toDateOnlyLocal(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

function parseDateOnly(dateString: string): Date | null {
  if (!dateRegex.test(dateString)) {
    return null;
  }

  const [yearString, monthString, dayString] = dateString.split("-");
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

function addDays(dateString: string, deltaDays: number): string {
  const parsed = parseDateOnly(dateString);
  if (!parsed) {
    return dateString;
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

function expandDateRangeInclusive(from: string, to: string): string[] {
  const dates: string[] = [];
  let cursor = from;
  while (compareDateOnly(cursor, to) <= 0) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
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

function toSafeNotes(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.slice(0, MAX_NOTES_LENGTH);
}

function mapEntry(entry: {
  _id?: unknown;
  date?: unknown;
  protein?: unknown;
  fruitVegServings?: unknown;
  antiInflammatoryFocus?: unknown;
  mealRegularity?: unknown;
  appetite?: unknown;
  notes?: unknown;
  createdAt?: unknown;
}) {
  const createdAt =
    entry.createdAt instanceof Date
      ? entry.createdAt.toISOString()
      : new Date(0).toISOString();

  return {
    id: String(entry._id ?? ""),
    date: typeof entry.date === "string" ? entry.date : "",
    protein:
      entry.protein === "low" || entry.protein === "ok" || entry.protein === "high"
        ? entry.protein
        : "low",
    fruitVegServings:
      typeof entry.fruitVegServings === "number" && Number.isFinite(entry.fruitVegServings)
        ? entry.fruitVegServings
        : 0,
    antiInflammatoryFocus: entry.antiInflammatoryFocus === true,
    mealRegularity:
      entry.mealRegularity === "irregular" ||
      entry.mealRegularity === "mostly" ||
      entry.mealRegularity === "regular"
        ? entry.mealRegularity
        : "irregular",
    appetite:
      entry.appetite === "low" || entry.appetite === "normal" || entry.appetite === "high"
        ? entry.appetite
        : undefined,
    notes: typeof entry.notes === "string" ? entry.notes : undefined,
    createdAt,
  };
}

async function readLatestEntriesByDay(patientId: string, from: string, to: string) {
  const rows = await NutritionLog.find({
    patientId,
    date: {
      $gte: from,
      $lte: to,
    },
  })
    .sort({ date: 1, createdAt: -1 })
    .select({
      date: 1,
      protein: 1,
      fruitVegServings: 1,
      antiInflammatoryFocus: 1,
      mealRegularity: 1,
      appetite: 1,
      notes: 1,
      createdAt: 1,
    })
    .lean();

  const byDate = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    if (typeof row.date !== "string" || byDate.has(row.date)) {
      continue;
    }
    byDate.set(row.date, row);
  }

  return expandDateRangeInclusive(from, to).map((date) => ({
    date,
    entry: byDate.has(date) ? mapEntry(byDate.get(date) ?? {}) : null,
  }));
}

router.post("/patient/nutrition/log", requirePatientAuth, async (req, res) => {
  const requestWithPatient = req as RequestWithPatient;
  const patientId = requestWithPatient.patient?.id;
  if (!patientId) {
    return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  }

  const parsedBody = nutritionLogSchema.safeParse(req.body);
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

  try {
    const date = parsedBody.data.date ?? toDateOnlyLocal(new Date());
    if (!parseDateOnly(date)) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        details: [{ path: "date", message: "date must be a valid YYYY-MM-DD value" }],
      });
    }

    const created = await NutritionLog.create({
      patientId,
      date,
      protein: parsedBody.data.protein,
      fruitVegServings: parsedBody.data.fruitVegServings,
      antiInflammatoryFocus: parsedBody.data.antiInflammatoryFocus,
      mealRegularity: parsedBody.data.mealRegularity,
      appetite: parsedBody.data.appetite,
      notes: toSafeNotes(parsedBody.data.notes),
      source: "manual",
    });

    return res.json({
      ok: true,
      id: String(created._id),
      date: created.date,
      createdAt: created.createdAt?.toISOString() ?? new Date().toISOString(),
      entry: mapEntry(created.toObject()),
    });
  } catch (error) {
    logger.error("Create nutrition log failed", {
      route: "POST /patient/nutrition/log",
      patientId,
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

router.get("/patient/nutrition/today", requirePatientAuth, async (req, res) => {
  const requestWithPatient = req as RequestWithPatient;
  const patientId = requestWithPatient.patient?.id;
  if (!patientId) {
    return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
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

  const date = parsedQuery.data.date ?? toDateOnlyLocal(new Date());
  if (!parseDateOnly(date)) {
    return res.status(400).json({
      ok: false,
      error: "VALIDATION_ERROR",
      details: [{ path: "date", message: "date must be a valid YYYY-MM-DD value" }],
    });
  }

  try {
    const latest = await NutritionLog.findOne({ patientId, date })
      .sort({ createdAt: -1 })
      .select({
        date: 1,
        protein: 1,
        fruitVegServings: 1,
        antiInflammatoryFocus: 1,
        mealRegularity: 1,
        appetite: 1,
        notes: 1,
        createdAt: 1,
      })
      .lean();

    return res.json({
      ok: true,
      date,
      entry: latest ? mapEntry(latest) : null,
    });
  } catch (error) {
    logger.error("Get nutrition today failed", {
      route: "GET /patient/nutrition/today",
      patientId,
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

router.get("/patient/nutrition/range", requirePatientAuth, async (req, res) => {
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

  try {
    const days = await readLatestEntriesByDay(patientId, range.from, range.to);
    return res.json({
      ok: true,
      from: range.from,
      to: range.to,
      days,
    });
  } catch (error) {
    logger.error("Get nutrition range failed", {
      route: "GET /patient/nutrition/range",
      patientId,
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

router.delete("/patient/nutrition/entries/:id", requirePatientAuth, async (req, res) => {
  const requestWithPatient = req as RequestWithPatient;
  const patientId = requestWithPatient.patient?.id;
  if (!patientId) {
    return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  }

  const id = typeof req.params.id === "string" ? req.params.id.trim() : "";
  if (!isObjectId(id)) {
    return res.status(400).json({
      ok: false,
      error: "VALIDATION_ERROR",
      details: [{ path: "id", message: "Invalid nutrition entry id" }],
    });
  }

  try {
    const deleted = await NutritionLog.findOneAndDelete({ _id: id, patientId }).lean();
    if (!deleted) {
      return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    }

    return res.json({
      ok: true,
      id,
    });
  } catch (error) {
    logger.error("Delete nutrition entry failed", {
      route: "DELETE /patient/nutrition/entries/:id",
      patientId,
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

router.get("/clinician/patients/:patientId/nutrition/range", async (req, res) => {
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

  try {
    const patient = await Patient.findOne({ patientId }).select({ patientId: 1 }).lean();
    if (!patient) {
      return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    }

    const days = await readLatestEntriesByDay(patientId, range.from, range.to);
    return res.json({
      ok: true,
      patientId,
      from: range.from,
      to: range.to,
      days,
    });
  } catch (error) {
    logger.error("Get clinician nutrition range failed", {
      route: "GET /clinician/patients/:patientId/nutrition/range",
      patientId,
      clinicianId: requestWithUser.user.id,
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

export default router;
