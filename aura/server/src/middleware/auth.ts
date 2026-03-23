import { isValidObjectId } from "mongoose";
import { NextFunction, Request, Response } from "express";

import User from "../models/User";
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

  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<Response | void> => {
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
    if (decoded.role === "clinician" || decoded.role === "admin") {
      if (!isValidObjectId(decoded.id)) {
        logger.warn("JWT authentication rejected invalid clinician id", {
          route: req.path,
          userId: decoded.id,
        });

        return res.status(401).json({
          ok: false,
          error: "UNAUTHORIZED",
        });
      }

      try {
        const user = await User.findById(decoded.id).lean();
        if (!user) {
          logger.warn("JWT authentication rejected missing clinician user", {
            route: req.path,
            userId: decoded.id,
          });

          return res.status(401).json({
            ok: false,
            error: "UNAUTHORIZED",
          });
        }

        const liveSessionVersion =
          typeof user.sessionVersion === "number" &&
          Number.isInteger(user.sessionVersion) &&
          user.sessionVersion >= 0
            ? user.sessionVersion
            : 0;

        if (decoded.sessionVersion !== liveSessionVersion) {
          logger.warn("JWT authentication rejected stale clinician session", {
            route: req.path,
            userId: decoded.id,
            tokenSessionVersion: decoded.sessionVersion,
            liveSessionVersion,
          });

          return res.status(401).json({
            ok: false,
            error: "UNAUTHORIZED",
          });
        }

        requestWithUser.user = {
          id: String(user._id),
          role:
            user.role === "admin" || user.role === "clinician" || user.role === "patient"
              ? user.role
              : decoded.role,
          email: typeof user.email === "string" ? user.email : decoded.email,
          name:
            typeof user.displayName === "string" && user.displayName.trim()
              ? user.displayName
              : decoded.name,
          sessionVersion: liveSessionVersion,
        };
      } catch (error) {
        logger.error("JWT live clinician authentication failed", {
          route: req.path,
          userId: decoded.id,
          message: error instanceof Error ? error.message : String(error),
        });

        return res.status(500).json({
          ok: false,
          error: "INTERNAL_ERROR",
        });
      }
    }

    next();
  };
}
