import { NextFunction, Request, Response } from "express";

import type { RequestWithPatient } from "../types/patientAuth";
import { verifyPatientToken } from "../utils/patientJwt";

function parseBearerToken(authorization: string): string | null {
  const [scheme, token] = authorization.split(" ");

  if (!scheme || scheme.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token.trim() || null;
}

export function requirePatientAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Response | void {
  const requestWithPatient = req as RequestWithPatient;
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

  const decoded = verifyPatientToken(token);
  if (!decoded) {
    return res.status(401).json({
      ok: false,
      error: "UNAUTHORIZED",
    });
  }

  requestWithPatient.patient = decoded;
  next();
}
