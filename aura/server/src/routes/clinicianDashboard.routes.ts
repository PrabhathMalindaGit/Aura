import { Response, Router } from "express";
import { z } from "zod";

import {
  getCommunicationOverview,
  getDashboardFollowUpTasks,
  getDashboardSummary,
  getPriorityQueue,
  getRecentSafetyEvents,
  getTodayAppointments,
} from "../services/dashboardSummaryService";
import type { RequestWithUser } from "../types/auth";

const router = Router();

const limitQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

const clinicianQuerySchema = z.object({
  clinicianId: z.string().trim().min(1).optional(),
});

const followUpTasksQuerySchema = z.object({
  clinicianId: z.string().trim().min(1).optional(),
  assignedToMe: z.enum(["true", "false"]).optional().default("false"),
  limit: z.coerce.number().int().min(1).max(100).optional().default(10),
});

function resolveClinicianId(
  req: RequestWithUser,
  fallback?: string
): string | undefined {
  return req.user?.id ?? fallback;
}

function unauthorizedIfMissingUser(req: RequestWithUser, res: Response) {
  if (!req.user) {
    res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
    return true;
  }
  return false;
}

router.get("/clinician/dashboard/summary", async (req, res) => {
  const requestWithUser = req as RequestWithUser;
  if (unauthorizedIfMissingUser(requestWithUser, res)) {
    return;
  }

  const parsedQuery = clinicianQuerySchema.safeParse(req.query);
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

  const summary = await getDashboardSummary(
    resolveClinicianId(requestWithUser, parsedQuery.data.clinicianId)
  );

  return res.json({
    ok: true,
    summary,
  });
});

router.get("/clinician/dashboard/priority-queue", async (req, res) => {
  const requestWithUser = req as RequestWithUser;
  if (unauthorizedIfMissingUser(requestWithUser, res)) {
    return;
  }

  const parsedLimit = limitQuerySchema.safeParse(req.query);
  if (!parsedLimit.success) {
    return res.status(400).json({
      ok: false,
      error: "VALIDATION_ERROR",
      details: parsedLimit.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }

  const items = await getPriorityQueue(requestWithUser.user?.id, parsedLimit.data.limit);
  return res.json({
    ok: true,
    items,
  });
});

router.get("/clinician/dashboard/recent-safety-events", async (req, res) => {
  const requestWithUser = req as RequestWithUser;
  if (unauthorizedIfMissingUser(requestWithUser, res)) {
    return;
  }

  const parsedLimit = limitQuerySchema.safeParse(req.query);
  if (!parsedLimit.success) {
    return res.status(400).json({
      ok: false,
      error: "VALIDATION_ERROR",
      details: parsedLimit.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }

  const items = await getRecentSafetyEvents(parsedLimit.data.limit);
  return res.json({
    ok: true,
    items,
  });
});

router.get("/clinician/dashboard/today-appointments", async (req, res) => {
  const requestWithUser = req as RequestWithUser;
  if (unauthorizedIfMissingUser(requestWithUser, res)) {
    return;
  }

  const parsedQuery = clinicianQuerySchema.safeParse(req.query);
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

  const items = await getTodayAppointments(
    resolveClinicianId(requestWithUser, parsedQuery.data.clinicianId)
  );
  return res.json({
    ok: true,
    items,
  });
});

router.get("/clinician/dashboard/follow-up-tasks", async (req, res) => {
  const requestWithUser = req as RequestWithUser;
  if (unauthorizedIfMissingUser(requestWithUser, res)) {
    return;
  }

  const parsedQuery = followUpTasksQuerySchema.safeParse(req.query);
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

  const items = await getDashboardFollowUpTasks(
    parsedQuery.data.assignedToMe === "true"
      ? resolveClinicianId(requestWithUser, parsedQuery.data.clinicianId)
      : undefined,
    parsedQuery.data.limit
  );

  return res.json({
    ok: true,
    items,
  });
});

router.get("/clinician/dashboard/communication-overview", async (req, res) => {
  const requestWithUser = req as RequestWithUser;
  if (unauthorizedIfMissingUser(requestWithUser, res)) {
    return;
  }

  const parsedLimit = limitQuerySchema.safeParse(req.query);
  if (!parsedLimit.success) {
    return res.status(400).json({
      ok: false,
      error: "VALIDATION_ERROR",
      details: parsedLimit.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }

  const overview = await getCommunicationOverview(parsedLimit.data.limit);
  return res.json({
    ok: true,
    overview,
  });
});

export default router;
