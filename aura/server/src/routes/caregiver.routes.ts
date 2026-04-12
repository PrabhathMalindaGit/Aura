import crypto from "node:crypto";

import { Router } from "express";
import { z } from "zod";

import { requireCaregiverAuth } from "../middleware/caregiverAuth";
import { requirePatientAuth } from "../middleware/patientAuth";
import CaregiverInvite from "../models/CaregiverInvite";
import Patient from "../models/Patient";
import {
  listCaregiverAccessForPatient,
  mapCaregiverAccess,
  recordCaregiverSurfaceAccess,
  writeCaregiverEvent,
} from "../services/caregiverAccessService";
import {
  buildCaregiverSummaryView,
  buildCaregiverWeeklyReportView,
} from "../services/caregiverViewService";
import { WeeklyReportValidationError } from "../services/weeklyReportService";
import type { RequestWithCaregiver } from "../types/caregiverAuth";
import type { RequestWithPatient } from "../types/patientAuth";
import { isObjectId } from "../utils/ids";
import { logger } from "../utils/logger";
import {
  hasCaregiverJwtSecretConfigured,
  signCaregiverToken,
} from "../utils/caregiverJwt";

const router = Router();

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
const inviteCodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const inviteCodePayloadLength = 8;
const inviteCodePrefix = "CG";

const createInviteBodySchema = z.object({
  expiresHours: z.coerce.number().int().min(1).max(168).optional().default(24),
  relationship: z.string().trim().min(1).max(80).optional(),
});

const caregiverLoginBodySchema = z.object({
  code: z.string().trim().min(1).max(64),
  caregiverName: z.string().trim().min(1).max(120).optional(),
});

const weeklyReportQuerySchema = z.object({
  weekStart: z.string().regex(dateRegex).optional(),
  tzOffsetMinutes: z.coerce.number().int().min(-840).max(840).optional(),
});

function randomInvitePayload(length: number): string {
  const bytes = crypto.randomBytes(length);
  let value = "";
  for (let i = 0; i < length; i += 1) {
    value += inviteCodeAlphabet[bytes[i] % inviteCodeAlphabet.length];
  }
  return value;
}

function formatInviteCodeFromCanonical(canonical: string): string {
  const payload = canonical.slice(inviteCodePrefix.length);
  return `${inviteCodePrefix}-${payload.slice(0, 4)}-${payload.slice(4, 8)}`;
}

function normalizeInviteCode(raw: string): string | null {
  const normalized = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (
    !normalized.startsWith(inviteCodePrefix) ||
    normalized.length !== inviteCodePrefix.length + inviteCodePayloadLength
  ) {
    return null;
  }
  return normalized;
}

function hashInviteCode(canonical: string): string {
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

function toTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function createInviteCodeRecord(patientId: string, expiresHours: number, relationship?: string | null) {
  const expiresAt = new Date(Date.now() + expiresHours * 60 * 60 * 1000);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const canonical = `${inviteCodePrefix}${randomInvitePayload(
      inviteCodePayloadLength
    )}`;
    const codeHash = hashInviteCode(canonical);

    try {
      const created = await CaregiverInvite.create({
        patientId,
        codeHash,
        codeHint: canonical.slice(-4),
        expiresAt,
        relationship: relationship?.trim() || undefined,
      });

      return {
        created,
        code: formatInviteCodeFromCanonical(canonical),
      };
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: unknown }).code === 11000
      ) {
        continue;
      }
      throw error;
    }
  }

  throw new Error("Failed to generate unique caregiver invite code");
}

