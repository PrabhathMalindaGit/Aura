import { Router } from "express";
import { z } from "zod";

import User from "../models/User";
import { authenticateJwt } from "../middleware/auth";
import { requireRoles } from "../middleware/rbac";
import { validateBody } from "../middleware/validate";
import { hasJwtSecretConfigured, signAuthToken } from "../utils/jwt";
import { logger } from "../utils/logger";
import { verifyPassword } from "../utils/password";
import { getRequestIp } from "../utils/requestIp";
import { consumeLoginThrottle } from "../services/loginThrottle";
import type { RequestWithUser } from "../types/auth";

const router = Router();

const clinicianLoginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

const LOGIN_WINDOW_MS = 15 * 60_000;
const LOGIN_EMAIL_MAX_ATTEMPTS = 10;
const LOGIN_IP_MAX_ATTEMPTS = 30;

router.post(
  "/auth/clinician/login",
  validateBody(clinicianLoginSchema),
  async (req, res) => {
    if (!hasJwtSecretConfigured()) {
      logger.error("JWT secret missing for clinician login", {
        route: "POST /auth/clinician/login",
      });
      return res.status(500).json({
        ok: false,
        error: "INTERNAL_ERROR",
      });
    }

    const { email, password } = req.body as z.infer<typeof clinicianLoginSchema>;
    const normalizedEmail = email.toLowerCase();
    const ip = getRequestIp(req);
    const attempt = await consumeLoginThrottle({
      scope: "clinician_login",
      buckets: [
        {
          scopeSuffix: "principal",
          key: normalizedEmail,
          limit: LOGIN_EMAIL_MAX_ATTEMPTS,
          windowMs: LOGIN_WINDOW_MS,
        },
        {
          scopeSuffix: "ip",
          key: ip,
          limit: LOGIN_IP_MAX_ATTEMPTS,
          windowMs: LOGIN_WINDOW_MS,
        },
      ],
    });

    if (!attempt.allowed) {
      return res.status(429).json({
        ok: false,
        error: "TOO_MANY_REQUESTS",
        retryAfterSeconds: attempt.retryAfterSeconds,
      });
    }

    try {
      const user = await User.findOne({
        email: normalizedEmail,
      }).lean();

      if (!user) {
        return res.status(401).json({
          ok: false,
          error: "UNAUTHORIZED",
        });
      }

      const validPassword = await verifyPassword(password, user.passwordHash);
      if (!validPassword) {
        return res.status(401).json({
          ok: false,
          error: "UNAUTHORIZED",
        });
      }

      if (user.role !== "clinician" && user.role !== "admin") {
        return res.status(403).json({
          ok: false,
          error: "FORBIDDEN",
        });
      }

      const token = signAuthToken({
        id: String(user._id),
        role: user.role,
        email: user.email,
        name: typeof user.displayName === "string" ? user.displayName : undefined,
        sessionVersion:
          typeof user.sessionVersion === "number" &&
          Number.isInteger(user.sessionVersion) &&
          user.sessionVersion >= 0
            ? user.sessionVersion
            : 0,
      });

      return res.json({
        ok: true,
        token,
        clinician: {
          id: String(user._id),
          email: user.email,
          name: typeof user.displayName === "string" ? user.displayName : null,
          role: user.role,
        },
      });
    } catch (error) {
      logger.error("Clinician login failed", {
        route: "POST /auth/clinician/login",
        message: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({
        ok: false,
        error: "INTERNAL_ERROR",
      });
    }
  }
);

router.get(
  "/auth/clinician/me",
  authenticateJwt(),
  requireRoles(["clinician", "admin"]),
  async (req, res) => {
    const requestWithUser = req as RequestWithUser;
    const user = requestWithUser.user;

    if (!user) {
      return res.status(401).json({
        ok: false,
        error: "UNAUTHORIZED",
      });
    }

    return res.json({
      ok: true,
      clinician: {
        id: user.id,
        email: user.email,
        name: user.name ?? null,
        role: user.role,
      },
    });
  }
);

export default router;
