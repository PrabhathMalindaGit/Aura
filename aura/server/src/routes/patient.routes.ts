import { Router } from "express";
import { z } from "zod";

import ChatMessage from "../models/ChatMessage";
import CheckIn from "../models/CheckIn";
import Patient from "../models/Patient";
import { env } from "../env";
import { requirePatientAuth } from "../middleware/patientAuth";
import { validateBody } from "../middleware/validate";
import { AIUnavailableError } from "../services/ai";
import { processChatMessage } from "../services/chatFlow";
import { processCheckIn } from "../services/checkinFlow";
import type { RequestWithPatient } from "../types/patientAuth";
import { logger } from "../utils/logger";
import { signPatientToken, hasPatientJwtSecretConfigured } from "../utils/patientJwt";

const router = Router();

const patientLoginSchema = z
  .object({
    accessCode: z.string().trim().min(1).max(80).optional(),
    patientId: z.string().trim().min(1).max(64).optional(),
  })
  .refine((value) => value.accessCode !== undefined || value.patientId !== undefined, {
    path: ["body"],
    message: "accessCode or patientId is required",
  });

const patientCheckInSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mood: z.number().min(1).max(5),
  pain: z.number().min(0).max(10),
  adherence: z
    .object({
      exercises: z.number().min(0).max(1).optional(),
      medication: z.boolean().optional(),
    })
    .optional(),
  notes: z.string().max(2000).optional(),
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
      const { date, mood, pain, adherence, notes } =
        req.body as z.infer<typeof patientCheckInSchema>;

      const result = await processCheckIn({
        patientId,
        date,
        mood,
        pain,
        adherence,
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
        adherence: {
          exercises: checkin.adherence?.exercises,
          medication: checkin.adherence?.medication,
        },
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
