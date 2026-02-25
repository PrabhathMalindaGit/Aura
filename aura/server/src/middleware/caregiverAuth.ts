import { NextFunction, Request, Response } from "express";

import type { RequestWithCaregiver } from "../types/caregiverAuth";
import { verifyCaregiverToken } from "../utils/caregiverJwt";

function parseBearerToken(authorization: string): string | null {
  const [scheme, token] = authorization.split(" ");
  if (!scheme || scheme.toLowerCase() !== "bearer" || !token) {
    return null;
  }
  return token.trim() || null;
}

export function requireCaregiverAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Response | void {
  const requestWithCaregiver = req as RequestWithCaregiver;
  const authorization = req.header("authorization");

  if (!authorization) {
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

  const decoded = verifyCaregiverToken(token);
  if (!decoded) {
    return res.status(401).json({
      ok: false,
      error: "UNAUTHORIZED",
    });
  }

  requestWithCaregiver.caregiver = decoded;
  next();
}
