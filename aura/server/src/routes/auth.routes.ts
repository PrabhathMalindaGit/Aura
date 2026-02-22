import { Router } from "express";
import { z } from "zod";

import User from "../models/User";
import { validateBody } from "../middleware/validate";
import { hasJwtSecretConfigured, signAuthToken } from "../utils/jwt";
import { logger } from "../utils/logger";
import { verifyPassword } from "../utils/password";
import { getRequestIp } from "../utils/requestIp";

const router = Router();

const clinicianLoginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

const LOGIN_WINDOW_MS = 60_000;
const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_RETRY_AFTER_SECONDS = 60;
const loginAttempts = new Map<
  string,
  {
    count: number;
    windowStart: number;
  }
>();

function consumeLoginAttempt(ip: string, nowMs: number): { allowed: true } | { allowed: false } {
  const current = loginAttempts.get(ip);
  if (!current || nowMs - current.windowStart >= LOGIN_WINDOW_MS) {
    loginAttempts.set(ip, {
      count: 1,
      windowStart: nowMs,
    });
    return { allowed: true };
  }

  if (current.count >= LOGIN_MAX_ATTEMPTS) {
    return { allowed: false };
  }

  current.count += 1;
  loginAttempts.set(ip, current);
  return { allowed: true };
}

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

    const ip = getRequestIp(req);
    const attempt = consumeLoginAttempt(ip, Date.now());
    if (!attempt.allowed) {
      return res.status(429).json({
        ok: false,
        error: "TOO_MANY_REQUESTS",
        retryAfterSeconds: LOGIN_RETRY_AFTER_SECONDS,
      });
    }

    try {
      const { email, password } = req.body as z.infer<typeof clinicianLoginSchema>;
      const normalizedEmail = email.toLowerCase();

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

export default router;
