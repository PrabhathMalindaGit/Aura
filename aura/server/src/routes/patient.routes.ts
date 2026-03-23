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
  isCheckInMedicationStatus,
  isCheckInSymptomFlag,
} from "../constants/checkin";
import ChatMessage from "../models/ChatMessage";
import CheckIn from "../models/CheckIn";
import Patient from "../models/Patient";
import { env } from "../env";
import { requirePatientAuth } from "../middleware/patientAuth";
import { validateBody } from "../middleware/validate";
import { consumeLoginThrottle } from "../services/loginThrottle";
import { AIUnavailableError } from "../services/ai";
import { processChatMessage } from "../services/chatFlow";
import {
  CheckInValidationError,
  DuplicateCheckInError,
  type CheckInFlowInput,
  processCheckIn,
} from "../services/checkinFlow";
import type { RequestWithPatient } from "../types/patientAuth";
import { logger } from "../utils/logger";
import { signPatientToken, hasPatientJwtSecretConfigured } from "../utils/patientJwt";
import { getRequestIp } from "../utils/requestIp";

const router = Router();
const PATIENT_LOGIN_WINDOW_MS = 15 * 60_000;
const PATIENT_LOGIN_PRINCIPAL_MAX_ATTEMPTS = 5;
const PATIENT_LOGIN_IP_MAX_ATTEMPTS = 20;

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

const patientLoginSchema = z
  .object({
    accessCode: z.string().trim().min(1).max(80).optional(),
    patientId: z.string().trim().min(1).max(64).optional(),
  })
  .refine((value) => value.accessCode !== undefined || value.patientId !== undefined, {
    path: ["body"],
    message: "accessCode or patientId is required",
  });

const patientCheckInSchema = z
  .object({
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

const patientCheckInsQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.coerce.number().int().positive().max(200).optional().default(30),
});

const patientChatSendSchema = z.object({
  message: z.string().trim().min(1).max(2000),
});

const patientChatHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(200).optional().default(50),
});

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

