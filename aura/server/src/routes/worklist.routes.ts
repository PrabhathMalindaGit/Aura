import { Router } from "express";
import { z } from "zod";

import { listClinicianWorklist } from "../services/worklistService";
import type { RequestWithUser } from "../types/auth";

const router = Router();

const worklistQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  highRiskOnly: z.enum(["true", "false"]).optional(),
  hasOpenAlerts: z.enum(["true", "false"]).optional(),
  needsResponse: z.enum(["true", "false"]).optional(),
  missedCheckins: z.enum(["true", "false"]).optional(),
  assignedToMe: z.enum(["true", "false"]).optional(),
  status: z.enum(["active", "on_hold", "discharged", "inactive"]).optional(),
  sort: z
    .enum(["priority", "updatedAt", "lastCheckinAt", "patientName", "nextAppointmentAt"])
    .optional()
    .default("priority"),
});

function toBoolean(value: "true" | "false" | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  return value === "true";
}

router.get("/clinician/worklist", async (req, res) => {
  const requestWithUser = req as RequestWithUser;
  if (!requestWithUser.user) {
    return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  }

  const parsedQuery = worklistQuerySchema.safeParse(req.query);
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

  const items = await listClinicianWorklist(
    {
      search: parsedQuery.data.search,
      highRiskOnly: toBoolean(parsedQuery.data.highRiskOnly),
      hasOpenAlerts: toBoolean(parsedQuery.data.hasOpenAlerts),
      needsResponse: toBoolean(parsedQuery.data.needsResponse),
      missedCheckins: toBoolean(parsedQuery.data.missedCheckins),
      assignedToMe: toBoolean(parsedQuery.data.assignedToMe),
      status: parsedQuery.data.status,
      sort: parsedQuery.data.sort,
    },
    requestWithUser.user.id
  );

  return res.json({
    ok: true,
    items,
    total: items.length,
  });
});

export default router;
