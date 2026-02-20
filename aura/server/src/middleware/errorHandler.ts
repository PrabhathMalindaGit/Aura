import { NextFunction, Request, Response } from "express";

import { logger } from "../utils/logger";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): Response {
  logger.error("Unhandled middleware error", {
    message: err instanceof Error ? err.message : String(err),
  });

  return res.status(500).json({
    ok: false,
    error: "INTERNAL_ERROR",
    message: "An unexpected error occurred",
  });
}
