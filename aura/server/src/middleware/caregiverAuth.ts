import { NextFunction, Request, Response } from "express";

import { getValidatedCaregiverInvite } from "../services/caregiverAccessService";
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
): void {
  const requestWithCaregiver = req as RequestWithCaregiver;
  const authorization = req.header("authorization");

  if (!authorization) {
    res.status(401).json({
      ok: false,
      error: "UNAUTHORIZED",
    });
    return;
  }

  const token = parseBearerToken(authorization);
  if (!token) {
    res.status(401).json({
      ok: false,
      error: "UNAUTHORIZED",
    });
    return;
  }

  const decoded = verifyCaregiverToken(token);
  if (!decoded) {
    res.status(401).json({
      ok: false,
      error: "UNAUTHORIZED",
    });
    return;
  }

  void (async () => {
    const invite = await getValidatedCaregiverInvite(decoded);
    if (!invite) {
      res.status(401).json({
        ok: false,
        error: "UNAUTHORIZED",
      });
      return;
    }

    requestWithCaregiver.caregiver = decoded;
    next();
  })().catch(() => {
    res.status(401).json({
      ok: false,
      error: "UNAUTHORIZED",
    });
  });
}
