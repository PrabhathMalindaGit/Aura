import { Router } from "express";
import { Types } from "mongoose";
import { z } from "zod";

import { requirePatientAuth } from "../middleware/patientAuth";
import Medication from "../models/Medication";
import MedicationLog from "../models/MedicationLog";
import MedicationSchedule from "../models/MedicationSchedule";
import Patient from "../models/Patient";
import type { RequestWithUser } from "../types/auth";
import type { RequestWithPatient } from "../types/patientAuth";
import { logger } from "../utils/logger";

const router = Router();

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MAX_NOTE_LENGTH = 280;

const todayQuerySchema = z.object({
  date: z.string().regex(dateRegex).optional(),
  tzOffsetMinutes: z.coerce.number().int().min(-840).max(840).optional(),
});

const logBodySchema = z.object({
  medicationId: z.string().min(1),
  date: z.string().regex(dateRegex).optional(),
  time: z.string().regex(timeRegex),
  status: z.enum(["taken", "skipped"]),
  note: z.string().max(2000).optional(),
});

const rangeQuerySchema = z.object({
  from: z.string().regex(dateRegex).optional(),
  to: z.string().regex(dateRegex).optional(),
});

type ScheduleLike = {
  medicationId?: unknown;
  times?: unknown;
  daysOfWeek?: unknown;
  startDate?: unknown;
  endDate?: unknown;
};

function toDateOnlyLocal(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

function toDateOnlyWithOffset(offsetMinutes: number): string {
  const shifted = new Date(Date.now() + offsetMinutes * 60_000);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(
    2,
    "0"
  )}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
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

function compareDateOnly(left: string, right: string): number {
  return Date.parse(`${left}T00:00:00.000Z`) - Date.parse(`${right}T00:00:00.000Z`);
}

function addDays(date: string, deltaDays: number): string {
  const parsed = parseDateOnly(date);
  if (!parsed) {
    return date;
  }
  const shifted = new Date(parsed.getTime() + deltaDays * 24 * 60 * 60 * 1000);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(
    2,
    "0"
  )}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
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
  return { from: resolvedFrom, to: resolvedTo };
}

function safeNote(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.slice(0, MAX_NOTE_LENGTH);
}

function normalizeTimes(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value.filter((time) => typeof time === "string" && timeRegex.test(time)))].sort(
    (left, right) => left.localeCompare(right)
  );
}

function normalizeDaysOfWeek(value: unknown): number[] {
  if (!Array.isArray(value) || value.length === 0) {
    return [0, 1, 2, 3, 4, 5, 6];
  }
  const unique = [...new Set(value)];
  return unique
    .filter((day): day is number => Number.isInteger(day) && day >= 0 && day <= 6)
    .sort((left, right) => left - right);
}

function appliesOnDate(schedule: ScheduleLike, date: string): boolean {
  const parsed = parseDateOnly(date);
  if (!parsed) {
    return false;
  }

  const daysOfWeek = normalizeDaysOfWeek(schedule.daysOfWeek);
  const dayOfWeek = parsed.getUTCDay();
  if (!daysOfWeek.includes(dayOfWeek)) {
    return false;
  }

  const startDate = typeof schedule.startDate === "string" ? schedule.startDate : undefined;
  const endDate = typeof schedule.endDate === "string" ? schedule.endDate : undefined;

  if (startDate && compareDateOnly(date, startDate) < 0) {
    return false;
  }
  if (endDate && compareDateOnly(date, endDate) > 0) {
    return false;
  }
  return true;
}

function serializeDoseLog(log: {
  _id?: unknown;
  status?: unknown;
  updatedAt?: unknown;
  createdAt?: unknown;
}) {
  const loggedAtSource =
    log.updatedAt instanceof Date
      ? log.updatedAt
      : log.createdAt instanceof Date
        ? log.createdAt
        : null;
  return {
    logId: typeof log._id !== "undefined" ? String(log._id) : undefined,
    status: log.status === "taken" || log.status === "skipped" ? log.status : "due",
    loggedAt: loggedAtSource ? loggedAtSource.toISOString() : undefined,
  };
}

