import { Router } from "express";
import { z } from "zod";

import { requirePatientAuth } from "../middleware/patientAuth";
import Patient from "../models/Patient";
import {
  generateWeeklyReport,
  WeeklyReportValidationError,
} from "../services/weeklyReportService";
import type { RequestWithPatient } from "../types/patientAuth";
import type { RequestWithUser } from "../types/auth";
import { logger } from "../utils/logger";

const router = Router();

const weeklyQuerySchema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  tzOffsetMinutes: z.coerce.number().int().min(-840).max(840).optional(),
});

function validationDetails(path: string, message: string) {
  return [{ path, message }];
}

router.get("/patient/reports/weekly", requirePatientAuth, async (req, res) => {
  const requestWithPatient = req as RequestWithPatient;
  const patientId = requestWithPatient.patient?.id;

  if (!patientId) {
    return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  }

  const parsedQuery = weeklyQuerySchema.safeParse(req.query);
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
    const report = await generateWeeklyReport({
      patientId,
      weekStart: parsedQuery.data.weekStart,
      tzOffsetMinutes: parsedQuery.data.tzOffsetMinutes,
    });

    return res.json(report);
  } catch (error) {
    if (error instanceof WeeklyReportValidationError) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        details: validationDetails("weekStart", error.message),
      });
    }

    logger.error("Get patient weekly report failed", {
      route: "GET /patient/reports/weekly",
      patientId,
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

router.get("/clinician/patients/:patientId/reports/weekly", async (req, res) => {
  const requestWithUser = req as RequestWithUser;
  const patientId = typeof req.params.patientId === "string" ? req.params.patientId.trim() : "";

  if (!requestWithUser.user) {
    return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  }

  if (!patientId) {
    return res.status(400).json({
      ok: false,
      error: "VALIDATION_ERROR",
      details: validationDetails("patientId", "patientId is required"),
    });
  }

  const parsedQuery = weeklyQuerySchema.safeParse(req.query);
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
    const patient = await Patient.findOne({ patientId }).select({ patientId: 1 }).lean();
    if (!patient) {
      return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    }

    const report = await generateWeeklyReport({
      patientId,
      weekStart: parsedQuery.data.weekStart,
      tzOffsetMinutes: parsedQuery.data.tzOffsetMinutes,
    });

    return res.json(report);
  } catch (error) {
    if (error instanceof WeeklyReportValidationError) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        details: validationDetails("weekStart", error.message),
      });
    }

    logger.error("Get clinician weekly report failed", {
      route: "GET /clinician/patients/:patientId/reports/weekly",
      patientId,
      clinicianId: requestWithUser.user.id,
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

export default router;
