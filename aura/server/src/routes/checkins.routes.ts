import { Router } from "express";
import { z } from "zod";

import {
  BODY_MAP_PAIN_TYPES,
  BODY_MAP_REGIONS,
  isBodyMapPainType,
  isBodyMapRegion,
} from "../constants/bodyMap";
import {
  CHECK_IN_MEDICATION_STATUSES,
  CHECK_IN_SYMPTOM_FLAGS,
} from "../constants/checkin";
import { env } from "../env";
import { getRequestIdFromResponse } from "../middleware/requestContext";
import { validateBody } from "../middleware/validate";
import { AIUnavailableError } from "../services/ai";
import {
  CheckInValidationError,
  DuplicateCheckInError,
  type CheckInFlowInput,
  processCheckIn,
} from "../services/checkinFlow";
import {
  getCheckinAccessGate,
  getPatientCareStatus,
} from "../services/patientCareStatusService";
import { logger } from "../utils/logger";
import { verifyPatientToken } from "../utils/patientJwt";
import { redactText } from "../utils/redact";
import { hasValidSharedSecret } from "../utils/sharedSecret";

const router = Router();

function parseBearerToken(authorization: string | undefined): string | null {
  if (!authorization) {
    return null;
  }

  const [scheme, token] = authorization.split(" ");
  if (!scheme || scheme.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  const normalized = token.trim();
  return normalized.length > 0 ? normalized : null;
}

function resolveLegacyPatientId(
  authorization: string | undefined,
  internalKey: string | undefined,
  bodyPatientId: string | undefined
): { ok: true; patientId: string } | { ok: false; status: 400 | 401 } {
  const token = parseBearerToken(authorization);
  if (token) {
    const decoded = verifyPatientToken(token);
    if (decoded?.id) {
      return { ok: true, patientId: decoded.id };
    }
  }

  if (!env.LEGACY_PUBLIC_ENDPOINTS_ENABLED) {
    return { ok: false, status: 401 };
  }

  if (!hasValidSharedSecret(internalKey, env.AURA_INTERNAL_KEY)) {
    return { ok: false, status: 401 };
  }

  const normalizedBodyPatientId = typeof bodyPatientId === "string" ? bodyPatientId.trim() : "";
  if (!normalizedBodyPatientId) {
    return { ok: false, status: 400 };
  }

  return { ok: true, patientId: normalizedBodyPatientId };
}

function normalizeBodyMapForFlow(
  value:
    | {
        primaryRegion?: unknown;
        regions?: Array<{
          region?: unknown;
          intensity?: unknown;
          type?: unknown;
        }>;
      }
    | undefined
): CheckInFlowInput["bodyMap"] {
  if (!value?.regions || value.regions.length === 0) {
    return undefined;
  }

  const regions: NonNullable<CheckInFlowInput["bodyMap"]>["regions"] = [];
  for (const region of value.regions) {
    if (
      isBodyMapRegion(region.region) &&
      typeof region.intensity === "number" &&
      Number.isInteger(region.intensity) &&
      isBodyMapPainType(region.type)
    ) {
      regions.push({
        region: region.region,
        intensity: region.intensity,
        type: region.type,
      });
    }
  }

  return regions.length > 0
    ? {
        primaryRegion: isBodyMapRegion(value.primaryRegion)
          ? value.primaryRegion
          : undefined,
        regions,
      }
    : undefined;
}

const sleepHoursSchema = z
  .number()
  .min(0)
  .max(16)
  .refine((value) => Math.abs(value * 10 - Math.round(value * 10)) < 1e-9, {
    message: "hours must have at most one decimal place",
  });

const bodyMapRegionSchema = z.object({
  region: z.enum(BODY_MAP_REGIONS),
  intensity: z.number().int().min(0).max(10),
  type: z.enum(BODY_MAP_PAIN_TYPES),
});

const checkInSchema = z
  .object({
    patientId: z.string().min(1).optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    mood: z.number().min(1).max(5),
    pain: z.number().min(0).max(10),
    adherence: z
      .object({
        exercises: z.number().min(0).max(1).optional(),
        medication: z.boolean().optional(),
        medicationStatus: z.enum(CHECK_IN_MEDICATION_STATUSES).optional(),
        medicationReason: z.string().trim().max(120).optional(),
      })
      .optional(),
    symptoms: z
      .object({
        flags: z.array(z.enum(CHECK_IN_SYMPTOM_FLAGS)).max(8).optional(),
      })
      .optional(),
    recovery: z
      .object({
        difficultyLevel: z.number().int().min(1).max(5).optional(),
        confidenceLevel: z.number().int().min(1).max(5).optional(),
        mobilityLevel: z.number().int().min(1).max(5).optional(),
      })
      .optional(),
    support: z
      .object({
        stressLevel: z.number().int().min(1).max(5).optional(),
        feelsSafe: z.boolean().optional(),
        wantsFollowUp: z.boolean().optional(),
        wantsExtraSupport: z.boolean().optional(),
        needsUrgentHelp: z.boolean().optional(),
      })
      .optional(),
    sleep: z
      .object({
        hours: sleepHoursSchema.optional(),
        quality: z.number().int().min(1).max(5).optional(),
        disturbances: z.number().int().min(0).max(5).optional(),
      })
      .optional(),
    dailySignals: z
      .object({
        hydrationLevel: z.number().int().min(1).max(5).optional(),
        energyLevel: z.number().int().min(1).max(5).optional(),
      })
      .optional(),
    bodyMap: z
      .object({
        primaryRegion: z.enum(BODY_MAP_REGIONS).optional(),
        regions: z.array(bodyMapRegionSchema).max(12),
      })
      .optional(),
    notes: z.string().max(2000).optional(),
  })
  .superRefine((value, ctx) => {
    const regions = value.bodyMap?.regions ?? [];
    const seen = new Set<string>();
    regions.forEach((region, index) => {
      if (seen.has(region.region)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["bodyMap", "regions", index, "region"],
          message: "Duplicate regions are not allowed",
        });
      }
      seen.add(region.region);
    });

    const flags = value.symptoms?.flags ?? [];
    if (new Set(flags).size !== flags.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["symptoms", "flags"],
        message: "Duplicate symptom flags are not allowed",
      });
    }

    if (
      value.bodyMap?.primaryRegion &&
      !regions.some((region) => region.region === value.bodyMap?.primaryRegion)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["bodyMap", "primaryRegion"],
        message: "Primary region must also be selected in bodyMap.regions",
      });
    }
  });

