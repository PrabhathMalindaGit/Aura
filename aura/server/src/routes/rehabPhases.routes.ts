import { Router } from "express";
import { z } from "zod";

import { requirePatientAuth } from "../middleware/patientAuth";
import { validateBody } from "../middleware/validate";
import Patient from "../models/Patient";
import {
  buildDefaultPhases,
  normalizeRehabPhases,
  recomputePhaseStatuses,
  type RehabPhase,
} from "../services/rehabPhaseService";
import type { RequestWithUser } from "../types/auth";
import type { RequestWithPatient } from "../types/patientAuth";
import { logger } from "../utils/logger";

const router = Router();

const setCurrentPhaseSchema = z.object({
  currentKey: z.string().trim().min(1).max(80),
});

type RehabUpdatedBy = {
  clinicianId: string;
  name?: string;
};

type RehabResponse = {
  currentKey: string | null;
  phases: Array<{
    key: string;
    title: string;
    description?: string;
    order: number;
    status: "locked" | "current" | "done";
    startedAt: string | null;
    completedAt: string | null;
  }>;
  updatedAt: string;
  updatedBy?: RehabUpdatedBy;
};

function toIso(value: unknown): string | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString();
  }

  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return null;
}

function mapRehabForResponse(input: {
  currentKey: string | null;
  phases: RehabPhase[];
  updatedAt?: unknown;
  updatedBy?: unknown;
}): RehabResponse {
  const updatedByRecord =
    input.updatedBy && typeof input.updatedBy === "object"
      ? (input.updatedBy as { clinicianId?: unknown; name?: unknown })
      : undefined;

  return {
    currentKey: input.currentKey,
    phases: [...input.phases]
      .sort((left, right) => left.order - right.order)
      .map((phase) => ({
        key: phase.key,
        title: phase.title,
        description: phase.description,
        order: phase.order,
        status: phase.status,
        startedAt: toIso(phase.startedAt),
        completedAt: toIso(phase.completedAt),
      })),
    updatedAt: toIso(input.updatedAt) ?? new Date(0).toISOString(),
    updatedBy:
      updatedByRecord && typeof updatedByRecord.clinicianId === "string"
        ? {
            clinicianId: updatedByRecord.clinicianId,
            name:
              typeof updatedByRecord.name === "string"
                ? updatedByRecord.name
                : undefined,
          }
        : undefined,
  };
}