router.post("/patient/caregiver/invites", requirePatientAuth, async (req, res) => {
  const requestWithPatient = req as RequestWithPatient;
  const patientId = requestWithPatient.patient?.id;
  if (!patientId) {
    return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  }

  if (!hasCaregiverJwtSecretConfigured()) {
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }

  const parsedBody = createInviteBodySchema.safeParse(req.body ?? {});
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
    const generated = await createInviteCodeRecord(
      patientId,
      parsedBody.data.expiresHours,
      parsedBody.data.relationship ?? null
    );

    await writeCaregiverEvent("CAREGIVER_GRANTED", patientId, String(generated.created._id), {
      relationship: parsedBody.data.relationship?.trim() || undefined,
      expiresAt: generated.created.expiresAt,
    });

    return res.json({
      ok: true,
      code: generated.code,
      expiresAt: generated.created.expiresAt.toISOString(),
      inviteId: String(generated.created._id),
      codeHint: generated.created.codeHint,
      relationship: toTrimmedString(generated.created.relationship),
      caregiverName: toTrimmedString(generated.created.caregiverName),
      lastAccessedAt: null,
    });
  } catch (error) {
    logger.error("Create caregiver invite failed", {
      route: "POST /patient/caregiver/invites",
      patientId,
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

router.get("/patient/caregiver/invites", requirePatientAuth, async (req, res) => {
  const requestWithPatient = req as RequestWithPatient;
  const patientId = requestWithPatient.patient?.id;
  if (!patientId) {
    return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  }

  try {
    return res.json({
      ok: true,
      items: await listCaregiverAccessForPatient(patientId),
    });
  } catch (error) {
    logger.error("List caregiver invites failed", {
      route: "GET /patient/caregiver/invites",
      patientId,
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

router.post(
  "/patient/caregiver/invites/:inviteId/revoke",
  requirePatientAuth,
  async (req, res) => {
    const requestWithPatient = req as RequestWithPatient;
    const patientId = requestWithPatient.patient?.id;
    if (!patientId) {
      return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
    }

    const inviteId =
      typeof req.params.inviteId === "string" ? req.params.inviteId.trim() : "";
    if (!isObjectId(inviteId)) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        details: [{ path: "inviteId", message: "Invalid invite id" }],
      });
    }

    try {
      const updated = await CaregiverInvite.findOneAndUpdate(
        {
          _id: inviteId,
          patientId,
          revokedAt: null,
        },
        {
          $set: {
            revokedAt: new Date(),
          },
        },
        { new: true }
      )
        .select({ _id: 1, revokedAt: 1, relationship: 1, caregiverName: 1, lastAccessedAt: 1 })
        .lean();

      if (!updated) {
        return res.status(404).json({ ok: false, error: "NOT_FOUND" });
      }

      await writeCaregiverEvent("CAREGIVER_REVOKED", patientId, String(updated._id), {
        revokedAt: updated.revokedAt,
      });

      return res.json({
        ok: true,
        inviteId: String(updated._id),
        revokedAt:
          updated.revokedAt instanceof Date
            ? updated.revokedAt.toISOString()
            : new Date().toISOString(),
        relationship: toTrimmedString((updated as { relationship?: unknown }).relationship),
        caregiverName: toTrimmedString((updated as { caregiverName?: unknown }).caregiverName),
        lastAccessedAt:
          (updated as { lastAccessedAt?: unknown }).lastAccessedAt instanceof Date
            ? ((updated as { lastAccessedAt: Date }).lastAccessedAt.toISOString())
            : null,
      });
    } catch (error) {
      logger.error("Revoke caregiver invite failed", {
        route: "POST /patient/caregiver/invites/:inviteId/revoke",
        patientId,
        message: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
    }
  }
);

router.post("/caregiver/auth/login", async (req, res) => {
  if (!hasCaregiverJwtSecretConfigured()) {
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }

  const parsedBody = caregiverLoginBodySchema.safeParse(req.body);
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
    const normalizedCode = normalizeInviteCode(parsedBody.data.code);
    if (!normalizedCode) {
      return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
    }

    const codeHash = hashInviteCode(normalizedCode);
    const invite = await CaregiverInvite.findOne({
      codeHash,
    }).lean();

    if (!invite || invite.revokedAt instanceof Date || invite.expiresAt.getTime() <= Date.now()) {
      return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
    }

    const patient = await Patient.findOne({ patientId: invite.patientId })
      .select({ patientId: 1, displayName: 1 })
      .lean();

    if (!patient) {
      return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
    }

    const caregiverName = parsedBody.data.caregiverName?.trim() || undefined;
    const now = new Date();
    const updatedInvite = await CaregiverInvite.findOneAndUpdate(
      { _id: invite._id },
      {
        $set: {
          usedAt: invite.usedAt instanceof Date ? invite.usedAt : now,
          caregiverName: caregiverName || invite.caregiverName,
          lastAccessedAt: now,
        },
      },
      { new: true }
    ).lean();

    const token = signCaregiverToken({
      patientId: invite.patientId,
      inviteId: String(invite._id),
    });

    await writeCaregiverEvent("CAREGIVER_ACCESSED", invite.patientId, String(invite._id), {
      caregiverName: caregiverName || toTrimmedString(invite.caregiverName) || undefined,
      relationship: toTrimmedString(invite.relationship) || undefined,
      accessedAt: now,
    });

    return res.json({
      ok: true,
      token,
      patient: {
        id: patient.patientId,
        displayName:
          typeof patient.displayName === "string"
            ? patient.displayName
            : undefined,
      },
      access: mapCaregiverAccess((updatedInvite as Record<string, unknown>) ?? (invite as Record<string, unknown>)),
    });
  } catch (error) {
    logger.error("Caregiver login failed", {
      route: "POST /caregiver/auth/login",
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

router.get("/caregiver/summary", requireCaregiverAuth, async (req, res) => {
  const requestWithCaregiver = req as RequestWithCaregiver;
  const patientId = requestWithCaregiver.caregiver?.patientId;
  const inviteId = requestWithCaregiver.caregiver?.inviteId;
  if (!patientId) {
    return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  }
  if (!inviteId) {
    return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  }

  try {
    const access = await recordCaregiverSurfaceAccess({
      patientId,
      inviteId,
      surface: "summary",
      eventType: "CAREGIVER_SUMMARY_ACCESSED",
    });
    if (!access) {
      return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
    }

    const summary = await buildCaregiverSummaryView({
      patientId,
      access,
    });
    if (!summary) {
      return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    }

    return res.json(summary);
  } catch (error) {
    logger.error("Get caregiver summary failed", {
      route: "GET /caregiver/summary",
      patientId,
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

router.get("/caregiver/reports/weekly", requireCaregiverAuth, async (req, res) => {
  const requestWithCaregiver = req as RequestWithCaregiver;
  const patientId = requestWithCaregiver.caregiver?.patientId;
  const inviteId = requestWithCaregiver.caregiver?.inviteId;
  if (!patientId) {
    return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  }
  if (!inviteId) {
    return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  }

  const parsedQuery = weeklyReportQuerySchema.safeParse(req.query);
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
    const access = await recordCaregiverSurfaceAccess({
      patientId,
      inviteId,
      surface: "weekly_report",
      eventType: "CAREGIVER_WEEKLY_REPORT_ACCESSED",
    });
    if (!access) {
      return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
    }

    const report = await buildCaregiverWeeklyReportView({
      patientId,
      access,
      weekStart: parsedQuery.data.weekStart,
      tzOffsetMinutes: parsedQuery.data.tzOffsetMinutes,
    });
    if (!report) {
      return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    }

    return res.json(report);
  } catch (error) {
    if (error instanceof WeeklyReportValidationError) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        details: [{ path: "weekStart", message: error.message }],
      });
    }
    logger.error("Get caregiver weekly report failed", {
      route: "GET /caregiver/reports/weekly",
      patientId,
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

export default router;
