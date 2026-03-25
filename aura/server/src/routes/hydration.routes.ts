import { Router } from "express";
import { z } from "zod";

import { requirePatientAuth } from "../middleware/patientAuth";
import HydrationLog from "../models/HydrationLog";
import Patient from "../models/Patient";
import type { RequestWithUser } from "../types/auth";
import type { RequestWithPatient } from "../types/patientAuth";
import { isObjectId } from "../utils/ids";
import { logger } from "../utils/logger";

const router = Router();

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
const DAILY_TARGET_ML = 2000;

const hydrationLogSchema = z.object({
  date: z.string().regex(dateRegex).optional(),
  amountMl: z.number().int().min(10).max(5000),
  clientMutationId: z.string().trim().min(1).max(120).optional(),
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

async function readDayTotals(patientId: string, from: string, to: string) {
  const rows = await HydrationLog.aggregate<{
    _id: string;
    totalMl: number;
  }>([
    {
      $match: {
        patientId,
        date: {
          $gte: from,
          $lte: to,
        },
      },
    },
    {
      $group: {
        _id: "$date",
        totalMl: { $sum: "$amountMl" },
      },
    },
    {
      $sort: { _id: 1 },
    },
  ]);

  const totalsByDate = new Map(rows.map((row) => [row._id, row.totalMl]));
  return expandDateRangeInclusive(from, to).map((date) => ({
    date,
    totalMl: totalsByDate.get(date) ?? 0,
    metTarget: (totalsByDate.get(date) ?? 0) >= DAILY_TARGET_ML,
  }));
}

type HydrationSemanticPayload = {
  date: string;
  amountMl: number;
};

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}

function toHydrationResponse(entry: {
  _id?: unknown;
  date?: unknown;
  amountMl?: unknown;
  createdAt?: unknown;
}) {
  return {
    ok: true,
    id: String(entry._id ?? ""),
    date: typeof entry.date === "string" ? entry.date : "",
    amountMl:
      typeof entry.amountMl === "number" && Number.isFinite(entry.amountMl)
        ? entry.amountMl
        : 0,
    createdAt:
      entry.createdAt instanceof Date
        ? entry.createdAt.toISOString()
        : new Date(0).toISOString(),
  };
}

function matchesHydrationPayload(
  entry: {
    date?: unknown;
    amountMl?: unknown;
  },
  payload: HydrationSemanticPayload
): boolean {
  return (
    entry.date === payload.date &&
    typeof entry.amountMl === "number" &&
    entry.amountMl === payload.amountMl
  );
}

router.post("/patient/hydration/log", requirePatientAuth, async (req, res) => {
  const requestWithPatient = req as RequestWithPatient;
  const patientId = requestWithPatient.patient?.id;
  if (!patientId) {
    return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  }

  const parsedBody = hydrationLogSchema.safeParse(req.body);
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
    const semanticPayload: HydrationSemanticPayload = {
      date,
      amountMl: parsedBody.data.amountMl,
    };
    const clientMutationId = parsedBody.data.clientMutationId;

    if (!clientMutationId) {
      const created = await HydrationLog.create({
        patientId,
        date,
        amountMl: parsedBody.data.amountMl,
        source: "manual",
      });

      return res.json(toHydrationResponse(created.toObject()));
    }

    try {
      const created = await HydrationLog.create({
        patientId,
        date,
        amountMl: parsedBody.data.amountMl,
        clientMutationId,
        source: "manual",
      });

      return res.json(toHydrationResponse(created.toObject()));
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }

      const existing = await HydrationLog.findOne({
        patientId,
        clientMutationId,
      }).lean();

      if (!existing) {
        throw error;
      }

      if (matchesHydrationPayload(existing, semanticPayload)) {
        return res.json(toHydrationResponse(existing));
      }

      return res.status(409).json({
        ok: false,
        error: "IDEMPOTENCY_CONFLICT",
        message: "clientMutationId was already used for a different hydration log.",
      });
    }
  } catch (error) {
    logger.error("Create hydration log failed", {
      route: "POST /patient/hydration/log",
      patientId,
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

router.get("/patient/hydration/today", requirePatientAuth, async (req, res) => {
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
    const entries = await HydrationLog.find({ patientId, date })
      .sort({ createdAt: -1 })
      .select({ amountMl: 1, createdAt: 1, date: 1 })
      .lean();

    const totalMl = entries.reduce((sum, entry) => {
      const amount = typeof entry.amountMl === "number" ? entry.amountMl : 0;
      return sum + amount;
    }, 0);

    return res.json({
      ok: true,
      date,
      totalMl,
      targetMl: DAILY_TARGET_ML,
      entries: entries.map((entry) => ({
        id: String(entry._id ?? ""),
        amountMl: typeof entry.amountMl === "number" ? entry.amountMl : 0,
        createdAt:
          entry.createdAt instanceof Date
            ? entry.createdAt.toISOString()
            : new Date(0).toISOString(),
      })),
    });
  } catch (error) {
    logger.error("Get hydration today failed", {
      route: "GET /patient/hydration/today",
      patientId,
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

router.get("/patient/hydration/range", requirePatientAuth, async (req, res) => {
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
    const days = await readDayTotals(patientId, range.from, range.to);
    return res.json({
      ok: true,
      from: range.from,
      to: range.to,
      targetMl: DAILY_TARGET_ML,
      days,
    });
  } catch (error) {
    logger.error("Get hydration range failed", {
      route: "GET /patient/hydration/range",
      patientId,
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

router.delete("/patient/hydration/entries/:id", requirePatientAuth, async (req, res) => {
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
      details: [{ path: "id", message: "Invalid hydration entry id" }],
    });
  }

  try {
    const deleted = await HydrationLog.findOneAndDelete({ _id: id, patientId }).lean();
    if (!deleted) {
      return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    }

    return res.json({
      ok: true,
      id,
    });
  } catch (error) {
    logger.error("Delete hydration entry failed", {
      route: "DELETE /patient/hydration/entries/:id",
      patientId,
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

router.get("/clinician/patients/:patientId/hydration/range", async (req, res) => {
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

    const days = await readDayTotals(patientId, range.from, range.to);
    return res.json({
      ok: true,
      patientId,
      from: range.from,
      to: range.to,
      targetMl: DAILY_TARGET_ML,
      days,
    });
  } catch (error) {
    logger.error("Get clinician hydration range failed", {
      route: "GET /clinician/patients/:patientId/hydration/range",
      patientId,
      clinicianId: requestWithUser.user.id,
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

export default router;
