import fs from "node:fs";
import fsPromises from "node:fs/promises";
import { Router, type Response } from "express";
import multer from "multer";
import { z } from "zod";

import { requirePatientAuth } from "../middleware/patientAuth";
import Patient from "../models/Patient";
import SymptomPhoto from "../models/SymptomPhoto";
import type { RequestWithUser } from "../types/auth";
import type { RequestWithPatient } from "../types/patientAuth";
import { isObjectId } from "../utils/ids";
import { logger } from "../utils/logger";
import {
  createSymptomPhotoUploadMiddleware,
  removeSymptomPhotoFile,
  resolveSymptomPhotoPath,
  SymptomPhotoUploadValidationError,
  validateSymptomPhotoFile,
  writeSymptomPhotoFile,
} from "../services/symptomPhotoStorage";

const router = Router();
const uploadPhoto = createSymptomPhotoUploadMiddleware();
const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const NOTE_PREVIEW_MAX = 80;

const patientPhotoFieldsSchema = z.object({
  date: z.string().regex(DATE_ONLY_REGEX).optional(),
  kind: z.enum(["swelling", "wound", "rash", "other"]),
  note: z.string().max(2_000).optional(),
});

const listQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  from: z.string().regex(DATE_ONLY_REGEX).optional(),
  to: z.string().regex(DATE_ONLY_REGEX).optional(),
});

const metaIdSchema = z.object({
  id: z.string().min(1),
});