router.post("/checkins", validateBody(checkInSchema), async (req, res) => {
  try {
    const requestId = getRequestIdFromResponse(res);
    const {
      patientId: bodyPatientId,
      date,
      mood,
      pain,
      symptoms,
      adherence,
      recovery,
      support,
      sleep,
      dailySignals,
      bodyMap,
      notes,
    } =
      req.body as z.infer<typeof checkInSchema>;

    const resolvedPatient = resolveLegacyPatientId(
      req.header("authorization"),
      req.header("x-aura-internal-key"),
      bodyPatientId
    );
    if (resolvedPatient.ok === false) {
      if (resolvedPatient.status === 400) {
        return res.status(400).json({
          ok: false,
          error: "VALIDATION_ERROR",
          details: [{ path: "patientId", message: "patientId is required" }],
        });
      }
      return res.status(401).json({
        ok: false,
        error: "UNAUTHORIZED",
      });
    }
    const patientId = resolvedPatient.patientId;

    const careStatus = await getPatientCareStatus(patientId);
    const accessGate = getCheckinAccessGate(careStatus);
    if (!accessGate.allowed) {
      return res.status(403).json({
        ok: false,
        error: "FORBIDDEN",
        message: accessGate.message,
      });
    }

    logger.info("POST /checkins", {
      requestId,
      patientId,
      date,
      mood,
      pain,
      sleep,
      bodyMapRegionCount: bodyMap?.regions?.length ?? 0,
      notesPreview: redactText(notes),
    });

    const result = await processCheckIn({
      patientId,
      date,
      mood,
      pain,
      symptoms,
      adherence,
      recovery,
      support,
      sleep,
      dailySignals,
      bodyMap: normalizeBodyMapForFlow(bodyMap),
      notes,
    }, {
      requestId,
    });

    if (result.riskLevel === "high") {
      logger.info("checkin.high_risk.completed", {
        requestId,
        flow: "checkin",
        patientId,
        alertId: result.alertId,
        n8nDelivered: result.n8nDelivered,
      });
      return res.json({
        ok: true,
        risk: "high",
        checkinId: result.checkInId,
        alertId: result.alertId,
        n8nDelivered: result.n8nDelivered,
        message:
          "I'm concerned about your safety. I've alerted your clinician. If you feel unsafe, seek urgent help now.",
      });
    }

    return res.json({
      ok: true,
      risk: "low",
      checkinId: result.checkInId,
    });
  } catch (error) {
    if (error instanceof AIUnavailableError) {
      return res.status(502).json({ ok: false, error: "AI_UNAVAILABLE" });
    }

    if (error instanceof CheckInValidationError) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        details: [{ path: error.field, message: error.message }],
      });
    }

    if (error instanceof DuplicateCheckInError) {
      return res.status(409).json({
        ok: false,
        error: "DUPLICATE_CHECKIN",
        message: "A check-in for this patient and date already exists",
      });
    }

    if (typeof error === "object" && error !== null && "code" in error) {
      const maybeCode = (error as { code?: unknown }).code;
      if (maybeCode === 11000) {
        return res.status(409).json({
          ok: false,
          error: "DUPLICATE_CHECKIN",
          message: "A check-in for this patient and date already exists",
        });
      }
    }

    logger.error("Check-in route failed", {
      requestId: getRequestIdFromResponse(res),
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({
      ok: false,
      error: "INTERNAL_ERROR",
      message: "Something went wrong",
    });
  }
});

export default router;
