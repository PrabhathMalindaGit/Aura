import { type Response, Router } from "express";
import { Types } from "mongoose";
import { z } from "zod";

import { requirePatientAuth } from "../middleware/patientAuth";
import AppointmentRequest from "../models/AppointmentRequest";
import AppointmentSlot from "../models/AppointmentSlot";
import User from "../models/User";
import {
  approveAppointmentRequest,
  AppointmentServiceError,
  cancelAppointmentRequestByPatient,
  createAppointmentRequest,
  rejectAppointmentRequest,
  validateSlotDuration,
} from "../services/appointmentsService";
import { deriveAppointmentWorkflowStatus } from "../services/appointmentWorkflowService";
import type { RequestWithUser } from "../types/auth";
import type { RequestWithPatient } from "../types/patientAuth";
import { logger } from "../utils/logger";

const router = Router();

const MAX_LIMIT = 100;

const slotsQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).optional().default(50),
});

const requestBodySchema = z.object({
  slotId: z.string().trim().min(1),
  note: z.string().max(2000).optional(),
  tzOffsetMinutes: z.coerce.number().int().min(-840).max(840).optional(),
});

const requestsQuerySchema = z.object({
  status: z.enum(["pending", "approved", "rejected", "canceled"]).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).optional().default(50),
});

const clinicianCreateSlotBodySchema = z.object({
  startsAt: z.string().trim().min(1),
  endsAt: z.string().trim().min(1),
  meetingLink: z.string().trim().max(1024).optional(),
});

const clinicianSlotsQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  status: z.enum(["available", "closed"]).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).optional().default(50),
});

const clinicianRequestsQuerySchema = z.object({
  status: z.enum(["pending", "approved", "rejected", "canceled"]).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).optional().default(50),
});

const clinicianReviewBodySchema = z.object({
  status: z.enum(["approved", "rejected"]),
});

function parseIsoDateTime(
  value: string | undefined,
  field: string,
  details: Array<{ path: string; message: string }>
): Date | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    details.push({
      path: field,
      message: `${field} must be a valid ISO datetime string`,
    });
    return undefined;
  }
  return parsed;
}

function toIsoString(value: Date | undefined): string {
  return value ? value.toISOString() : new Date(0).toISOString();
}

function isObjectId(value: string): boolean {
  return Types.ObjectId.isValid(value);
}

function mapServiceError(error: unknown, res: Response) {
  if (error instanceof AppointmentServiceError) {
    return res.status(error.status).json({
      ok: false,
      error: error.code,
      message: error.message,
    });
  }
  return null;
}

