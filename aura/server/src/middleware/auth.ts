import { NextFunction, Request, Response } from "express";

import type { RequestWithUser } from "../types/auth";
import { logger } from "../utils/logger";
import { verifyAuthToken } from "../utils/jwt";

type AuthOptions = {
  allowMissingAuth?: boolean;
};

function parseBearerToken(authorization: string): string | null {
  const [scheme, token] = authorization.split(" ");

  if (!scheme || scheme.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token.trim() || null;
}

export function authenticateJwt(options: AuthOptions = {}) {
  const allowMissingAuth = options.allowMissingAuth ?? false;

  return (req: Request, res: Response, next: NextFunction): Response | void => {
    const requestWithUser = req as RequestWithUser;
    const authorization = req.header("authorization");

    if (!authorization) {
      if (allowMissingAuth) {
        requestWithUser.user = undefined;
        return next();
      }

      return res.status(401).json({
        ok: false,
        error: "UNAUTHORIZED",
      });
    }

    const token = parseBearerToken(authorization);
    if (!token) {
      return res.status(401).json({
        ok: false,
        error: "UNAUTHORIZED",
      });
    }

    const decoded = verifyAuthToken(token);
    if (!decoded) {
      logger.warn("JWT authentication failed", {
        route: req.path,
      });

      return res.status(401).json({
        ok: false,
        error: "UNAUTHORIZED",
      });
    }

    requestWithUser.user = decoded;
    next();
  };
}
