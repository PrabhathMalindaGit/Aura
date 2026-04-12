import crypto from "node:crypto";

import { Router } from "express";
import { z } from "zod";

import { requireCaregiverAuth } from "../middleware/caregiverAuth";
import { requirePatientAuth } from "../middleware/patientAuth";
import Alert from "../models/Alert";
import AppointmentRequest from "../models/AppointmentRequest";
import AppointmentSlot from "../models/AppointmentSlot";
import CareEvent from "../models/CareEvent";
import CaregiverInvite from "../models/CaregiverInvite";
import CheckIn from "../models/CheckIn";
import HydrationLog from "../models/HydrationLog";
import Medication from "../models/Medication";
import MedicationLog from "../models/MedicationLog";
import MedicationSchedule from "../models/MedicationSchedule";
import NutritionLog from "../models/NutritionLog";
import Patient from "../models/Patient";
import PromInstance from "../models/PromInstance";
import ExercisePlan from "../models/ExercisePlan";
import {
  generateWeeklyReport,
  WeeklyReportValidationError,
} from "../services/weeklyReportService";
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

function parseDateOnlyUtc(value: string): Date | null {
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

function compareDateOnly(left: string, right: string): number {
  return Date.parse(`${left}T00:00:00.000Z`) - Date.parse(`${right}T00:00:00.000Z`);
}

function scheduleAppliesOnDate(
  schedule: {
    daysOfWeek?: unknown;
    startDate?: unknown;
    endDate?: unknown;
  },
  date: string
): boolean {
  const parsed = parseDateOnlyUtc(date);
  if (!parsed) {
    return false;
  }

  const rawDays = Array.isArray(schedule.daysOfWeek)
    ? schedule.daysOfWeek
    : [0, 1, 2, 3, 4, 5, 6];
  const days = rawDays.filter(
    (value): value is number =>
      Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 6
  );

  if (!days.includes(parsed.getUTCDay())) {
    return false;
  }

  const startDate =
    typeof schedule.startDate === "string" && schedule.startDate.trim()
      ? schedule.startDate
      : null;
  const endDate =
    typeof schedule.endDate === "string" && schedule.endDate.trim()
      ? schedule.endDate
      : null;

  if (startDate && compareDateOnly(date, startDate) < 0) {
    return false;
  }
  if (endDate && compareDateOnly(date, endDate) > 0) {
    return false;
  }

  return true;
}

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

function toIsoString(value: unknown): string | null {
  return value instanceof Date && Number.isFinite(value.getTime()) ? value.toISOString() : null;
}

function mapCaregiverAccess(invite: Record<string, unknown>) {
  return {
    inviteId: String(invite._id ?? ""),
    codeHint: typeof invite.codeHint === "string" ? invite.codeHint : "",
    expiresAt: toIsoString(invite.expiresAt) ?? new Date(0).toISOString(),
    usedAt: toIsoString(invite.usedAt),
    revokedAt: toIsoString(invite.revokedAt),
    relationship: toTrimmedString(invite.relationship),
    caregiverName: toTrimmedString(invite.caregiverName),
    lastAccessedAt: toIsoString(invite.lastAccessedAt),
  };
}

async function writeCaregiverEvent(
  type: string,
  patientId: string,
  inviteId: string | null,
  payload: Record<string, unknown>
): Promise<void> {
  await CareEvent.create({
    type,
    patientId,
    payload: {
      ...payload,
      inviteId: inviteId ?? undefined,
    },
  });
}

async function readNextAppointmentSummary(patientId: string) {
  const approvedRequests = await AppointmentRequest.find({
    patientId,
    status: "approved",
  })
    .select({ slotId: 1, status: 1 })
    .lean();

  if (approvedRequests.length === 0) {
    return null;
  }

  const slotIds = approvedRequests
    .map((item) => item.slotId)
    .filter(Boolean);

  if (slotIds.length === 0) {
    return null;
  }

  const slots = await AppointmentSlot.find({
    _id: { $in: slotIds },
    startsAt: { $gte: new Date() },
  })
    .select({ startsAt: 1, endsAt: 1, modality: 1 })
    .sort({ startsAt: 1 })
    .lean();

  const nextSlot = slots[0];
  if (!nextSlot) {
    return null;
  }

  return {
    startsAt: toIsoString(nextSlot.startsAt) ?? new Date(0).toISOString(),
    endsAt: toIsoString(nextSlot.endsAt) ?? new Date(0).toISOString(),
    modality: nextSlot.modality === "video" ? "video" : "video",
  };
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

async function readMedicationSummaryForDate(
  patientId: string,
  date: string
): Promise<{ taken: number; scheduled: number } | null> {
  const medications = await Medication.find({ patientId, active: true })
    .select({ _id: 1 })
    .lean();
  if (medications.length === 0) {
    return null;
  }

  const medicationIds = medications.map((item) => item._id);
  const [schedules, logs] = await Promise.all([
    MedicationSchedule.find({
      patientId,
      medicationId: { $in: medicationIds },
    })
      .select({ times: 1, daysOfWeek: 1, startDate: 1, endDate: 1 })
      .lean(),
    MedicationLog.find({
      patientId,
      medicationId: { $in: medicationIds },
      date,
    })
      .select({ status: 1 })
      .lean(),
  ]);

  let scheduled = 0;
  for (const schedule of schedules) {
    if (!scheduleAppliesOnDate(schedule, date)) {
      continue;
    }
    const times = Array.isArray(schedule.times)
      ? schedule.times.filter((time): time is string => typeof time === "string")
      : [];
    scheduled += times.length;
  }

  const taken = logs.reduce(
    (count, item) => count + (item.status === "taken" ? 1 : 0),
    0
  );

  return {
    taken,
    scheduled,
  };
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
    const now = new Date();
    const invites = await CaregiverInvite.find({
      patientId,
      revokedAt: null,
      expiresAt: { $gt: now },
    })
      .sort({ createdAt: -1 })
      .select({ codeHint: 1, expiresAt: 1, usedAt: 1, revokedAt: 1, createdAt: 1, relationship: 1, caregiverName: 1, lastAccessedAt: 1 })
      .lean();

    return res.json({
      ok: true,
      items: invites.map((invite) => mapCaregiverAccess(invite as Record<string, unknown>)),
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
        lastAccessedAt: toIsoString((updated as { lastAccessedAt?: unknown }).lastAccessedAt),
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
  if (!patientId) {
    return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  }

  try {
    const [patient, lastCheckin, plan, nextAppointment] = await Promise.all([
      Patient.findOne({ patientId })
        .select({ patientId: 1, displayName: 1, rehab: 1 })
        .lean(),
      CheckIn.findOne({ patientId })
        .sort({ createdAt: -1 })
        .select({
          date: 1,
          pain: 1,
          mood: 1,
          adherence: 1,
          sleep: 1,
          createdAt: 1,
        })
        .lean(),
      ExercisePlan.findOne({ patientId })
        .select({ title: 1, items: 1, version: 1 })
        .lean(),
      readNextAppointmentSummary(patientId),
    ]);

    if (!patient) {
      return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    }

    const lastCheckinDate =
      typeof lastCheckin?.date === "string" && dateRegex.test(lastCheckin.date)
        ? lastCheckin.date
        : null;

    const [openAlertsCount, highRiskAlerts14d, dueNowCount, latestCompletedProm, hydrationRows, nutritionToday, medsToday] =
      await Promise.all([
        Alert.countDocuments({ patientId, status: "open" }),
        Alert.countDocuments({
          patientId,
          risk: "high",
          createdAt: { $gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
        }),
        PromInstance.countDocuments({ patientId, status: "due" }),
        PromInstance.findOne({
          patientId,
          status: "completed",
        })
          .sort({ completedAt: -1 })
          .select({ score: 1, completedAt: 1 })
          .lean(),
        lastCheckinDate
          ? HydrationLog.find({ patientId, date: lastCheckinDate })
              .select({ amountMl: 1 })
              .lean()
          : Promise.resolve([]),
        lastCheckinDate
          ? NutritionLog.findOne({ patientId, date: lastCheckinDate })
              .sort({ createdAt: -1 })
              .select({ protein: 1, fruitVegServings: 1 })
              .lean()
          : Promise.resolve(null),
        lastCheckinDate
          ? readMedicationSummaryForDate(patientId, lastCheckinDate)
          : Promise.resolve(null),
      ]);

    const hydrationTodayMl =
      hydrationRows.length > 0
        ? hydrationRows.reduce((sum, item) => {
            const amount = typeof item.amountMl === "number" ? item.amountMl : 0;
            return sum + amount;
          }, 0)
        : undefined;

    const latestCompletedScore =
      latestCompletedProm &&
      latestCompletedProm.completedAt instanceof Date &&
      latestCompletedProm.score &&
      typeof latestCompletedProm.score === "object" &&
      typeof latestCompletedProm.score.normalized === "number" &&
      typeof latestCompletedProm.score.bandLabel === "string"
        ? {
            normalized: Math.round(latestCompletedProm.score.normalized),
            bandLabel: latestCompletedProm.score.bandLabel,
            completedAt: latestCompletedProm.completedAt.toISOString(),
          }
        : null;

    const rehabRecord =
      patient.rehab && typeof patient.rehab === "object"
        ? (patient.rehab as {
            currentKey?: unknown;
            phases?: Array<{ key?: unknown; title?: unknown; status?: unknown }>;
          })
        : null;
    const rehabPhases = Array.isArray(rehabRecord?.phases)
      ? rehabRecord.phases
      : [];
    const currentKey =
      typeof rehabRecord?.currentKey === "string" ? rehabRecord.currentKey : null;
    const currentPhase =
      rehabPhases.find((phase) => phase.key === currentKey) ??
      rehabPhases.find((phase) => phase.status === "current") ??
      null;

    const responseLastCheckin =
      lastCheckin && lastCheckinDate
        ? {
            date: lastCheckinDate,
            pain: typeof lastCheckin.pain === "number" ? lastCheckin.pain : 0,
            mood: typeof lastCheckin.mood === "number" ? lastCheckin.mood : 0,
            adherence: {
              exercises:
                lastCheckin.adherence &&
                typeof lastCheckin.adherence === "object" &&
                typeof (lastCheckin.adherence as { exercises?: unknown }).exercises ===
                  "number"
                  ? (lastCheckin.adherence as { exercises: number }).exercises
                  : undefined,
              medication:
                lastCheckin.adherence &&
                typeof lastCheckin.adherence === "object" &&
                typeof (lastCheckin.adherence as { medication?: unknown }).medication ===
                  "boolean"
                  ? (lastCheckin.adherence as { medication: boolean }).medication
                  : undefined,
            },
            sleep:
              lastCheckin.sleep &&
              typeof lastCheckin.sleep === "object" &&
              (typeof (lastCheckin.sleep as { hours?: unknown }).hours === "number" ||
                typeof (lastCheckin.sleep as { quality?: unknown }).quality === "number")
                ? {
                    hours:
                      typeof (lastCheckin.sleep as { hours?: unknown }).hours ===
                      "number"
                        ? (lastCheckin.sleep as { hours: number }).hours
                        : undefined,
                    quality:
                      typeof (lastCheckin.sleep as { quality?: unknown }).quality ===
                      "number"
                        ? (lastCheckin.sleep as { quality: number }).quality
                        : undefined,
                  }
                : undefined,
            hydrationTodayMl,
            nutritionToday:
              nutritionToday &&
              (nutritionToday.protein === "low" ||
                nutritionToday.protein === "ok" ||
                nutritionToday.protein === "high" ||
                typeof nutritionToday.fruitVegServings === "number")
                ? {
                    protein:
                      nutritionToday.protein === "low" ||
                      nutritionToday.protein === "ok" ||
                      nutritionToday.protein === "high"
                        ? nutritionToday.protein
                        : undefined,
                    fruitVegServings:
                      typeof nutritionToday.fruitVegServings === "number"
                        ? nutritionToday.fruitVegServings
                        : undefined,
                  }
                : undefined,
            medsToday:
              medsToday && medsToday.scheduled > 0
                ? {
                    taken: medsToday.taken,
                    scheduled: medsToday.scheduled,
                  }
                : undefined,
          }
        : null;

    const inviteAccess = await CaregiverInvite.findOneAndUpdate(
      { _id: requestWithCaregiver.caregiver?.inviteId, patientId },
      { $set: { lastAccessedAt: new Date() } },
      { new: true }
    )
      .select({ _id: 1, relationship: 1, caregiverName: 1, lastAccessedAt: 1, usedAt: 1, revokedAt: 1, expiresAt: 1, codeHint: 1 })
      .lean();

    await writeCaregiverEvent("CAREGIVER_SUMMARY_ACCESSED", patientId, requestWithCaregiver.caregiver?.inviteId ?? null, {
      accessedAt: new Date(),
    });

    return res.json({
      ok: true,
      patientId,
      patient: {
        id: patient.patientId,
        displayName:
          typeof patient.displayName === "string"
            ? patient.displayName
            : undefined,
      },
      access: inviteAccess ? mapCaregiverAccess(inviteAccess as Record<string, unknown>) : null,
      updatedAt: new Date().toISOString(),
      lastCheckin: responseLastCheckin,
      safety: {
        openAlertsCount,
        highRiskAlerts14d: highRiskAlerts14d,
      },
      proms: {
        dueNowCount,
        latestCompleted: latestCompletedScore,
      },
      rehab: {
        currentPhaseTitle:
          currentPhase && typeof currentPhase.title === "string"
            ? currentPhase.title
            : null,
      },
      plan: {
        statusLabel: plan
          ? Array.isArray(plan.items) && plan.items.length > 0
            ? "Plan assigned"
            : "Nothing scheduled right now"
          : "No plan assigned",
        phaseTitle:
          currentPhase && typeof currentPhase.title === "string"
            ? currentPhase.title
            : null,
        itemCount: Array.isArray(plan?.items) ? plan.items.length : 0,
        title: typeof plan?.title === "string" ? plan.title : undefined,
      },
      nextAppointment: nextAppointment,
    });
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
  if (!patientId) {
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
