import jwt, { JwtPayload, SignOptions } from "jsonwebtoken";

import { env } from "../env";
import type { AuthenticatedPatient } from "../types/patientAuth";

type PatientTokenClaims = JwtPayload & {
  sub: string;
  tokenType: "patient";
  displayName?: string;
};

type PatientTokenSubject = {
  id: string;
  displayName?: string;
};

function getPatientSecret(): string | null {
  if (!env.PATIENT_JWT_SECRET) {
    return null;
  }

  return env.PATIENT_JWT_SECRET;
}

export function hasPatientJwtSecretConfigured(): boolean {
  return Boolean(getPatientSecret());
}

export function signPatientToken(subject: PatientTokenSubject): string {
  const secret = getPatientSecret();
  if (!secret) {
    throw new Error("Patient JWT secret is not configured");
  }

  const options: SignOptions = {
    algorithm: "HS256",
    expiresIn: env.PATIENT_TOKEN_TTL as SignOptions["expiresIn"],
    subject: subject.id,
  };

  return jwt.sign(
    {
      tokenType: "patient",
      displayName: subject.displayName,
    },
    secret,
    options
  );
}

export function verifyPatientToken(token: string): AuthenticatedPatient | null {
  const secret = getPatientSecret();
  if (!secret) {
    return null;
  }

  try {
    const decoded = jwt.verify(token, secret, {
      algorithms: ["HS256"],
    }) as PatientTokenClaims;

    if (
      !decoded ||
      decoded.tokenType !== "patient" ||
      typeof decoded.sub !== "string" ||
      !decoded.sub.trim()
    ) {
      return null;
    }

    return {
      id: decoded.sub,
      displayName:
        typeof decoded.displayName === "string"
          ? decoded.displayName
          : undefined,
    };
  } catch (_error) {
    return null;
  }
}