function extractCurrentKey(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function phaseExists(phases: RehabPhase[], key: string): boolean {
  return phases.some((phase) => phase.key === key);
}

async function ensureRehabInitialized(
  patientDoc: {
    rehab?: {
      phases?: unknown;
      currentKey?: unknown;
      updatedAt?: unknown;
      updatedBy?: unknown;
    };
    save: () => Promise<unknown>;
    set: (path: string, value: unknown) => void;
  },
  actor?: RehabUpdatedBy
): Promise<RehabResponse> {
  const now = new Date();
  const rehabRecord = patientDoc.rehab;
  const phases = normalizeRehabPhases(rehabRecord?.phases);
  const currentKey = extractCurrentKey(rehabRecord?.currentKey);

  if (phases.length === 0) {
    const computed = recomputePhaseStatuses(buildDefaultPhases(), null, now);
    patientDoc.set("rehab", {
      phases: computed.phases,
      currentKey: computed.currentKey,
      updatedAt: now,
      updatedBy: actor,
    });
    await patientDoc.save();

    return mapRehabForResponse({
      currentKey: computed.currentKey,
      phases: computed.phases,
      updatedAt: now,
      updatedBy: actor,
    });
  }

  if (currentKey && phaseExists(phases, currentKey)) {
    return mapRehabForResponse({
      currentKey,
      phases,
      updatedAt: rehabRecord?.updatedAt,
      updatedBy: rehabRecord?.updatedBy,
    });
  }

  const recomputed = recomputePhaseStatuses(phases, currentKey, now);
  patientDoc.set("rehab", {
    phases: recomputed.phases,
    currentKey: recomputed.currentKey,
    updatedAt: rehabRecord?.updatedAt ?? now,
    updatedBy: rehabRecord?.updatedBy ?? actor,
  });
  await patientDoc.save();

  return mapRehabForResponse({
    currentKey: recomputed.currentKey,
    phases: recomputed.phases,
    updatedAt: rehabRecord?.updatedAt ?? now,
    updatedBy: rehabRecord?.updatedBy ?? actor,
  });
}

router.get("/patient/rehab-phases", requirePatientAuth, async (req, res) => {
  const requestWithPatient = req as RequestWithPatient;
  const patientId = requestWithPatient.patient?.id;

  if (!patientId) {
    return res.status(401).json({
      ok: false,
      error: "UNAUTHORIZED",
    });
  }

  try {
    const patientDoc = await Patient.findOne({ patientId });
    if (!patientDoc) {
      return res.status(404).json({
        ok: false,
        error: "NOT_FOUND",
      });
    }

    const rehab = await ensureRehabInitialized(patientDoc);
    return res.json({
      ok: true,
      patientId,
      rehab,
    });
  } catch (error) {
    logger.error("Get patient rehab phases failed", {
      route: "GET /patient/rehab-phases",
      patientId,
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({
      ok: false,
      error: "INTERNAL_ERROR",
    });
  }
});

router.get("/clinician/patients/:patientId/rehab-phases", async (req, res) => {
  const patientId = typeof req.params.patientId === "string" ? req.params.patientId.trim() : "";

  if (!patientId) {
    return res.status(400).json({
      ok: false,
      error: "VALIDATION_ERROR",
      details: [
        {
          path: "patientId",
          message: "patientId is required",
        },
      ],
    });
  }

  try {
    const patientDoc = await Patient.findOne({ patientId });
    if (!patientDoc) {
      return res.status(404).json({
        ok: false,
        error: "NOT_FOUND",
      });
    }

    const rehab = await ensureRehabInitialized(patientDoc);
    return res.json({
      ok: true,
      patientId,
      rehab,
    });
  } catch (error) {
    logger.error("Get clinician rehab phases failed", {
      route: "GET /clinician/patients/:patientId/rehab-phases",
      patientId,
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({
      ok: false,
      error: "INTERNAL_ERROR",
    });
  }
});

router.patch(
  "/clinician/patients/:patientId/rehab-phase",
  validateBody(setCurrentPhaseSchema),
  async (req, res) => {
    const requestWithUser = req as RequestWithUser;
    const patientId = typeof req.params.patientId === "string" ? req.params.patientId.trim() : "";

    if (!patientId) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        details: [
          {
            path: "patientId",
            message: "patientId is required",
          },
        ],
      });
    }

    if (!requestWithUser.user) {
      return res.status(401).json({
        ok: false,
        error: "UNAUTHORIZED",
      });
    }

    const actor: RehabUpdatedBy = {
      clinicianId: requestWithUser.user.id,
      name: requestWithUser.user.name,
    };

    try {
      const patientDoc = await Patient.findOne({ patientId });
      if (!patientDoc) {
        return res.status(404).json({
          ok: false,
          error: "NOT_FOUND",
        });
      }

      const initialized = await ensureRehabInitialized(patientDoc, actor);
      const body = req.body as z.infer<typeof setCurrentPhaseSchema>;
      const nextKey = body.currentKey.trim();

      if (!initialized.phases.some((phase) => phase.key === nextKey)) {
        return res.status(400).json({
          ok: false,
          error: "VALIDATION_ERROR",
          details: [
            {
              path: "currentKey",
              message: "currentKey must match one of the configured phase keys",
            },
          ],
        });
      }

      const now = new Date();
      const next = recomputePhaseStatuses(
        initialized.phases.map((phase) => ({
          ...phase,
          startedAt: phase.startedAt ? new Date(phase.startedAt) : null,
          completedAt: phase.completedAt ? new Date(phase.completedAt) : null,
        })),
        nextKey,
        now
      );

      patientDoc.set("rehab", {
        phases: next.phases,
        currentKey: next.currentKey,
        updatedAt: now,
        updatedBy: actor,
      });
      await patientDoc.save();

      return res.json({
        ok: true,
        patientId,
        rehab: mapRehabForResponse({
          currentKey: next.currentKey,
          phases: next.phases,
          updatedAt: now,
          updatedBy: actor,
        }),
      });
    } catch (error) {
      logger.error("Set clinician rehab current phase failed", {
        route: "PATCH /clinician/patients/:patientId/rehab-phase",
        patientId,
        clinicianId: requestWithUser.user.id,
        message: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({
        ok: false,
        error: "INTERNAL_ERROR",
      });
    }
  }
);

export default router;