router.get("/patient/appointments/slots", requirePatientAuth, async (req, res) => {
  const requestWithPatient = req as RequestWithPatient;
  if (!requestWithPatient.patient?.id) {
    return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  }

  const parsedQuery = slotsQuerySchema.safeParse(req.query);
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

  const details: Array<{ path: string; message: string }> = [];
  const from = parseIsoDateTime(parsedQuery.data.from, "from", details);
  const to = parseIsoDateTime(parsedQuery.data.to, "to", details);

  if (from && to && from.getTime() > to.getTime()) {
    details.push({
      path: "from",
      message: "from must be earlier than or equal to to",
    });
  }

  if (details.length > 0) {
    return res.status(400).json({
      ok: false,
      error: "VALIDATION_ERROR",
      details,
    });
  }

  try {
    const now = new Date();
    const startsAtFilter: { $gte: Date; $lte?: Date } = {
      $gte: from && from.getTime() > now.getTime() ? from : now,
    };
    if (to) {
      startsAtFilter.$lte = to;
    }

    const slots = await AppointmentSlot.find({
      status: "available",
      startsAt: startsAtFilter,
    })
      .sort({ startsAt: 1 })
      .limit(parsedQuery.data.limit)
      .lean();

    const clinicianIds = [...new Set(slots.map((slot) => slot.clinicianId).filter(Boolean))];
    const clinicianProfiles =
      clinicianIds.length > 0
        ? await User.find({
            _id: { $in: clinicianIds.filter((value) => isObjectId(value)) },
          })
            .select({ displayName: 1 })
            .lean()
        : [];
    const clinicianNameById = new Map(
      clinicianProfiles.map((profile) => [
        String(profile._id),
        typeof profile.displayName === "string" && profile.displayName.trim()
          ? profile.displayName.trim()
          : "Clinician",
      ])
    );

    return res.json({
      ok: true,
      items: slots.map((slot) => ({
        slotId: String(slot._id),
        clinicianName: clinicianNameById.get(slot.clinicianId) ?? "Clinician",
        startsAt: toIsoString(slot.startsAt),
        endsAt: toIsoString(slot.endsAt),
        modality: slot.modality === "video" ? "video" : "video",
      })),
    });
  } catch (error) {
    logger.error("List patient appointment slots failed", {
      route: "GET /patient/appointments/slots",
      patientId: requestWithPatient.patient.id,
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

router.post("/patient/appointments/requests", requirePatientAuth, async (req, res) => {
  const requestWithPatient = req as RequestWithPatient;
  const patientId = requestWithPatient.patient?.id;
  if (!patientId) {
    return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  }

  const parsedBody = requestBodySchema.safeParse(req.body);
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

  if (!isObjectId(parsedBody.data.slotId)) {
    return res.status(400).json({
      ok: false,
      error: "VALIDATION_ERROR",
      details: [{ path: "slotId", message: "slotId must be a valid id" }],
    });
  }

  try {
    const created = await createAppointmentRequest({
      patientId,
      slotId: parsedBody.data.slotId,
      note: parsedBody.data.note,
    });

    return res.json({
      ok: true,
      requestId: String(created._id),
      status: created.status,
      workflowStatus: "awaiting_confirmation",
      createdAt: toIsoString(created.createdAt),
    });
  } catch (error) {
    const handled = mapServiceError(error, res);
    if (handled) {
      return handled;
    }
    logger.error("Create appointment request failed", {
      route: "POST /patient/appointments/requests",
      patientId,
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

router.get("/patient/appointments/requests", requirePatientAuth, async (req, res) => {
  const requestWithPatient = req as RequestWithPatient;
  const patientId = requestWithPatient.patient?.id;
  if (!patientId) {
    return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  }

  const parsedQuery = requestsQuerySchema.safeParse(req.query);
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
    const requestFilter: Record<string, unknown> = {
      patientId,
    };
    if (parsedQuery.data.status) {
      requestFilter.status = parsedQuery.data.status;
    }

    const requests = await AppointmentRequest.find(requestFilter)
      .sort({ createdAt: -1 })
      .limit(parsedQuery.data.limit)
      .lean();

    const slotIds = requests.map((item) => item.slotId).filter(Boolean);
    const slots =
      slotIds.length > 0
        ? await AppointmentSlot.find({ _id: { $in: slotIds } })
            .select({
              startsAt: 1,
              endsAt: 1,
              modality: 1,
              meetingLink: 1,
              status: 1,
            })
            .lean()
        : [];
    const slotById = new Map(slots.map((slot) => [String(slot._id), slot]));

    const items = requests
      .map((item) => {
        const slot = slotById.get(String(item.slotId));
        if (!slot) {
          return null;
        }
        return {
          requestId: String(item._id),
          slotId: String(item.slotId),
          status: item.status,
          workflowStatus: deriveAppointmentWorkflowStatus({
            startsAt: slot.startsAt,
            endsAt: slot.endsAt,
            requestStatus:
              item.status === "approved" ||
              item.status === "rejected" ||
              item.status === "canceled"
                ? item.status
                : "pending",
            note: typeof item.note === "string" ? item.note : undefined,
          }),
          startsAt: toIsoString(slot.startsAt),
          endsAt: toIsoString(slot.endsAt),
          modality: slot.modality === "video" ? "video" : "video",
          meetingLink:
            typeof slot.meetingLink === "string" && slot.meetingLink.trim()
              ? slot.meetingLink
              : undefined,
          reviewedAt: item.reviewedAt ? item.reviewedAt.toISOString() : undefined,
          createdAt: toIsoString(item.createdAt),
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt));

    return res.json({
      ok: true,
      items,
    });
  } catch (error) {
    logger.error("List patient appointment requests failed", {
      route: "GET /patient/appointments/requests",
      patientId,
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

router.post(
  "/patient/appointments/requests/:id/cancel",
  requirePatientAuth,
  async (req, res) => {
    const requestWithPatient = req as RequestWithPatient;
    const patientId = requestWithPatient.patient?.id;
    if (!patientId) {
      return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
    }

    const requestId = String(req.params.id ?? "");
    if (!isObjectId(requestId)) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        details: [{ path: "id", message: "id must be a valid request id" }],
      });
    }

    try {
      const canceled = await cancelAppointmentRequestByPatient({
        requestId,
        patientId,
      });
      return res.json({
        ok: true,
        item: {
          requestId: String(canceled._id),
          slotId: String(canceled.slotId),
          status: canceled.status,
          workflowStatus: "reschedule_requested",
          reviewedAt: canceled.reviewedAt ? canceled.reviewedAt.toISOString() : undefined,
          createdAt: toIsoString(canceled.createdAt),
        },
      });
    } catch (error) {
      const handled = mapServiceError(error, res);
      if (handled) {
        return handled;
      }
      logger.error("Cancel patient appointment request failed", {
        route: "POST /patient/appointments/requests/:id/cancel",
        patientId,
        requestId,
        message: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
    }
  }
);

router.post("/clinician/appointments/slots", async (req, res) => {
  const requestWithUser = req as RequestWithUser;
  const clinicianId = requestWithUser.user?.id;
  if (!clinicianId) {
    return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  }

  const parsedBody = clinicianCreateSlotBodySchema.safeParse(req.body);
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

  const details: Array<{ path: string; message: string }> = [];
  const startsAt = parseIsoDateTime(parsedBody.data.startsAt, "startsAt", details);
  const endsAt = parseIsoDateTime(parsedBody.data.endsAt, "endsAt", details);
  if (details.length > 0 || !startsAt || !endsAt) {
    return res.status(400).json({
      ok: false,
      error: "VALIDATION_ERROR",
      details,
    });
  }

  try {
    validateSlotDuration(startsAt, endsAt);

    const created = await AppointmentSlot.create({
      clinicianId,
      startsAt,
      endsAt,
      modality: "video",
      meetingLink: parsedBody.data.meetingLink?.trim() || undefined,
      status: "available",
    });

    return res.json({
      ok: true,
      slot: {
        slotId: String(created._id),
        clinicianId: created.clinicianId,
        startsAt: toIsoString(created.startsAt),
        endsAt: toIsoString(created.endsAt),
        modality: created.modality,
        meetingLink: created.meetingLink,
        status: created.status,
        createdAt: toIsoString(created.createdAt),
      },
    });
  } catch (error) {
    if (error instanceof AppointmentServiceError) {
      return res.status(error.status).json({
        ok: false,
        error: error.code,
        message: error.message,
      });
    }
    const maybeCode =
      typeof error === "object" && error !== null && "code" in error
        ? (error as { code?: unknown }).code
        : null;
    if (maybeCode === 11000) {
      return res.status(409).json({
        ok: false,
        error: "DUPLICATE_SLOT",
        message: "A slot for this start time already exists.",
      });
    }
    logger.error("Create clinician appointment slot failed", {
      route: "POST /clinician/appointments/slots",
      clinicianId,
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

router.get("/clinician/appointments/slots", async (req, res) => {
  const requestWithUser = req as RequestWithUser;
  const clinicianId = requestWithUser.user?.id;
  if (!clinicianId) {
    return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  }

  const parsedQuery = clinicianSlotsQuerySchema.safeParse(req.query);
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

  const details: Array<{ path: string; message: string }> = [];
  const from = parseIsoDateTime(parsedQuery.data.from, "from", details);
  const to = parseIsoDateTime(parsedQuery.data.to, "to", details);
  if (from && to && from.getTime() > to.getTime()) {
    details.push({
      path: "from",
      message: "from must be earlier than or equal to to",
    });
  }
  if (details.length > 0) {
    return res.status(400).json({
      ok: false,
      error: "VALIDATION_ERROR",
      details,
    });
  }

  try {
    const filter: Record<string, unknown> = {
      clinicianId,
    };
    const startsAtFilter: { $gte?: Date; $lte?: Date } = {};
    if (from) {
      startsAtFilter.$gte = from;
    }
    if (to) {
      startsAtFilter.$lte = to;
    }
    if (Object.keys(startsAtFilter).length > 0) {
      filter.startsAt = startsAtFilter;
    }
    if (parsedQuery.data.status) {
      filter.status = parsedQuery.data.status;
    }

    const slots = await AppointmentSlot.find(filter)
      .sort({ startsAt: 1 })
      .limit(parsedQuery.data.limit)
      .lean();

    return res.json({
      ok: true,
      items: slots.map((slot) => ({
        slotId: String(slot._id),
        clinicianId: slot.clinicianId,
        startsAt: toIsoString(slot.startsAt),
        endsAt: toIsoString(slot.endsAt),
        modality: slot.modality === "video" ? "video" : "video",
        meetingLink:
          typeof slot.meetingLink === "string" && slot.meetingLink.trim()
            ? slot.meetingLink
            : undefined,
        status: slot.status === "closed" ? "closed" : "available",
        createdAt: toIsoString(slot.createdAt),
      })),
    });
  } catch (error) {
    logger.error("List clinician appointment slots failed", {
      route: "GET /clinician/appointments/slots",
      clinicianId,
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

router.get("/clinician/appointments/requests", async (req, res) => {
  const requestWithUser = req as RequestWithUser;
  const clinicianId = requestWithUser.user?.id;
  if (!clinicianId) {
    return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  }

  const parsedQuery = clinicianRequestsQuerySchema.safeParse(req.query);
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

  const details: Array<{ path: string; message: string }> = [];
  const from = parseIsoDateTime(parsedQuery.data.from, "from", details);
  const to = parseIsoDateTime(parsedQuery.data.to, "to", details);
  if (from && to && from.getTime() > to.getTime()) {
    details.push({
      path: "from",
      message: "from must be earlier than or equal to to",
    });
  }
  if (details.length > 0) {
    return res.status(400).json({
      ok: false,
      error: "VALIDATION_ERROR",
      details,
    });
  }

  try {
    const slotFilter: Record<string, unknown> = {
      clinicianId,
    };
    const startsAtFilter: { $gte?: Date; $lte?: Date } = {};
    if (from) {
      startsAtFilter.$gte = from;
    }
    if (to) {
      startsAtFilter.$lte = to;
    }
    if (Object.keys(startsAtFilter).length > 0) {
      slotFilter.startsAt = startsAtFilter;
    }

    const slots = await AppointmentSlot.find(slotFilter)
      .select({
        startsAt: 1,
        endsAt: 1,
        modality: 1,
        meetingLink: 1,
        status: 1,
      })
      .lean();

    if (slots.length === 0) {
      return res.json({ ok: true, items: [] });
    }

    const slotById = new Map(slots.map((slot) => [String(slot._id), slot]));
    const slotIds = slots.map((slot) => slot._id);
    const requestFilter: Record<string, unknown> = {
      slotId: { $in: slotIds },
    };
    if (parsedQuery.data.status) {
      requestFilter.status = parsedQuery.data.status;
    }

    const requests = await AppointmentRequest.find(requestFilter)
      .sort({ createdAt: -1 })
      .limit(parsedQuery.data.limit)
      .lean();

    return res.json({
      ok: true,
      items: requests
        .map((item) => {
          const slot = slotById.get(String(item.slotId));
          if (!slot) {
            return null;
          }
          return {
            requestId: String(item._id),
            slotId: String(item.slotId),
            patientId: item.patientId,
            status: item.status,
            workflowStatus: deriveAppointmentWorkflowStatus({
              startsAt: slot.startsAt,
              endsAt: slot.endsAt,
              requestStatus:
                item.status === "approved" ||
                item.status === "rejected" ||
                item.status === "canceled"
                  ? item.status
                  : "pending",
              note: typeof item.note === "string" ? item.note : undefined,
            }),
            note: item.note,
            startsAt: toIsoString(slot.startsAt),
            endsAt: toIsoString(slot.endsAt),
            modality: slot.modality === "video" ? "video" : "video",
            meetingLink:
              typeof slot.meetingLink === "string" && slot.meetingLink.trim()
                ? slot.meetingLink
                : undefined,
            reviewedAt: item.reviewedAt ? item.reviewedAt.toISOString() : undefined,
            reviewedBy: item.reviewedBy
              ? {
                  clinicianId: item.reviewedBy.clinicianId,
                  name: item.reviewedBy.name,
                }
              : undefined,
            createdAt: toIsoString(item.createdAt),
          };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
        .sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt)),
    });
  } catch (error) {
    logger.error("List clinician appointment requests failed", {
      route: "GET /clinician/appointments/requests",
      clinicianId,
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

router.patch("/clinician/appointments/requests/:id", async (req, res) => {
  const requestWithUser = req as RequestWithUser;
  const user = requestWithUser.user;
  if (!user) {
    return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  }

  const requestId = String(req.params.id ?? "");
  if (!isObjectId(requestId)) {
    return res.status(400).json({
      ok: false,
      error: "VALIDATION_ERROR",
      details: [{ path: "id", message: "id must be a valid request id" }],
    });
  }

  const parsedBody = clinicianReviewBodySchema.safeParse(req.body);
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
    const reviewed =
      parsedBody.data.status === "approved"
        ? await approveAppointmentRequest({
            requestId,
            clinicianId: user.id,
            clinicianName: user.name,
            allowAnyClinician: user.role === "admin",
          })
        : await rejectAppointmentRequest({
            requestId,
            clinicianId: user.id,
            clinicianName: user.name,
            allowAnyClinician: user.role === "admin",
          });

    const slot = await AppointmentSlot.findById(reviewed.slotId)
      .select({ startsAt: 1, endsAt: 1, modality: 1, meetingLink: 1, status: 1 })
      .lean();

    return res.json({
      ok: true,
      item: {
        requestId: String(reviewed._id),
        slotId: String(reviewed.slotId),
        patientId: reviewed.patientId,
        status: reviewed.status,
        workflowStatus:
          slot?.startsAt && slot?.endsAt
            ? deriveAppointmentWorkflowStatus({
                startsAt: slot.startsAt,
                endsAt: slot.endsAt,
                requestStatus:
                  reviewed.status === "approved" ||
                  reviewed.status === "rejected" ||
                  reviewed.status === "canceled"
                    ? reviewed.status
                    : "pending",
                note: typeof reviewed.note === "string" ? reviewed.note : undefined,
              })
            : reviewed.status === "approved"
              ? "upcoming"
              : "awaiting_confirmation",
        startsAt: toIsoString(slot?.startsAt),
        endsAt: toIsoString(slot?.endsAt),
        modality: slot?.modality === "video" ? "video" : "video",
        meetingLink:
          typeof slot?.meetingLink === "string" && slot.meetingLink.trim()
            ? slot.meetingLink
            : undefined,
        reviewedAt: reviewed.reviewedAt ? reviewed.reviewedAt.toISOString() : undefined,
        reviewedBy: reviewed.reviewedBy
          ? {
              clinicianId: reviewed.reviewedBy.clinicianId,
              name: reviewed.reviewedBy.name,
            }
          : undefined,
        createdAt: toIsoString(reviewed.createdAt),
      },
    });
  } catch (error) {
    const handled = mapServiceError(error, res);
    if (handled) {
      return handled;
    }
    logger.error("Review clinician appointment request failed", {
      route: "PATCH /clinician/appointments/requests/:id",
      clinicianId: user.id,
      requestId,
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

export default router;
