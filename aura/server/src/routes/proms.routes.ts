import { Router } from "express";
import { z } from "zod";

import { requirePatientAuth } from "../middleware/patientAuth";
import { validateBody } from "../middleware/validate";
import Patient from "../models/Patient";
import PromInstance from "../models/PromInstance";
import PromTemplate from "../models/PromTemplate";
import {
  computePromScore,
  validatePromSubmission,
  type PromQuestionLike,
  type PromScoringConfig,
  type PromSubmissionAnswer,
} from "../services/promsService";
import type { RequestWithUser } from "../types/auth";
import type { RequestWithPatient } from "../types/patientAuth";
import { isObjectId } from "../utils/ids";
import { logger } from "../utils/logger";

const router = Router();

const listQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
});

const assignPromSchema = z.object({
  templateKey: z.string().trim().min(1).max(120),
  dueAt: z.string().trim().min(1).optional(),
});

const submitPromSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string().trim().min(1).max(80),
        value: z.number().int(),
      })
    )
    .min(1),
});

type PromScoreRecord = {
  raw: number;
  normalized: number;
  bandKey: "green" | "amber" | "red";
  bandLabel: string;
};

type PromQuestionSnapshotRecord = {
  id?: unknown;
  text?: unknown;
  type?: unknown;
  min?: unknown;
  max?: unknown;
  labels?: {
    minLabel?: unknown;
    maxLabel?: unknown;
  };
  required?: unknown;
  reverse?: unknown;
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

function toTemplateQuestion(record: PromQuestionSnapshotRecord): PromQuestionLike | null {
  const id = typeof record.id === "string" ? record.id.trim() : "";
  const text = typeof record.text === "string" ? record.text.trim() : "";
  const min = typeof record.min === "number" ? record.min : Number.NaN;
  const max = typeof record.max === "number" ? record.max : Number.NaN;

  if (!id || !text || !Number.isFinite(min) || !Number.isFinite(max)) {
    return null;
  }

  return {
    id,
    text,
    type: "likert",
    min,
    max,
    labels:
      record.labels && typeof record.labels === "object"
        ? {
            minLabel:
              typeof record.labels.minLabel === "string"
                ? record.labels.minLabel
                : undefined,
            maxLabel:
              typeof record.labels.maxLabel === "string"
                ? record.labels.maxLabel
                : undefined,
          }
        : undefined,
    required: record.required !== false,
    reverse: record.reverse === true,
  };
}

function toScoringConfig(record: unknown): PromScoringConfig {
  const scoringRecord = record && typeof record === "object" ? (record as Record<string, unknown>) : {};
  const bands = Array.isArray(scoringRecord.bands)
    ? scoringRecord.bands
        .map((entry) => {
          const band = entry as {
            key?: unknown;
            min?: unknown;
            max?: unknown;
            label?: unknown;
          };
          if (
            (band.key !== "green" && band.key !== "amber" && band.key !== "red") ||
            typeof band.min !== "number" ||
            typeof band.max !== "number"
          ) {
            return null;
          }

          const bandKey = band.key as "green" | "amber" | "red";
          return {
            key: bandKey,
            min: band.min,
            max: band.max,
            label: typeof band.label === "string" ? band.label : String(bandKey),
          };
        })
        .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    : [];

  return {
    method: "sum",
    minRaw: typeof scoringRecord.minRaw === "number" ? scoringRecord.minRaw : 0,
    maxRaw: typeof scoringRecord.maxRaw === "number" ? scoringRecord.maxRaw : 0,
    normalizeTo100: scoringRecord.normalizeTo100 !== false,
    bands,
  };
}

function mapDueCard(instance: {
  _id?: unknown;
  templateKey?: unknown;
  titleSnapshot?: unknown;
  dueAt?: unknown;
  status?: unknown;
}) {
  return {
    id: String(instance._id ?? ""),
    templateKey: typeof instance.templateKey === "string" ? instance.templateKey : "",
    title: typeof instance.titleSnapshot === "string" ? instance.titleSnapshot : "",
    dueAt: toIso(instance.dueAt) ?? new Date(0).toISOString(),
    status: instance.status === "completed" ? "completed" : "due",
  };
}

function mapHistoryRow(instance: {
  _id?: unknown;
  templateKey?: unknown;
  titleSnapshot?: unknown;
  completedAt?: unknown;
  score?: unknown;
}) {
  const scoreRecord = instance.score as PromScoreRecord | null | undefined;
  return {
    id: String(instance._id ?? ""),
    templateKey: typeof instance.templateKey === "string" ? instance.templateKey : "",
    title: typeof instance.titleSnapshot === "string" ? instance.titleSnapshot : "",
    completedAt: toIso(instance.completedAt) ?? new Date(0).toISOString(),
    score:
      scoreRecord && typeof scoreRecord.normalized === "number"
        ? {
            normalized: scoreRecord.normalized,
            bandKey: scoreRecord.bandKey,
            bandLabel: scoreRecord.bandLabel,
          }
        : null,
  };
}

function mapInstanceDetailForPatient(instance: {
  _id?: unknown;
  templateKey?: unknown;
  templateVersion?: unknown;
  titleSnapshot?: unknown;
  dueAt?: unknown;
  status?: unknown;
  completedAt?: unknown;
  questionsSnapshot?: unknown;
  answers?: unknown;
  score?: unknown;
}) {
  const questions = Array.isArray(instance.questionsSnapshot)
    ? instance.questionsSnapshot
        .map((entry) => toTemplateQuestion(entry as PromQuestionSnapshotRecord))
        .filter((entry): entry is PromQuestionLike => Boolean(entry))
    : [];

  const answers = Array.isArray(instance.answers)
    ? instance.answers
        .map((entry) => {
          const answer = entry as { questionId?: unknown; value?: unknown };
          if (typeof answer.questionId !== "string" || typeof answer.value !== "number") {
            return null;
          }
          return {
            questionId: answer.questionId,
            value: answer.value,
          };
        })
        .filter((entry): entry is { questionId: string; value: number } => Boolean(entry))
    : [];

  const scoreRecord = instance.score as PromScoreRecord | null | undefined;

  return {
    id: String(instance._id ?? ""),
    templateKey: typeof instance.templateKey === "string" ? instance.templateKey : "",
    templateVersion:
      typeof instance.templateVersion === "number" ? instance.templateVersion : 1,
    title: typeof instance.titleSnapshot === "string" ? instance.titleSnapshot : "",
    dueAt: toIso(instance.dueAt) ?? new Date(0).toISOString(),
    status: instance.status === "completed" ? "completed" : "due",
    completedAt: toIso(instance.completedAt),
    questions: questions.map((question) => ({
      id: question.id,
      text: question.text,
      type: question.type,
      min: question.min,
      max: question.max,
      labels: question.labels,
      required: question.required !== false,
    })),
    answers,
    score:
      scoreRecord && typeof scoreRecord.normalized === "number"
        ? {
            raw: scoreRecord.raw,
            normalized: scoreRecord.normalized,
            bandKey: scoreRecord.bandKey,
            bandLabel: scoreRecord.bandLabel,
          }
        : null,
  };
}

function mapInstanceDetailForClinician(instance: {
  _id?: unknown;
  patientId?: unknown;
  templateKey?: unknown;
  templateVersion?: unknown;
  titleSnapshot?: unknown;
  dueAt?: unknown;
  status?: unknown;
  completedAt?: unknown;
  questionsSnapshot?: unknown;
  answers?: unknown;
  score?: unknown;
}) {
  const base = mapInstanceDetailForPatient(instance);
  return {
    ...base,
    patientId: typeof instance.patientId === "string" ? instance.patientId : "",
    questions: Array.isArray(instance.questionsSnapshot)
      ? instance.questionsSnapshot
          .map((entry) => toTemplateQuestion(entry as PromQuestionSnapshotRecord))
          .filter((entry): entry is PromQuestionLike => Boolean(entry))
      : [],
  };
}

router.get("/patient/proms/due", requirePatientAuth, async (req, res) => {
  const requestWithPatient = req as RequestWithPatient;
  const patientId = requestWithPatient.patient?.id;

  if (!patientId) {
    return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  }

  const parsedQuery = listQuerySchema.safeParse(req.query);
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
    const due = await PromInstance.find({ patientId, status: "due" })
      .sort({ dueAt: 1 })
      .limit(parsedQuery.data.limit)
      .lean();

    return res.json({
      ok: true,
      due: due.map((instance) => mapDueCard(instance as Record<string, unknown>)),
    });
  } catch (error) {
    logger.error("List patient due proms failed", {
      route: "GET /patient/proms/due",
      patientId,
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

router.get("/patient/proms/history", requirePatientAuth, async (req, res) => {
  const requestWithPatient = req as RequestWithPatient;
  const patientId = requestWithPatient.patient?.id;

  if (!patientId) {
    return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  }

  const parsedQuery = listQuerySchema.safeParse(req.query);
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
    const history = await PromInstance.find({ patientId, status: "completed" })
      .sort({ completedAt: -1 })
      .limit(parsedQuery.data.limit)
      .lean();

    return res.json({
      ok: true,
      history: history.map((instance) => mapHistoryRow(instance as Record<string, unknown>)),
    });
  } catch (error) {
    logger.error("List patient prom history failed", {
      route: "GET /patient/proms/history",
      patientId,
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

router.get("/patient/proms/:id", requirePatientAuth, async (req, res) => {
  const requestWithPatient = req as RequestWithPatient;
  const patientId = requestWithPatient.patient?.id;
  const promId = typeof req.params.id === "string" ? req.params.id.trim() : "";

  if (!patientId) {
    return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  }

  if (!promId || !isObjectId(promId)) {
    return res.status(400).json({
      ok: false,
      error: "VALIDATION_ERROR",
      details: [{ path: "id", message: "Invalid PROM id" }],
    });
  }

  try {
    const instance = await PromInstance.findOne({ _id: promId, patientId }).lean();
    if (!instance) {
      return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    }

    return res.json({
      ok: true,
      prom: mapInstanceDetailForPatient(instance as Record<string, unknown>),
    });
  } catch (error) {
    logger.error("Get patient prom instance failed", {
      route: "GET /patient/proms/:id",
      patientId,
      promId,
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

router.post(
  "/patient/proms/:id/submit",
  requirePatientAuth,
  validateBody(submitPromSchema),
  async (req, res) => {
    const requestWithPatient = req as RequestWithPatient;
    const patientId = requestWithPatient.patient?.id;
    const promId = typeof req.params.id === "string" ? req.params.id.trim() : "";

    if (!patientId) {
      return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
    }

    if (!promId || !isObjectId(promId)) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        details: [{ path: "id", message: "Invalid PROM id" }],
      });
    }

    try {
      const instance = await PromInstance.findOne({ _id: promId, patientId });
      if (!instance) {
        return res.status(404).json({ ok: false, error: "NOT_FOUND" });
      }

      if (instance.status === "completed") {
        return res.status(409).json({ ok: false, error: "ALREADY_COMPLETED" });
      }

      const body = req.body as z.infer<typeof submitPromSchema>;
      const questions = Array.isArray(instance.questionsSnapshot)
        ? instance.questionsSnapshot
            .map((entry) => toTemplateQuestion(entry as PromQuestionSnapshotRecord))
            .filter((entry): entry is PromQuestionLike => Boolean(entry))
        : [];

      const template = await PromTemplate.findOne({ key: instance.templateKey, version: instance.templateVersion })
        .select({ scoring: 1 })
        .lean();
      const scoring = toScoringConfig((template as { scoring?: unknown } | null)?.scoring);

      let validatedAnswers: PromSubmissionAnswer[] = [];
      let score: {
        raw: number;
        normalized: number;
        bandKey: "green" | "amber" | "red";
        bandLabel: string;
      };
      try {
        validatedAnswers = validatePromSubmission(
          { questions },
          body.answers as PromSubmissionAnswer[]
        );
        score = computePromScore(
          { questions, scoring },
          validatedAnswers
        );
      } catch (validationError) {
        return res.status(400).json({
          ok: false,
          error: "VALIDATION_ERROR",
          details: [
            {
              path: "answers",
              message:
                validationError instanceof Error
                  ? validationError.message
                  : "Invalid answers payload",
            },
          ],
        });
      }

      const completedAt = new Date();
      instance.set({
        answers: validatedAnswers,
        score,
        status: "completed",
        completedAt,
      });
      await instance.save();

      return res.json({
        ok: true,
        id: String(instance._id),
        completedAt: completedAt.toISOString(),
        score,
      });
    } catch (error) {
      logger.error("Submit patient prom failed", {
        route: "POST /patient/proms/:id/submit",
        patientId,
        promId,
        message: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
    }
  }
);

router.get("/clinician/patients/:patientId/proms", async (req, res) => {
  const requestWithUser = req as RequestWithUser;
  const patientId = typeof req.params.patientId === "string" ? req.params.patientId.trim() : "";

  if (!requestWithUser.user) {
    return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  }

  if (!patientId) {
    return res.status(400).json({
      ok: false,
      error: "VALIDATION_ERROR",
      details: [{ path: "patientId", message: "patientId is required" }],
    });
  }

  const parsedQuery = listQuerySchema.safeParse(req.query);
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
    const [due, completed] = await Promise.all([
      PromInstance.find({ patientId, status: "due" })
        .sort({ dueAt: 1 })
        .limit(parsedQuery.data.limit)
        .lean(),
      PromInstance.find({ patientId, status: "completed" })
        .sort({ completedAt: -1 })
        .limit(parsedQuery.data.limit)
        .lean(),
    ]);

    return res.json({
      ok: true,
      patientId,
      due: due.map((instance) => mapDueCard(instance as Record<string, unknown>)),
      completed: completed.map((instance) => mapHistoryRow(instance as Record<string, unknown>)),
    });
  } catch (error) {
    logger.error("List clinician patient proms failed", {
      route: "GET /clinician/patients/:patientId/proms",
      patientId,
      clinicianId: requestWithUser.user.id,
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

router.get("/clinician/proms/:id", async (req, res) => {
  const requestWithUser = req as RequestWithUser;
  const promId = typeof req.params.id === "string" ? req.params.id.trim() : "";

  if (!requestWithUser.user) {
    return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  }

  if (!promId || !isObjectId(promId)) {
    return res.status(400).json({
      ok: false,
      error: "VALIDATION_ERROR",
      details: [{ path: "id", message: "Invalid PROM id" }],
    });
  }

  try {
    const instance = await PromInstance.findById(promId).lean();
    if (!instance) {
      return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    }

    return res.json({
      ok: true,
      prom: mapInstanceDetailForClinician(instance as Record<string, unknown>),
    });
  } catch (error) {
    logger.error("Get clinician prom detail failed", {
      route: "GET /clinician/proms/:id",
      promId,
      clinicianId: requestWithUser.user.id,
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

router.post(
  "/clinician/patients/:patientId/proms/assign",
  validateBody(assignPromSchema),
  async (req, res) => {
    const requestWithUser = req as RequestWithUser;
    const patientId = typeof req.params.patientId === "string" ? req.params.patientId.trim() : "";

    if (!requestWithUser.user) {
      return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
    }

    if (!patientId) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        details: [{ path: "patientId", message: "patientId is required" }],
      });
    }

    try {
      const patient = await Patient.findOne({ patientId }).select({ patientId: 1 }).lean();
      if (!patient) {
        return res.status(404).json({ ok: false, error: "NOT_FOUND" });
      }

      const body = req.body as z.infer<typeof assignPromSchema>;
      const template = await PromTemplate.findOne({ key: body.templateKey }).lean();
      if (!template) {
        return res.status(404).json({
          ok: false,
          error: "NOT_FOUND",
          details: [{ path: "templateKey", message: "PROM template not found" }],
        });
      }

      const dueAt = body.dueAt ? new Date(body.dueAt) : new Date();
      if (!Number.isFinite(dueAt.getTime())) {
        return res.status(400).json({
          ok: false,
          error: "VALIDATION_ERROR",
          details: [{ path: "dueAt", message: "dueAt must be a valid ISO datetime" }],
        });
      }

      const questionsSnapshot = Array.isArray(template.questions)
        ? template.questions
            .map((entry) => toTemplateQuestion(entry as PromQuestionSnapshotRecord))
            .filter((entry): entry is PromQuestionLike => Boolean(entry))
        : [];

      const created = await PromInstance.create({
        patientId,
        templateKey: template.key,
        templateVersion: typeof template.version === "number" ? template.version : 1,
        titleSnapshot: template.title,
        questionsSnapshot,
        dueAt,
        status: "due",
        answers: [],
        score: null,
      });

      return res.json({
        ok: true,
        patientId,
        due: mapDueCard(created.toObject() as Record<string, unknown>),
      });
    } catch (error) {
      logger.error("Assign clinician prom failed", {
        route: "POST /clinician/patients/:patientId/proms/assign",
        patientId,
        clinicianId: requestWithUser.user.id,
        message: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
    }
  }
);

export default router;