async function fetchMedicationList(patientId: string) {
  const medications = await Medication.find({
    patientId,
    active: true,
  })
    .sort({ createdAt: 1 })
    .select({
      name: 1,
      type: 1,
      instructions: 1,
      active: 1,
    })
    .lean();

  if (medications.length === 0) {
    return [];
  }

  const medicationIds = medications.map((medication) => medication._id);
  const schedules = await MedicationSchedule.find({
    patientId,
    medicationId: { $in: medicationIds },
  })
    .select({
      medicationId: 1,
      times: 1,
      daysOfWeek: 1,
      startDate: 1,
      endDate: 1,
    })
    .lean();

  const scheduleByMedication = new Map<
    string,
    Array<{
      times: string[];
      daysOfWeek: number[];
      startDate?: string;
      endDate?: string;
    }>
  >();

  for (const schedule of schedules) {
    const key = String(schedule.medicationId);
    const current = scheduleByMedication.get(key) ?? [];
    current.push({
      times: normalizeTimes(schedule.times),
      daysOfWeek: normalizeDaysOfWeek(schedule.daysOfWeek),
      startDate: typeof schedule.startDate === "string" ? schedule.startDate : undefined,
      endDate: typeof schedule.endDate === "string" ? schedule.endDate : undefined,
    });
    scheduleByMedication.set(key, current);
  }

  return medications.map((medication) => {
    const medicationId = String(medication._id);
    const scheduleRecords = scheduleByMedication.get(medicationId) ?? [];
    const mergedTimes = [...new Set(scheduleRecords.flatMap((record) => record.times))].sort(
      (left, right) => left.localeCompare(right)
    );
    return {
      id: medicationId,
      name: typeof medication.name === "string" ? medication.name : "Medication",
      type:
        medication.type === "supplement" || medication.type === "medication"
          ? medication.type
          : "medication",
      instructions:
        typeof medication.instructions === "string" ? medication.instructions : undefined,
      active: medication.active !== false,
      schedule: {
        times: mergedTimes,
      },
      _schedules: scheduleRecords,
    };
  });
}

function buildChecklistForDate(
  date: string,
  medications: Array<{
    id: string;
    name: string;
    type: "medication" | "supplement";
    instructions?: string;
    schedule: { times: string[] };
    _schedules: Array<{ times: string[]; daysOfWeek: number[]; startDate?: string; endDate?: string }>;
  }>,
  logs: Array<{
    medicationId?: unknown;
    time?: unknown;
    status?: unknown;
    _id?: unknown;
    updatedAt?: unknown;
    createdAt?: unknown;
  }>
) {
  const logByKey = new Map<string, ReturnType<typeof serializeDoseLog>>();
  for (const log of logs) {
    const medicationId = log.medicationId ? String(log.medicationId) : "";
    const time = typeof log.time === "string" ? log.time : "";
    if (!medicationId || !time) {
      continue;
    }
    logByKey.set(`${medicationId}:${time}`, serializeDoseLog(log));
  }

  return medications.map((medication) => {
    const scheduledTimes = [
      ...new Set(
        medication._schedules
          .filter((schedule) => appliesOnDate(schedule, date))
          .flatMap((schedule) => schedule.times)
      ),
    ].sort((left, right) => left.localeCompare(right));

    const doses = scheduledTimes.map((time) => {
      const matched = logByKey.get(`${medication.id}:${time}`);
      return {
        time,
        status: matched?.status ?? "due",
        loggedAt: matched?.loggedAt,
        logId: matched?.logId,
      };
    });

    return {
      medicationId: medication.id,
      name: medication.name,
      type: medication.type,
      instructions: medication.instructions,
      doses,
    };
  });
}

async function buildAdherenceRange(patientId: string, from: string, to: string) {
  const medications = await fetchMedicationList(patientId);
  if (medications.length === 0) {
    return expandDateRangeInclusive(from, to).map((date) => ({
      date,
      taken: 0,
      skipped: 0,
      totalScheduled: 0,
    }));
  }

  const medicationIds = medications.map((medication) => new Types.ObjectId(medication.id));
  const logs = await MedicationLog.find({
    patientId,
    medicationId: { $in: medicationIds },
    date: { $gte: from, $lte: to },
  })
    .select({ medicationId: 1, date: 1, time: 1, status: 1 })
    .lean();

  const byDate = new Map<
    string,
    {
      taken: number;
      skipped: number;
    }
  >();
  for (const log of logs) {
    const date = typeof log.date === "string" ? log.date : "";
    if (!date) {
      continue;
    }
    const current = byDate.get(date) ?? { taken: 0, skipped: 0 };
    if (log.status === "taken") {
      current.taken += 1;
    } else if (log.status === "skipped") {
      current.skipped += 1;
    }
    byDate.set(date, current);
  }

  return expandDateRangeInclusive(from, to).map((date) => {
    let totalScheduled = 0;
    for (const medication of medications) {
      for (const schedule of medication._schedules) {
        if (appliesOnDate(schedule, date)) {
          totalScheduled += schedule.times.length;
        }
      }
    }

    const current = byDate.get(date) ?? { taken: 0, skipped: 0 };
    return {
      date,
      taken: current.taken,
      skipped: current.skipped,
      totalScheduled,
    };
  });
}

