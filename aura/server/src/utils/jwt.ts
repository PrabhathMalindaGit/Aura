import jwt, { JwtPayload, SignOptions } from "jsonwebtoken";

import { env } from "../env";
import type { AuthUser, UserRole } from "../types/auth";

type AuthTokenClaims = JwtPayload & {
  sub: string;
  role: UserRole;
  email: string;
  name?: string;
};

type TokenSubject = {
  id: string;
  role: UserRole;
  email: string;
  name?: string;
};

const AUTH_TOKEN_TTL = "8h";

function getJwtSecret(): string | null {
  if (!env.JWT_SECRET) {
    return null;
  }
  return env.JWT_SECRET;
}

export function hasJwtSecretConfigured(): boolean {
  return Boolean(getJwtSecret());
}

export function signAuthToken(subject: TokenSubject): string {
  const secret = getJwtSecret();
  if (!secret) {
    throw new Error("JWT secret is not configured");
  }

  const payload = {
    role: subject.role,
    email: subject.email,
    name: subject.name,
  };

  const options: SignOptions = {
    algorithm: "HS256",
    expiresIn: AUTH_TOKEN_TTL,
    subject: subject.id,
  };

  return jwt.sign(payload, secret, options);
}

export function verifyAuthToken(token: string): AuthUser | null {
  const secret = getJwtSecret();
  if (!secret) {
    return null;
  }

  try {
    const decoded = jwt.verify(token, secret, {
      algorithms: ["HS256"],
    }) as AuthTokenClaims;

    if (
      !decoded ||
      typeof decoded.sub !== "string" ||
      (decoded.role !== "clinician" &&
        decoded.role !== "admin" &&
        decoded.role !== "patient") ||
      typeof decoded.email !== "string"
    ) {
      return null;
    }

    return {
      id: decoded.sub,
      role: decoded.role,
      email: decoded.email,
      name: typeof decoded.name === "string" ? decoded.name : undefined,
    };
  } catch (_error) {
    return null;
  }
}
