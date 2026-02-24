import fs from "node:fs/promises";
import path from "node:path";

import multer from "multer";

const DEFAULT_UPLOADS_DIR = "./uploads";
const DEFAULT_MAX_PHOTO_MB = 5;

const MIME_TO_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/webp": "webp",
};

export type SymptomPhotoMimeType = keyof typeof MIME_TO_EXTENSION;

type StorageConfig = {
  uploadsDir: string;
  symptomPhotosDir: string;
  maxPhotoMb: number;
  maxPhotoBytes: number;
};

function toInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function toAbsoluteDir(value: string): string {
  return path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);
}

function getStorageConfig(): StorageConfig {
  const uploadsDir = process.env.UPLOADS_DIR || DEFAULT_UPLOADS_DIR;
  const symptomPhotosDir =
    process.env.SYMPTOM_PHOTOS_DIR || path.join(uploadsDir, "symptoms");
  const maxPhotoMb = toInt(process.env.MAX_PHOTO_MB, DEFAULT_MAX_PHOTO_MB);
  return {
    uploadsDir: toAbsoluteDir(uploadsDir),
    symptomPhotosDir: toAbsoluteDir(symptomPhotosDir),
    maxPhotoMb,
    maxPhotoBytes: maxPhotoMb * 1024 * 1024,
  };
}

function sanitizeOriginalName(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const basename = path.basename(value).trim();
  if (!basename) {
    return undefined;
  }
  return basename.replace(/[^\w.\-]+/g, "_").slice(0, 180);
}

export class SymptomPhotoUploadValidationError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "SymptomPhotoUploadValidationError";
    this.statusCode = statusCode;
  }
}

export function createSymptomPhotoUploadMiddleware() {
  return multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: getSymptomPhotoMaxBytes(),
      files: 1,
    },
  }).single("file");
}

export function getSymptomPhotosDir(): string {
  return getStorageConfig().symptomPhotosDir;
}

export function getSymptomPhotoMaxBytes(): number {
  return getStorageConfig().maxPhotoBytes;
}

export function isAllowedSymptomPhotoMimeType(value: string): value is SymptomPhotoMimeType {
  return Object.prototype.hasOwnProperty.call(MIME_TO_EXTENSION, value);
}

export function getSymptomPhotoExtension(mimeType: string): string {
  if (!isAllowedSymptomPhotoMimeType(mimeType)) {
    throw new SymptomPhotoUploadValidationError("Unsupported image type.");
  }
  return MIME_TO_EXTENSION[mimeType];
}

export function validateSymptomPhotoFile(
  file: Express.Multer.File | undefined
): {
  mimeType: SymptomPhotoMimeType;
  extension: string;
  sizeBytes: number;
  originalName?: string;
} {
  if (!file) {
    throw new SymptomPhotoUploadValidationError("Photo file is required.");
  }

  if (!isAllowedSymptomPhotoMimeType(file.mimetype)) {
    throw new SymptomPhotoUploadValidationError("Only JPEG, PNG, HEIC, HEIF, or WEBP images are allowed.");
  }

  const maxPhotoBytes = getSymptomPhotoMaxBytes();
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > maxPhotoBytes) {
    const maxMb = getStorageConfig().maxPhotoMb;
    throw new SymptomPhotoUploadValidationError(
      `Image must be greater than 0 bytes and at most ${maxMb}MB.`
    );
  }

  if (!file.buffer || !(file.buffer instanceof Buffer) || file.buffer.length === 0) {
    throw new SymptomPhotoUploadValidationError("Uploaded image data is empty.");
  }

  return {
    mimeType: file.mimetype,
    extension: getSymptomPhotoExtension(file.mimetype),
    sizeBytes: file.size,
    originalName: sanitizeOriginalName(file.originalname),
  };
}

export async function ensureSymptomPhotosDir(): Promise<void> {
  const config = getStorageConfig();
  await fs.mkdir(config.uploadsDir, { recursive: true });
  await fs.mkdir(config.symptomPhotosDir, { recursive: true });
}

export function resolveSymptomPhotoPath(storageKey: string): string {
  return path.join(getStorageConfig().symptomPhotosDir, storageKey);
}

export async function writeSymptomPhotoFile(
  storageKey: string,
  buffer: Buffer
): Promise<void> {
  await ensureSymptomPhotosDir();
  await fs.writeFile(resolveSymptomPhotoPath(storageKey), buffer);
}

export async function removeSymptomPhotoFile(storageKey: string): Promise<void> {
  try {
    await fs.unlink(resolveSymptomPhotoPath(storageKey));
  } catch {
    // best-effort cleanup
  }
}
