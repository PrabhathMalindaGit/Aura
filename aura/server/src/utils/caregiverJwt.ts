import jwt, { JwtPayload, SignOptions } from "jsonwebtoken";

import { env } from "../env";
import type { AuthenticatedCaregiver } from "../types/caregiverAuth";

type CaregiverTokenClaims = JwtPayload & {
  sub: string;
  tokenType: "caregiver";
  caregiver: true;
  patientId: string;
  inviteId: string;
};

type CaregiverTokenSubject = {
  patientId: string;
  inviteId: string;
};

function getCaregiverSecret(): string | null {
  if (!env.CAREGIVER_JWT_SECRET) {
    return null;
  }

  return env.CAREGIVER_JWT_SECRET;
}

export function hasCaregiverJwtSecretConfigured(): boolean {
  return Boolean(getCaregiverSecret());
}

export function signCaregiverToken(subject: CaregiverTokenSubject): string {
  const secret = getCaregiverSecret();
  if (!secret) {
    throw new Error("Caregiver JWT secret is not configured");
  }

  const options: SignOptions = {
    algorithm: "HS256",
    expiresIn: env.CAREGIVER_TOKEN_TTL as SignOptions["expiresIn"],
    subject: subject.inviteId,
  };

  return jwt.sign(
    {
      tokenType: "caregiver",
      caregiver: true,
      patientId: subject.patientId,
      inviteId: subject.inviteId,
    },
    secret,
    options
  );
}

export function verifyCaregiverToken(token: string): AuthenticatedCaregiver | null {
  const secret = getCaregiverSecret();
  if (!secret) {
    return null;
  }

  try {
    const decoded = jwt.verify(token, secret, {
      algorithms: ["HS256"],
    }) as CaregiverTokenClaims;

    if (
      !decoded ||
      decoded.tokenType !== "caregiver" ||
      decoded.caregiver !== true ||
      typeof decoded.patientId !== "string" ||
      !decoded.patientId.trim() ||
      typeof decoded.inviteId !== "string" ||
      !decoded.inviteId.trim()
    ) {
      return null;
    }

    return {
      patientId: decoded.patientId,
      inviteId: decoded.inviteId,
    };
  } catch {
    return null;
  }
}
