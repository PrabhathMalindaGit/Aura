import { randomUUID } from "crypto";
import { NextFunction, Request, Response } from "express";

import { logger } from "../utils/logger";

export const REQUEST_ID_HEADER = "x-request-id";
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;
const REQUEST_ID_MAX_LENGTH = 128;

export type RequestCorrelationContext = {
  requestId?: string;
};

declare global {
  namespace Express {
    interface Locals {
      requestId?: string;
    }
  }
}

export function sanitizeRequestId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  if (
    !normalized ||
    normalized.length > REQUEST_ID_MAX_LENGTH ||
    !REQUEST_ID_PATTERN.test(normalized)
  ) {
    return null;
  }

  return normalized;
}

export function getRequestIdFromResponse(res: Response): string | undefined {
  return typeof res.locals.requestId === "string" ? res.locals.requestId : undefined;
}

function resolveRequestId(req: Request): string {
  const headerValue = req.header(REQUEST_ID_HEADER);
  const sanitized = sanitizeRequestId(headerValue);
  return sanitized ?? randomUUID();
}

function resolveRoute(req: Request): string {
  const routePath = req.route?.path;
  if (typeof routePath === "string") {
    return `${req.baseUrl ?? ""}${routePath}` || req.path;
  }

  return req.path || req.originalUrl.split("?")[0] || "/";
}

function shouldSkipCompletionLog(req: Request, route: string): boolean {
  if (req.method.toUpperCase() === "OPTIONS") {
    return true;
  }

  return route === "/health" || route.startsWith("/health/");
}

export function requestContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const requestId = resolveRequestId(req);
  const startedAt = process.hrtime.bigint();

  res.locals.requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);

  res.on("finish", () => {
    const route = resolveRoute(req);
    if (shouldSkipCompletionLog(req, route)) {
      return;
    }

    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    logger.info("http.request.completed", {
      requestId,
      method: req.method,
      route,
      statusCode: res.statusCode,
      durationMs: Number(durationMs.toFixed(2)),
    });
  });

  next();
}
