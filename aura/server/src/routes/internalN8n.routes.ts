import { Router } from "express";
import { z } from "zod";

import Alert from "../models/Alert";
import {
  buildDailyClinicianDigest,
  processAppointmentFollowThroughAutomation,
  processCommunicationNoResponseAutomation,
  processMissedCheckinAutomation,
  processTaskReminderAutomation,
} from "../services/followThroughAutomationService";
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

const processBodySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional().default(25),
  force: z.boolean().optional().default(false),
  now: z.string().trim().optional(),
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

function parseProcessBody(body: unknown) {
  const parsed = processBodySchema.safeParse(
    body && typeof body === "object" && !Array.isArray(body) ? body : {}
  );
  if (!parsed.success) {
    return {
      ok: false as const,
      response: {
        ok: false,
        error: "VALIDATION_ERROR",
        details: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
    };
  }

  let now: Date | undefined;
  if (parsed.data.now) {
    const parsedDate = new Date(parsed.data.now);
    if (!Number.isFinite(parsedDate.getTime())) {
      return {
        ok: false as const,
        response: {
          ok: false,
          error: "VALIDATION_ERROR",
          details: [
            {
              path: "now",
              message: "now must be a valid ISO datetime string",
            },
          ],
        },
      };
    }
    now = parsedDate;
  }

  return {
    ok: true as const,
    value: {
      limit: parsed.data.limit,
      force: parsed.data.force,
      now,
    },
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

router.post(
  "/internal/n8n/follow-through/missed-checkins/process",
  requireWebhookKey,
  async (req, res) => {
    const parsedBody = parseProcessBody(req.body);
    if (!parsedBody.ok) {
      return res.status(400).json(parsedBody.response);
    }

    try {
      const result = await processMissedCheckinAutomation(parsedBody.value);
      return res.json({ ok: true, ...result });
    } catch (error) {
      logger.error("Process missed check-in follow-through failed", {
        route: "POST /internal/n8n/follow-through/missed-checkins/process",
        message: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
    }
  }
);

router.post(
  "/internal/n8n/follow-through/tasks/process",
  requireWebhookKey,
  async (req, res) => {
    const parsedBody = parseProcessBody(req.body);
    if (!parsedBody.ok) {
      return res.status(400).json(parsedBody.response);
    }

    try {
      const result = await processTaskReminderAutomation(parsedBody.value);
      return res.json({ ok: true, ...result });
    } catch (error) {
      logger.error("Process task reminder automation failed", {
        route: "POST /internal/n8n/follow-through/tasks/process",
        message: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
    }
  }
);

router.post(
  "/internal/n8n/follow-through/appointments/process",
  requireWebhookKey,
  async (req, res) => {
    const parsedBody = parseProcessBody(req.body);
    if (!parsedBody.ok) {
      return res.status(400).json(parsedBody.response);
    }

    try {
      const result = await processAppointmentFollowThroughAutomation(parsedBody.value);
      return res.json({ ok: true, ...result });
    } catch (error) {
      logger.error("Process appointment follow-through failed", {
        route: "POST /internal/n8n/follow-through/appointments/process",
        message: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
    }
  }
);

router.post(
  "/internal/n8n/follow-through/communications/process",
  requireWebhookKey,
  async (req, res) => {
    const parsedBody = parseProcessBody(req.body);
    if (!parsedBody.ok) {
      return res.status(400).json(parsedBody.response);
    }

    try {
      const result = await processCommunicationNoResponseAutomation(parsedBody.value);
      return res.json({ ok: true, ...result });
    } catch (error) {
      logger.error("Process communication no-response automation failed", {
        route: "POST /internal/n8n/follow-through/communications/process",
        message: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
    }
  }
);

router.post(
  "/internal/n8n/follow-through/digest/process",
  requireWebhookKey,
  async (req, res) => {
    const parsedBody = parseProcessBody(req.body);
    if (!parsedBody.ok) {
      return res.status(400).json(parsedBody.response);
    }

    try {
      const result = await buildDailyClinicianDigest(parsedBody.value);
      return res.json({ ok: true, ...result });
    } catch (error) {
      logger.error("Build daily clinician digest failed", {
        route: "POST /internal/n8n/follow-through/digest/process",
        message: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
    }
  }
);

export default router;