function parseIsoDate(value: string): Date | null {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function mapPatientProfile(patient: {
  patientId: string;
  displayName?: string;
  status?: string;
  clinicianId?: string;
}) {
  return {
    id: patient.patientId,
    displayName: patient.displayName,
    status: patient.status ?? "active",
    clinicianId: patient.clinicianId,
  };
}

router.post("/patient/auth/login", validateBody(patientLoginSchema), async (req, res) => {
  if (!hasPatientJwtSecretConfigured()) {
    return res.status(500).json({
      ok: false,
      error: "INTERNAL_ERROR",
    });
  }

  try {
    const body = req.body as z.infer<typeof patientLoginSchema>;
    const ip = getRequestIp(req);
    const loginPrincipal = body.accessCode
      ? `accessCode:${body.accessCode}`
      : body.patientId
        ? `patientId:${body.patientId}`
        : "";
    const attempt = await consumeLoginThrottle({
      scope: "patient_login",
      buckets: [
        {
          scopeSuffix: "principal",
          key: loginPrincipal,
          limit: PATIENT_LOGIN_PRINCIPAL_MAX_ATTEMPTS,
          windowMs: PATIENT_LOGIN_WINDOW_MS,
        },
        {
          scopeSuffix: "ip",
          key: ip,
          limit: PATIENT_LOGIN_IP_MAX_ATTEMPTS,
          windowMs: PATIENT_LOGIN_WINDOW_MS,
        },
      ],
    });

    if (!attempt.allowed) {
      return res.status(429).json({
        ok: false,
        error: "TOO_MANY_REQUESTS",
        retryAfterSeconds: attempt.retryAfterSeconds,
      });
    }

    let patient = null;

    if (body.accessCode) {
      patient = await Patient.findOne({ accessCode: body.accessCode }).lean();
    } else if (body.patientId) {
      if (!env.DEMO_PATIENT_LOGIN) {
        return res.status(403).json({
          ok: false,
          error: "FORBIDDEN",
        });
      }

      patient = await Patient.findOne({ patientId: body.patientId }).lean();
    }

    if (!patient) {
      return res.status(401).json({
        ok: false,
        error: "UNAUTHORIZED",
      });
    }

    const token = signPatientToken({
      id: patient.patientId,
      displayName:
        typeof patient.displayName === "string" ? patient.displayName : undefined,
    });

    return res.json({
      ok: true,
      token,
      patient: mapPatientProfile({
        patientId: patient.patientId,
        displayName:
          typeof patient.displayName === "string" ? patient.displayName : undefined,
        status: typeof patient.status === "string" ? patient.status : undefined,
        clinicianId:
          typeof patient.clinicianId === "string" ? patient.clinicianId : undefined,
      }),
    });
  } catch (error) {
    logger.error("Patient login failed", {
      route: "POST /patient/auth/login",
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({
      ok: false,
      error: "INTERNAL_ERROR",
    });
  }
});

router.get("/patient/me", requirePatientAuth, async (req, res) => {
  const requestWithPatient = req as RequestWithPatient;

  try {
    const patientId = requestWithPatient.patient?.id;
    if (!patientId) {
      return res.status(401).json({
        ok: false,
        error: "UNAUTHORIZED",
      });
    }

    const patient = await Patient.findOne({ patientId }).lean();
    if (!patient) {
      return res.status(404).json({
        ok: false,
        error: "NOT_FOUND",
      });
    }

    return res.json({
      ok: true,
      patient: mapPatientProfile({
        patientId: patient.patientId,
        displayName:
          typeof patient.displayName === "string" ? patient.displayName : undefined,
        status: typeof patient.status === "string" ? patient.status : undefined,
        clinicianId:
          typeof patient.clinicianId === "string" ? patient.clinicianId : undefined,
      }),
    });
  } catch (error) {
    logger.error("Get patient me failed", {
      route: "GET /patient/me",
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({
      ok: false,
      error: "INTERNAL_ERROR",
    });
  }
});

router.post(
  "/patient/checkins",
  requirePatientAuth,
  validateBody(patientCheckInSchema),
  async (req, res) => {
    const requestWithPatient = req as RequestWithPatient;
    const patientId = requestWithPatient.patient?.id;

    if (!patientId) {
      return res.status(401).json({
        ok: false,
        error: "UNAUTHORIZED",
      });
    }

    try {
      const { date, mood, pain, symptoms, adherence, recovery, support, sleep, dailySignals, bodyMap, notes } =
        req.body as z.infer<typeof patientCheckInSchema>;

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
      });

      return res.json({
        ok: true,
        checkInId: result.checkInId,
        risk: {
          level: result.riskLevel,
          reasonCodes: result.reasonCodes,
        },
        ...(result.alertId ? { alertId: result.alertId } : {}),
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
        });
      }

      if (typeof error === "object" && error !== null && "code" in error) {
        const maybeCode = (error as { code?: unknown }).code;
        if (maybeCode === 11000) {
          return res.status(409).json({
            ok: false,
            error: "DUPLICATE_CHECKIN",
          });
        }
      }

      logger.error("Patient checkin route failed", {
        route: "POST /patient/checkins",
        patientId,
        message: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({
        ok: false,
        error: "INTERNAL_ERROR",
      });
    }
  }
);

router.get("/patient/checkins", requirePatientAuth, async (req, res) => {
  const requestWithPatient = req as RequestWithPatient;
  const patientId = requestWithPatient.patient?.id;

  if (!patientId) {
    return res.status(401).json({
      ok: false,
      error: "UNAUTHORIZED",
    });
  }

  const parsedQuery = patientCheckInsQuerySchema.safeParse(req.query);
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

  const { from, to, limit } = parsedQuery.data;
  const createdAtFilter: { $gte?: Date; $lte?: Date } = {};
  const validationDetails: Array<{ path: string; message: string }> = [];

  if (from) {
    const parsedFrom = parseIsoDate(from);
    if (!parsedFrom) {
      validationDetails.push({
        path: "from",
        message: "from must be a valid ISO date string",
      });
    } else {
      createdAtFilter.$gte = parsedFrom;
    }
  }

  if (to) {
    const parsedTo = parseIsoDate(to);
    if (!parsedTo) {
      validationDetails.push({
        path: "to",
        message: "to must be a valid ISO date string",
      });
    } else {
      createdAtFilter.$lte = parsedTo;
    }
  }

  if (
    createdAtFilter.$gte &&
    createdAtFilter.$lte &&
    createdAtFilter.$gte.getTime() > createdAtFilter.$lte.getTime()
  ) {
    validationDetails.push({
      path: "from",
      message: "from must be before or equal to to",
    });
  }

  if (validationDetails.length > 0) {
    return res.status(400).json({
      ok: false,
      error: "VALIDATION_ERROR",
      details: validationDetails,
    });
  }

  try {
    const query: Record<string, unknown> = { patientId };
    if (createdAtFilter.$gte || createdAtFilter.$lte) {
      query.createdAt = createdAtFilter;
    }

    const checkins = await CheckIn.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return res.json({
      ok: true,
      checkins: checkins.map((checkin) => ({
        id: String(checkin._id),
        date: checkin.date,
        pain: checkin.pain,
        mood: checkin.mood,
        symptoms:
          checkin.symptoms &&
          Array.isArray(checkin.symptoms.flags) &&
          checkin.symptoms.flags.length > 0
            ? {
                flags: checkin.symptoms.flags.filter((flag) =>
                  isCheckInSymptomFlag(flag)
                ),
              }
            : undefined,
        adherence: {
          exercises: checkin.adherence?.exercises,
          medication: checkin.adherence?.medication,
          medicationStatus: isCheckInMedicationStatus(
            checkin.adherence?.medicationStatus
          )
            ? checkin.adherence?.medicationStatus
            : undefined,
          medicationReason:
            typeof checkin.adherence?.medicationReason === "string" &&
            checkin.adherence.medicationReason.trim().length > 0
              ? checkin.adherence.medicationReason.trim()
              : undefined,
        },
        recovery:
          checkin.recovery &&
          (typeof checkin.recovery.difficultyLevel === "number" ||
            typeof checkin.recovery.confidenceLevel === "number" ||
            typeof checkin.recovery.mobilityLevel === "number")
            ? {
                difficultyLevel:
                  typeof checkin.recovery.difficultyLevel === "number"
                    ? checkin.recovery.difficultyLevel
                    : undefined,
                confidenceLevel:
                  typeof checkin.recovery.confidenceLevel === "number"
                    ? checkin.recovery.confidenceLevel
                    : undefined,
                mobilityLevel:
                  typeof checkin.recovery.mobilityLevel === "number"
                    ? checkin.recovery.mobilityLevel
                    : undefined,
              }
            : undefined,
        support:
          checkin.support &&
          (typeof checkin.support.stressLevel === "number" ||
            typeof checkin.support.feelsSafe === "boolean" ||
            typeof checkin.support.wantsFollowUp === "boolean" ||
            typeof checkin.support.wantsExtraSupport === "boolean" ||
            typeof checkin.support.needsUrgentHelp === "boolean")
            ? {
                stressLevel:
                  typeof checkin.support.stressLevel === "number"
                    ? checkin.support.stressLevel
                    : undefined,
                feelsSafe:
                  typeof checkin.support.feelsSafe === "boolean"
                    ? checkin.support.feelsSafe
                    : undefined,
                wantsFollowUp:
                  typeof checkin.support.wantsFollowUp === "boolean"
                    ? checkin.support.wantsFollowUp
                    : undefined,
                wantsExtraSupport:
                  typeof checkin.support.wantsExtraSupport === "boolean"
                    ? checkin.support.wantsExtraSupport
                    : undefined,
                needsUrgentHelp:
                  typeof checkin.support.needsUrgentHelp === "boolean"
                    ? checkin.support.needsUrgentHelp
                    : undefined,
              }
            : undefined,
        sleep:
          checkin.sleep &&
          (typeof checkin.sleep.hours === "number" ||
            typeof checkin.sleep.quality === "number" ||
            typeof checkin.sleep.disturbances === "number")
            ? {
                hours:
                  typeof checkin.sleep.hours === "number"
                    ? checkin.sleep.hours
                    : undefined,
                quality:
                  typeof checkin.sleep.quality === "number"
                    ? checkin.sleep.quality
                    : undefined,
                disturbances:
                  typeof checkin.sleep.disturbances === "number"
                    ? checkin.sleep.disturbances
                    : undefined,
              }
            : undefined,
        dailySignals:
          checkin.dailySignals &&
          (typeof checkin.dailySignals.hydrationLevel === "number" ||
            typeof checkin.dailySignals.energyLevel === "number")
            ? {
                hydrationLevel:
                  typeof checkin.dailySignals.hydrationLevel === "number"
                    ? checkin.dailySignals.hydrationLevel
                    : undefined,
                energyLevel:
                  typeof checkin.dailySignals.energyLevel === "number"
                    ? checkin.dailySignals.energyLevel
                    : undefined,
              }
            : undefined,
        bodyMap:
          checkin.bodyMap &&
          Array.isArray(checkin.bodyMap.regions) &&
          checkin.bodyMap.regions.length > 0
            ? {
                primaryRegion: isBodyMapRegion(checkin.bodyMap.primaryRegion)
                  ? checkin.bodyMap.primaryRegion
                  : undefined,
                regions: checkin.bodyMap.regions.reduce<
                  Array<{ region: string; intensity: number; type: string }>
                >((acc, region) => {
                  if (
                    isBodyMapRegion(region.region) &&
                    typeof region.intensity === "number" &&
                    isBodyMapPainType(region.type)
                  ) {
                    acc.push({
                      region: region.region,
                      intensity: region.intensity,
                      type: region.type,
                    });
                  }
                  return acc;
                }, []),
              }
            : undefined,
        risk: {
          level: checkin.risk?.level ?? "low",
          reasonCodes: Array.isArray(checkin.risk?.reasons)
            ? checkin.risk.reasons
            : [],
        },
        createdAt: checkin.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    logger.error("Patient checkins list failed", {
      route: "GET /patient/checkins",
      patientId,
      message: error instanceof Error ? error.message : String(error),
    });

    return res.status(500).json({
      ok: false,
      error: "INTERNAL_ERROR",
    });
  }
});

router.post(
  "/patient/chat/send",
  requirePatientAuth,
  validateBody(patientChatSendSchema),
  async (req, res) => {
    const requestWithPatient = req as RequestWithPatient;
    const patientId = requestWithPatient.patient?.id;

    if (!patientId) {
      return res.status(401).json({
        ok: false,
        error: "UNAUTHORIZED",
      });
    }

    try {
      const { message } = req.body as z.infer<typeof patientChatSendSchema>;

      const result = await processChatMessage({
        patientId,
        text: message,
        lowRiskMode: "rag",
        persistHighRiskAssistantReply: false,
      });

      if (result.riskLevel === "high") {
        return res.json({
          ok: true,
          risk: {
            level: "high",
            reasonCodes: result.reasonCodes,
          },
          alertId: result.alertId,
        });
      }

      return res.json({
        ok: true,
        risk: {
          level: "low",
          reasonCodes: result.reasonCodes,
        },
        messages: {
          user: {
            id: result.userMessageId,
            role: "user",
            text: message,
            createdAt: result.userCreatedAt,
          },
          assistant: {
            id: result.assistantMessageId,
            role: "assistant",
            text: result.assistantReply,
            createdAt: result.assistantCreatedAt,
          },
        },
      });
    } catch (error) {
      if (error instanceof AIUnavailableError) {
        return res.status(502).json({ ok: false, error: "AI_UNAVAILABLE" });
      }

      logger.error("Patient chat route failed", {
        route: "POST /patient/chat/send",
        patientId,
        message: error instanceof Error ? error.message : String(error),
      });

      return res.status(500).json({
        ok: false,
        error: "INTERNAL_ERROR",
      });
    }
  }
);

router.get("/patient/chat/history", requirePatientAuth, async (req, res) => {
  const requestWithPatient = req as RequestWithPatient;
  const patientId = requestWithPatient.patient?.id;

  if (!patientId) {
    return res.status(401).json({
      ok: false,
      error: "UNAUTHORIZED",
    });
  }

  const parsedQuery = patientChatHistoryQuerySchema.safeParse(req.query);
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
    const messages = await ChatMessage.find({ patientId })
      .sort({ createdAt: -1 })
      .limit(parsedQuery.data.limit)
      .lean();

    return res.json({
      ok: true,
      messages: messages.map((message) => ({
        id: String(message._id),
        role: message.role,
        text: message.text,
        createdAt: message.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    logger.error("Patient chat history failed", {
      route: "GET /patient/chat/history",
      patientId,
      message: error instanceof Error ? error.message : String(error),
    });

    return res.status(500).json({
      ok: false,
      error: "INTERNAL_ERROR",
    });
  }
});

export default router;
