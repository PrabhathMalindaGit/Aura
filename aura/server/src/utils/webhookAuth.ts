import { createHash, timingSafeEqual } from "crypto";
import { NextFunction, Request, Response } from "express";

import { env } from "../env";
import { logger } from "./logger";

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

function safeEqual(left: string, right: string): boolean {
  const leftDigest = digest(left);
  const rightDigest = digest(right);
  return timingSafeEqual(leftDigest, rightDigest);
}

export function requireWebhookKey(req: Request, res: Response, next: NextFunction): void | Response {
  const expected = env.AURA_WEBHOOK_KEY;
  const providedHeader = req.header("x-aura-webhook-key");
  const provided = typeof providedHeader === "string" ? providedHeader : "";

  if (!expected || !provided || !safeEqual(provided, expected)) {
    logger.warn("Webhook authentication failed", {
      route: req.path,
      hasExpectedKey: Boolean(expected),
      hasProvidedKey: Boolean(provided),
    });

    return res.status(401).json({
      ok: false,
      error: "UNAUTHORIZED",
    });
  }

  next();
}
