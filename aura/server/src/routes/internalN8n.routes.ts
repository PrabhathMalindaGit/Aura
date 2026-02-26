import { Router } from "express";
import { z } from "zod";

import Alert from "../models/Alert";
import { isObjectId } from "../utils/ids";
import { logger } from "../utils/logger";
import { requireWebhookKey } from "../utils/webhookAuth";

const router = Router();

const listQuerySchema = z.object({
  status: z.enum(["open", "acknowledged", "resolved"]).optional().default("open"),
  limit: z.coerce.number().int().positive().max(200).optional().default(50),
});

const patchSchema = z.object({
  status: z.enum(["acknowledged", "resolved"]),
});

function mapAlertRow(alert: Record<string, unknown>) {
  return {
    _id: String(alert._id ?? ""),
    patientId: typeof alert.patientId === "string" ? alert.patientId : "",
    risk: typeof alert.risk === "string" ? alert.risk : "high",
    reason:
      typeof alert.reason === "string" || Array.isArray(alert.reason)
        ? alert.reason
        : "",
    source:
      alert.source &&
      typeof alert.source === "object" &&
      !Array.isArray(alert.source)
        ? alert.source
        : undefined,
    status:
      alert.status === "open" ||
      alert.status === "acknowledged" ||
      alert.status === "resolved"
        ? alert.status
        : "open",
    createdAt:
      alert.createdAt instanceof Date
        ? alert.createdAt.toISOString()
        : String(alert.createdAt ?? ""),
    updatedAt:
      alert.updatedAt instanceof Date
        ? alert.updatedAt.toISOString()
        : String(alert.updatedAt ?? ""),
    acknowledgedAt:
      alert.acknowledgedAt instanceof Date
        ? alert.acknowledgedAt.toISOString()
        : undefined,
    resolvedAt:
      alert.resolvedAt instanceof Date
        ? alert.resolvedAt.toISOString()
        : undefined,
  };
}

router.get("/internal/n8n/alerts", requireWebhookKey, async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: "VALIDATION_ERROR",
      details: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }

  try {
    const rows = await Alert.find({ status: parsed.data.status })
      .sort({ createdAt: -1 })
      .limit(parsed.data.limit)
      .lean();

    return res.json({
      ok: true,
      alerts: rows.map((row) => mapAlertRow(row as Record<string, unknown>)),
    });
  } catch (error) {
    logger.error("List internal n8n alerts failed", {
      route: "GET /internal/n8n/alerts",
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({
      ok: false,
      error: "INTERNAL_ERROR",
    });
  }
});

router.patch("/internal/n8n/alerts/:id", requireWebhookKey, async (req, res) => {
  const alertId = typeof req.params.id === "string" ? req.params.id : "";
  if (!isObjectId(alertId)) {
    return res.status(400).json({
      ok: false,
      error: "VALIDATION_ERROR",
      details: [{ path: "id", message: "Invalid alert id" }],
    });
  }

  const parsedBody = patchSchema.safeParse(req.body);
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
    const update: Record<string, unknown> = {
      status: parsedBody.data.status,
    };
    if (parsedBody.data.status === "acknowledged") {
      update.acknowledgedAt = new Date();
    }
    if (parsedBody.data.status === "resolved") {
      update.resolvedAt = new Date();
    }

    const alert = await Alert.findByIdAndUpdate(alertId, update, {
      new: true,
    }).lean();

    if (!alert) {
      return res.status(404).json({
        ok: false,
        error: "NOT_FOUND",
      });
    }

    return res.json({
      ok: true,
      alert: mapAlertRow(alert as Record<string, unknown>),
    });
  } catch (error) {
    logger.error("Patch internal n8n alert failed", {
      route: "PATCH /internal/n8n/alerts/:id",
      alertId,
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({
      ok: false,
      error: "INTERNAL_ERROR",
    });
  }
});

export default router;
