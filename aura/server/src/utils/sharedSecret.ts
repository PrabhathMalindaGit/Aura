import { createHash, timingSafeEqual } from "crypto";
import type { NextFunction, Request, Response } from "express";

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

export function hashBucketKey(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hasValidSharedSecret(
  providedValue: string | undefined | null,
  expectedValue: string
): boolean {
  if (!expectedValue || !providedValue) {
    return false;
  }

  const leftDigest = digest(providedValue);
  const rightDigest = digest(expectedValue);
  return timingSafeEqual(leftDigest, rightDigest);
}

type HeaderSecretOptions = {
  expected: string;
  getFailureLogContext: (req: Request, provided: string) => Record<string, unknown>;
  headerName: string;
  logger: {
    warn: (message: string, context?: Record<string, unknown>) => void;
  };
  loggerMessage: string;
};

export function requireHeaderSecret(options: HeaderSecretOptions) {
  return (req: Request, res: Response, next: NextFunction): void | Response => {
    const providedHeader = req.header(options.headerName);
    const provided = typeof providedHeader === "string" ? providedHeader : "";

    if (!hasValidSharedSecret(provided, options.expected)) {
      options.logger.warn(
        options.loggerMessage,
        options.getFailureLogContext(req, provided)
      );

      return res.status(401).json({
        ok: false,
        error: "UNAUTHORIZED",
      });
    }

    next();
  };
}
