import { Router } from "express";
import { z } from "zod";

import { requirePatientAuth } from "../middleware/patientAuth";
import InsightSuggestion from "../models/InsightSuggestion";
import Patient from "../models/Patient";
import {
  approveInsight,
  InsightSuggestionNotFoundError,
  InsightSuggestionValidationError,
  rejectInsight,
  upsertPendingInsights,
} from "../services/insightsService";
import type { RequestWithUser } from "../types/auth";
import type { RequestWithPatient } from "../types/patientAuth";
import { isObjectId } from "../utils/ids";
import { logger } from "../utils/logger";

const router = Router();

const patientListQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(20).optional().default(5),
});

const queueQuerySchema = z.object({
  status: z.enum(["pending", "approved", "rejected"]).optional().default("pending"),
  limit: z.coerce.number().int().positive().max(100).optional().default(50),
});

const reviewBodySchema = z.object({
  status: z.enum(["approved", "rejected"]),
});

const generateBodySchema = z.object({
  windowDays: z.coerce.number().int().min(1).max(60).optional().default(14),
});

const patientInsightsQuerySchema = z.object({
  status: z.enum(["pending", "approved", "rejected"]).optional(),
  limit: z.coerce.number().int().positive().max(100).optional().default(50),
});

const idParamsSchema = z.object({
  id: z.string().min(1),
});

function mapInsightCard(row: {
  _id: unknown;
  title?: unknown;
  message?: unknown;
  category?: unknown;
  priority?: unknown;
  confidence?: unknown;
  createdAt?: unknown;
  reviewedAt?: unknown;
}) {
  return {
    id: String(row._id ?? ""),
    title: typeof row.title === "string" ? row.title : "",
    message: typeof row.message === "string" ? row.message : "",
    category: typeof row.category === "string" ? row.category : "habits",
    priority: typeof row.priority === "number" ? row.priority : 1,
    confidence: typeof row.confidence === "string" ? row.confidence : "low",
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : new Date(0).toISOString(),
    reviewedAt: row.reviewedAt instanceof Date ? row.reviewedAt.toISOString() : undefined,
  };
}