router.get("/patient/medications", requirePatientAuth, async (req, res) => {
  const requestWithPatient = req as RequestWithPatient;
  const patientId = requestWithPatient.patient?.id;
  if (!patientId) {
    return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  }

  try {
    const medications = await fetchMedicationList(patientId);
    return res.json({
      ok: true,
      medications: medications.map(({ _schedules: _ignored, ...item }) => item),
    });
  } catch (error) {
    logger.error("Get patient medications failed", {
      route: "GET /patient/medications",
      patientId,
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

router.get("/patient/medications/today", requirePatientAuth, async (req, res) => {
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

  const date =
    parsedQuery.data.date ??
    (typeof parsedQuery.data.tzOffsetMinutes === "number"
      ? toDateOnlyWithOffset(parsedQuery.data.tzOffsetMinutes)
      : toDateOnlyLocal(new Date()));
  if (!parseDateOnly(date)) {
    return res.status(400).json({
      ok: false,
      error: "VALIDATION_ERROR",
      details: [{ path: "date", message: "date must be a valid YYYY-MM-DD value" }],
    });
  }

  try {
    const medications = await fetchMedicationList(patientId);
    const medicationObjectIds = medications.map((medication) => new Types.ObjectId(medication.id));
    const logs =
      medicationObjectIds.length > 0
        ? await MedicationLog.find({
            patientId,
            medicationId: { $in: medicationObjectIds },
            date,
          })
            .sort({ updatedAt: -1 })
            .select({ medicationId: 1, time: 1, status: 1, createdAt: 1, updatedAt: 1 })
            .lean()
        : [];

    return res.json({
      ok: true,
      date,
      items: buildChecklistForDate(date, medications, logs),
    });
  } catch (error) {
    logger.error("Get medication checklist failed", {
      route: "GET /patient/medications/today",
      patientId,
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

router.post("/patient/medications/log", requirePatientAuth, async (req, res) => {
  const requestWithPatient = req as RequestWithPatient;
  const patientId = requestWithPatient.patient?.id;
  if (!patientId) {
    return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  }

  const parsedBody = logBodySchema.safeParse(req.body);
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

  const medicationIdString = parsedBody.data.medicationId.trim();
  if (!Types.ObjectId.isValid(medicationIdString)) {
    return res.status(400).json({
      ok: false,
      error: "VALIDATION_ERROR",
      details: [{ path: "medicationId", message: "Invalid medicationId" }],
    });
  }

  const date = parsedBody.data.date ?? toDateOnlyLocal(new Date());
  if (!parseDateOnly(date)) {
    return res.status(400).json({
      ok: false,
      error: "VALIDATION_ERROR",
      details: [{ path: "date", message: "date must be a valid YYYY-MM-DD value" }],
    });
  }

  try {
    const medication = await Medication.findOne({
      _id: medicationIdString,
      patientId,
      active: true,
    })
      .select({ _id: 1 })
      .lean();
    if (!medication) {
      return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    }

    const updated = await MedicationLog.findOneAndUpdate(
      {
        patientId,
        medicationId: medication._id,
        date,
        time: parsedBody.data.time,
      },
      {
        $set: {
          status: parsedBody.data.status,
          note: safeNote(parsedBody.data.note),
          source: "manual",
        },
        $setOnInsert: {
          patientId,
          medicationId: medication._id,
          date,
          time: parsedBody.data.time,
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
      id: updated ? String(updated._id) : undefined,
      date,
      time: parsedBody.data.time,
      status: parsedBody.data.status,
      loggedAt: updated?.updatedAt instanceof Date ? updated.updatedAt.toISOString() : undefined,
    });
  } catch (error) {
    logger.error("Log medication dose failed", {
      route: "POST /patient/medications/log",
      patientId,
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

router.get("/patient/medications/logs/range", requirePatientAuth, async (req, res) => {
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
    const days = await buildAdherenceRange(patientId, range.from, range.to);
    return res.json({
      ok: true,
      from: range.from,
      to: range.to,
      days,
    });
  } catch (error) {
    logger.error("Get medication adherence range failed", {
      route: "GET /patient/medications/logs/range",
      patientId,
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

router.get("/clinician/patients/:patientId/medications", async (req, res) => {
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

  try {
    const patientExists = await Patient.exists({ patientId });
    if (!patientExists) {
      return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    }

    const medications = await fetchMedicationList(patientId);
    return res.json({
      ok: true,
      patientId,
      medications: medications.map(({ _schedules: _ignored, ...item }) => item),
    });
  } catch (error) {
    logger.error("Get clinician medications failed", {
      route: "GET /clinician/patients/:patientId/medications",
      patientId,
      clinicianId: requestWithUser.user.id,
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

router.get("/clinician/patients/:patientId/medications/adherence", async (req, res) => {
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
    const patientExists = await Patient.exists({ patientId });
    if (!patientExists) {
      return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    }

    const days = await buildAdherenceRange(patientId, range.from, range.to);
    return res.json({
      ok: true,
      patientId,
      from: range.from,
      to: range.to,
      days,
    });
  } catch (error) {
    logger.error("Get clinician medication adherence failed", {
      route: "GET /clinician/patients/:patientId/medications/adherence",
      patientId,
      clinicianId: requestWithUser.user.id,
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

export default router;