function toDateOnlyLocal(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

function parseDateOnly(dateString: string): Date | null {
  if (!DATE_ONLY_REGEX.test(dateString)) {
    return null;
  }
  const [yearString, monthString, dayString] = dateString.split("-");
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

function toSafeNote(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.slice(0, 280);
}

function toNotePreview(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.length > NOTE_PREVIEW_MAX
    ? `${trimmed.slice(0, NOTE_PREVIEW_MAX)}…`
    : trimmed;
}

function toValidationError(res: Response, message: string) {
  return res.status(400).json({
    ok: false,
    error: "VALIDATION_ERROR",
    details: [{ path: "body", message }],
  });
}

function handleUploadError(error: unknown, res: Response) {
  if (error instanceof SymptomPhotoUploadValidationError) {
    return res.status(error.statusCode).json({
      ok: false,
      error: "VALIDATION_ERROR",
      details: [{ path: "file", message: error.message }],
    });
  }
  if (error instanceof multer.MulterError) {
    return res.status(400).json({
      ok: false,
      error: "VALIDATION_ERROR",
      details: [{ path: "file", message: error.message }],
    });
  }
  return null;
}

router.post("/patient/photos", requirePatientAuth, (req, res) => {
  uploadPhoto(req, res, async (uploadError) => {
    const uploadHandled = handleUploadError(uploadError, res);
    if (uploadHandled) {
      return uploadHandled;
    }

    const requestWithPatient = req as RequestWithPatient;
    const patientId = requestWithPatient.patient?.id;
    if (!patientId) {
      return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
    }

    const parsedFields = patientPhotoFieldsSchema.safeParse({
      date: req.body?.date,
      kind: req.body?.kind,
      note: req.body?.note,
    });
    if (!parsedFields.success) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        details: parsedFields.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    const resolvedDate = parsedFields.data.date ?? toDateOnlyLocal(new Date());
    if (!parseDateOnly(resolvedDate)) {
      return toValidationError(res, "date must be a valid YYYY-MM-DD value");
    }

    const fileValidation = (() => {
      try {
        return validateSymptomPhotoFile(req.file);
      } catch (error) {
        return error;
      }
    })();
    if (fileValidation instanceof Error) {
      const uploadValidationHandled = handleUploadError(fileValidation, res);
      if (uploadValidationHandled) {
        return uploadValidationHandled;
      }
      return toValidationError(res, "Invalid image upload.");
    }

    const photoDoc = new SymptomPhoto({
      patientId,
      date: resolvedDate,
      kind: parsedFields.data.kind,
      note: toSafeNote(parsedFields.data.note),
      mimeType: fileValidation.mimeType,
      sizeBytes: fileValidation.sizeBytes,
      originalName: fileValidation.originalName,
      storageKey: "",
    });
    photoDoc.storageKey = `${String(photoDoc._id)}.${fileValidation.extension}`;

    try {
      await writeSymptomPhotoFile(photoDoc.storageKey, req.file!.buffer);
      await photoDoc.save();

      return res.json({
        ok: true,
        id: String(photoDoc._id),
        date: photoDoc.date,
        kind: photoDoc.kind,
        createdAt: photoDoc.createdAt?.toISOString() ?? new Date().toISOString(),
      });
    } catch (error) {
      await removeSymptomPhotoFile(photoDoc.storageKey);
      logger.error("Upload symptom photo failed", {
        route: "POST /patient/photos",
        patientId,
        message: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
    }
  });
});

router.get("/patient/photos", requirePatientAuth, async (req, res) => {
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

  const { limit, from, to } = parsedQuery.data;
  if (from && !parseDateOnly(from)) {
    return toValidationError(res, "from must be a valid YYYY-MM-DD value");
  }
  if (to && !parseDateOnly(to)) {
    return toValidationError(res, "to must be a valid YYYY-MM-DD value");
  }
  if (from && to && compareDateOnly(from, to) > 0) {
    return toValidationError(res, "from must be less than or equal to to");
  }

  try {
    const filter: Record<string, unknown> = { patientId };
    if (from || to) {
      filter.date = {};
      if (from) {
        (filter.date as { $gte?: string }).$gte = from;
      }
      if (to) {
        (filter.date as { $lte?: string }).$lte = to;
      }
    }

    const rows = await SymptomPhoto.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .limit(limit)
      .select({ date: 1, kind: 1, note: 1, createdAt: 1 })
      .lean();

    return res.json({
      ok: true,
      items: rows.map((row) => ({
        id: String(row._id),
        date: typeof row.date === "string" ? row.date : "",
        kind:
          row.kind === "swelling" ||
          row.kind === "wound" ||
          row.kind === "rash" ||
          row.kind === "other"
            ? row.kind
            : "other",
        notePreview: toNotePreview(row.note),
        createdAt:
          row.createdAt instanceof Date
            ? row.createdAt.toISOString()
            : new Date(0).toISOString(),
      })),
    });
  } catch (error) {
    logger.error("List patient photos failed", {
      route: "GET /patient/photos",
      patientId,
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

router.get("/patient/photos/:id/meta", requirePatientAuth, async (req, res) => {
  const requestWithPatient = req as RequestWithPatient;
  const patientId = requestWithPatient.patient?.id;
  if (!patientId) {
    return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  }

  const parsedParams = metaIdSchema.safeParse(req.params);
  if (!parsedParams.success || !isObjectId(parsedParams.data.id)) {
    return toValidationError(res, "Invalid photo id");
  }

  try {
    const row = await SymptomPhoto.findOne({
      _id: parsedParams.data.id,
      patientId,
    })
      .select({ date: 1, kind: 1, note: 1, createdAt: 1, mimeType: 1, sizeBytes: 1 })
      .lean();

    if (!row) {
      return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    }

    return res.json({
      ok: true,
      id: String(row._id),
      date: typeof row.date === "string" ? row.date : "",
      kind:
        row.kind === "swelling" ||
        row.kind === "wound" ||
        row.kind === "rash" ||
        row.kind === "other"
          ? row.kind
          : "other",
      note: typeof row.note === "string" ? row.note : undefined,
      createdAt:
        row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : new Date(0).toISOString(),
      mimeType: typeof row.mimeType === "string" ? row.mimeType : "application/octet-stream",
      sizeBytes:
        typeof row.sizeBytes === "number" && Number.isFinite(row.sizeBytes)
          ? row.sizeBytes
          : 0,
    });
  } catch (error) {
    logger.error("Get patient photo meta failed", {
      route: "GET /patient/photos/:id/meta",
      patientId,
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

async function streamSymptomPhotoFile(
  res: Response,
  row: {
    mimeType?: unknown;
    sizeBytes?: unknown;
    storageKey?: unknown;
  }
) {
  const storageKey = typeof row.storageKey === "string" ? row.storageKey : "";
  if (!storageKey) {
    return res.status(404).json({ ok: false, error: "NOT_FOUND" });
  }

  const filePath = resolveSymptomPhotoPath(storageKey);
  try {
    await fsPromises.access(filePath);
  } catch {
    return res.status(404).json({ ok: false, error: "NOT_FOUND" });
  }

  const mimeType =
    typeof row.mimeType === "string" ? row.mimeType : "application/octet-stream";
  const sizeBytes =
    typeof row.sizeBytes === "number" && Number.isFinite(row.sizeBytes)
      ? Math.max(0, Math.floor(row.sizeBytes))
      : undefined;

  res.setHeader("Content-Type", mimeType);
  res.setHeader("Cache-Control", "private, max-age=300");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (typeof sizeBytes === "number" && sizeBytes > 0) {
    res.setHeader("Content-Length", String(sizeBytes));
  }

  const stream = fs.createReadStream(filePath);
  stream.on("error", () => {
    if (!res.headersSent) {
      res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
    } else {
      res.end();
    }
  });
  stream.pipe(res);
  return undefined;
}

router.get("/patient/photos/:id/file", requirePatientAuth, async (req, res) => {
  const requestWithPatient = req as RequestWithPatient;
  const patientId = requestWithPatient.patient?.id;
  if (!patientId) {
    return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  }

  const parsedParams = metaIdSchema.safeParse(req.params);
  if (!parsedParams.success || !isObjectId(parsedParams.data.id)) {
    return toValidationError(res, "Invalid photo id");
  }

  try {
    const row = await SymptomPhoto.findOne({
      _id: parsedParams.data.id,
      patientId,
    })
      .select({ mimeType: 1, sizeBytes: 1, storageKey: 1 })
      .lean();

    if (!row) {
      return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    }

    return streamSymptomPhotoFile(res, row);
  } catch (error) {
    logger.error("Get patient photo file failed", {
      route: "GET /patient/photos/:id/file",
      patientId,
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

router.get("/clinician/patients/:patientId/photos", async (req, res) => {
  const requestWithUser = req as RequestWithUser;
  if (!requestWithUser.user) {
    return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  }

  const patientId =
    typeof req.params.patientId === "string" ? req.params.patientId.trim() : "";
  if (!patientId) {
    return toValidationError(res, "patientId is required");
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

  const { limit, from, to } = parsedQuery.data;
  if (from && !parseDateOnly(from)) {
    return toValidationError(res, "from must be a valid YYYY-MM-DD value");
  }
  if (to && !parseDateOnly(to)) {
    return toValidationError(res, "to must be a valid YYYY-MM-DD value");
  }
  if (from && to && compareDateOnly(from, to) > 0) {
    return toValidationError(res, "from must be less than or equal to to");
  }

  try {
    const patient = await Patient.findOne({ patientId }).select({ patientId: 1 }).lean();
    if (!patient) {
      return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    }

    const filter: Record<string, unknown> = { patientId };
    if (from || to) {
      filter.date = {};
      if (from) {
        (filter.date as { $gte?: string }).$gte = from;
      }
      if (to) {
        (filter.date as { $lte?: string }).$lte = to;
      }
    }

    const rows = await SymptomPhoto.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .limit(limit)
      .select({ date: 1, kind: 1, note: 1, createdAt: 1 })
      .lean();

    return res.json({
      ok: true,
      patientId,
      items: rows.map((row) => ({
        id: String(row._id),
        date: typeof row.date === "string" ? row.date : "",
        kind:
          row.kind === "swelling" ||
          row.kind === "wound" ||
          row.kind === "rash" ||
          row.kind === "other"
            ? row.kind
            : "other",
        notePreview: toNotePreview(row.note),
        createdAt:
          row.createdAt instanceof Date
            ? row.createdAt.toISOString()
            : new Date(0).toISOString(),
      })),
    });
  } catch (error) {
    logger.error("List clinician photos failed", {
      route: "GET /clinician/patients/:patientId/photos",
      patientId,
      clinicianId: requestWithUser.user.id,
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

router.get("/clinician/photos/:id/meta", async (req, res) => {
  const requestWithUser = req as RequestWithUser;
  if (!requestWithUser.user) {
    return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  }

  const parsedParams = metaIdSchema.safeParse(req.params);
  if (!parsedParams.success || !isObjectId(parsedParams.data.id)) {
    return toValidationError(res, "Invalid photo id");
  }

  try {
    const row = await SymptomPhoto.findById(parsedParams.data.id)
      .select({
        patientId: 1,
        date: 1,
        kind: 1,
        note: 1,
        createdAt: 1,
        mimeType: 1,
        sizeBytes: 1,
      })
      .lean();
    if (!row) {
      return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    }

    return res.json({
      ok: true,
      id: String(row._id),
      patientId: typeof row.patientId === "string" ? row.patientId : "",
      date: typeof row.date === "string" ? row.date : "",
      kind:
        row.kind === "swelling" ||
        row.kind === "wound" ||
        row.kind === "rash" ||
        row.kind === "other"
          ? row.kind
          : "other",
      note: typeof row.note === "string" ? row.note : undefined,
      createdAt:
        row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : new Date(0).toISOString(),
      mimeType: typeof row.mimeType === "string" ? row.mimeType : "application/octet-stream",
      sizeBytes:
        typeof row.sizeBytes === "number" && Number.isFinite(row.sizeBytes)
          ? row.sizeBytes
          : 0,
    });
  } catch (error) {
    logger.error("Get clinician photo meta failed", {
      route: "GET /clinician/photos/:id/meta",
      clinicianId: requestWithUser.user.id,
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

router.get("/clinician/photos/:id/file", async (req, res) => {
  const requestWithUser = req as RequestWithUser;
  if (!requestWithUser.user) {
    return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  }

  const parsedParams = metaIdSchema.safeParse(req.params);
  if (!parsedParams.success || !isObjectId(parsedParams.data.id)) {
    return toValidationError(res, "Invalid photo id");
  }

  try {
    const row = await SymptomPhoto.findById(parsedParams.data.id)
      .select({ mimeType: 1, sizeBytes: 1, storageKey: 1, patientId: 1 })
      .lean();
    if (!row) {
      return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    }
    return streamSymptomPhotoFile(res, row);
  } catch (error) {
    logger.error("Get clinician photo file failed", {
      route: "GET /clinician/photos/:id/file",
      clinicianId: requestWithUser.user.id,
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

export default router;