router.get("/patient/insights", requirePatientAuth, async (req, res) => {
  const requestWithPatient = req as RequestWithPatient;
  const patientId = requestWithPatient.patient?.id;
  if (!patientId) {
    return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  }

  const parsedQuery = patientListQuerySchema.safeParse(req.query);
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
    const rows = await InsightSuggestion.find({
      patientId,
      status: "approved",
    })
      .sort({ reviewedAt: -1, createdAt: -1 })
      .limit(parsedQuery.data.limit)
      .select({
        title: 1,
        message: 1,
        category: 1,
        priority: 1,
        confidence: 1,
        createdAt: 1,
        reviewedAt: 1,
      })
      .lean();

    return res.json({
      ok: true,
      items: rows.map((row) => mapInsightCard(row)),
    });
  } catch (error) {
    logger.error("Get patient insights failed", {
      route: "GET /patient/insights",
      patientId,
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

router.get("/clinician/insights", async (req, res) => {
  const requestWithUser = req as RequestWithUser;
  if (!requestWithUser.user) {
    return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  }

  const parsedQuery = queueQuerySchema.safeParse(req.query);
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
    const rows = await InsightSuggestion.find({
      status: parsedQuery.data.status,
    })
      .sort({ priority: -1, createdAt: -1 })
      .limit(parsedQuery.data.limit)
      .select({
        patientId: 1,
        windowDays: 1,
        status: 1,
        title: 1,
        message: 1,
        category: 1,
        confidence: 1,
        priority: 1,
        createdAt: 1,
        reviewedAt: 1,
      })
      .lean();

    const patientIds = [...new Set(rows.map((row) => String(row.patientId ?? "")).filter(Boolean))];
    const patients = await Patient.find({ patientId: { $in: patientIds } })
      .select({ patientId: 1, displayName: 1 })
      .lean();
    const patientNameMap = new Map(
      patients.map((row) => [row.patientId, row.displayName?.trim() || undefined])
    );

    return res.json({
      ok: true,
      items: rows.map((row) => ({
        ...mapInsightCard(row),
        patientId: typeof row.patientId === "string" ? row.patientId : "",
        patientDisplayName:
          typeof row.patientId === "string"
            ? patientNameMap.get(row.patientId) || undefined
            : undefined,
        status:
          row.status === "pending" || row.status === "approved" || row.status === "rejected"
            ? row.status
            : "pending",
        windowDays: typeof row.windowDays === "number" ? row.windowDays : 14,
      })),
    });
  } catch (error) {
    logger.error("Get clinician insights queue failed", {
      route: "GET /clinician/insights",
      clinicianId: requestWithUser.user.id,
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

router.patch("/clinician/insights/:id", async (req, res) => {
  const requestWithUser = req as RequestWithUser;
  if (!requestWithUser.user) {
    return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  }

  const parsedParams = idParamsSchema.safeParse(req.params);
  if (!parsedParams.success || !isObjectId(parsedParams.data.id)) {
    return res.status(400).json({
      ok: false,
      error: "VALIDATION_ERROR",
      details: [{ path: "id", message: "Invalid insight id" }],
    });
  }

  const parsedBody = reviewBodySchema.safeParse(req.body);
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
    const updated =
      parsedBody.data.status === "approved"
        ? await approveInsight(parsedParams.data.id, requestWithUser.user)
        : await rejectInsight(parsedParams.data.id, requestWithUser.user);

    return res.json({
      ok: true,
      item: {
        ...mapInsightCard(updated.toObject()),
        patientId: updated.patientId,
        status: updated.status,
        windowDays: updated.windowDays,
      },
    });
  } catch (error) {
    if (error instanceof InsightSuggestionNotFoundError) {
      return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    }
    logger.error("Review insight failed", {
      route: "PATCH /clinician/insights/:id",
      clinicianId: requestWithUser.user.id,
      insightId: parsedParams.data.id,
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

router.post("/clinician/patients/:patientId/insights/generate", async (req, res) => {
  const requestWithUser = req as RequestWithUser;
  const patientId = typeof req.params.patientId === "string" ? req.params.patientId.trim() : "";
  if (!requestWithUser.user) {
    return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  }

  if (!patientId) {
    return res.status(400).json({
      ok: false,
      error: "VALIDATION_ERROR",
      details: [{ path: "patientId", message: "patientId is required" }],
    });
  }

  const parsedBody = generateBodySchema.safeParse(req.body ?? {});
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
    const patient = await Patient.findOne({ patientId }).select({ patientId: 1 }).lean();
    if (!patient) {
      return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    }

    const result = await upsertPendingInsights(patientId, parsedBody.data.windowDays);
    return res.json({
      ok: true,
      patientId,
      windowDays: parsedBody.data.windowDays,
      created: result.created,
      skipped: result.skipped,
    });
  } catch (error) {
    if (error instanceof InsightSuggestionValidationError) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        details: [{ path: "windowDays", message: error.message }],
      });
    }
    logger.error("Generate insights failed", {
      route: "POST /clinician/patients/:patientId/insights/generate",
      clinicianId: requestWithUser.user.id,
      patientId,
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

router.get("/clinician/patients/:patientId/insights", async (req, res) => {
  const requestWithUser = req as RequestWithUser;
  const patientId = typeof req.params.patientId === "string" ? req.params.patientId.trim() : "";
  if (!requestWithUser.user) {
    return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  }

  if (!patientId) {
    return res.status(400).json({
      ok: false,
      error: "VALIDATION_ERROR",
      details: [{ path: "patientId", message: "patientId is required" }],
    });
  }

  const parsedQuery = patientInsightsQuerySchema.safeParse(req.query);
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

    const filter: Record<string, unknown> = { patientId };
    if (parsedQuery.data.status) {
      filter.status = parsedQuery.data.status;
    }

    const rows = await InsightSuggestion.find(filter)
      .sort({ createdAt: -1, priority: -1 })
      .limit(parsedQuery.data.limit)
      .select({
        patientId: 1,
        windowDays: 1,
        status: 1,
        title: 1,
        message: 1,
        category: 1,
        confidence: 1,
        priority: 1,
        createdAt: 1,
        reviewedAt: 1,
      })
      .lean();

    return res.json({
      ok: true,
      patientId,
      items: rows.map((row) => ({
        ...mapInsightCard(row),
        patientId: typeof row.patientId === "string" ? row.patientId : "",
        status:
          row.status === "pending" || row.status === "approved" || row.status === "rejected"
            ? row.status
            : "pending",
        windowDays: typeof row.windowDays === "number" ? row.windowDays : 14,
      })),
    });
  } catch (error) {
    logger.error("Get patient-scoped insights failed", {
      route: "GET /clinician/patients/:patientId/insights",
      clinicianId: requestWithUser.user.id,
      patientId,
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

export default router;
