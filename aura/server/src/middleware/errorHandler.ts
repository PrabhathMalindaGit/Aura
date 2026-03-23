import { NextFunction, Request, Response } from "express";

import { getRequestIdFromResponse } from "./requestContext";
import { logger } from "../utils/logger";

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): Response {
  const routePath = req.route?.path;
  const route =
    typeof routePath === "string"
      ? `${req.baseUrl ?? ""}${routePath}` || req.path
      : req.path;

  logger.error("Unhandled middleware error", {
    requestId: getRequestIdFromResponse(res),
    method: req.method,
    route,
    statusCode: res.statusCode >= 400 ? res.statusCode : 500,
    message: err instanceof Error ? err.message : String(err),
  });

  return res.status(500).json({
    ok: false,
    error: "INTERNAL_ERROR",
    message: "An unexpected error occurred",
  });
}
