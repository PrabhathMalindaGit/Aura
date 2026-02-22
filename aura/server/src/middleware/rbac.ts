import { NextFunction, Request, Response } from "express";

import type { RequestWithUser, UserRole } from "../types/auth";

type RoleOptions = {
  allowMissingAuth?: boolean;
};

export function requireRoles(allowedRoles: UserRole[], options: RoleOptions = {}) {
  const allowMissingAuth = options.allowMissingAuth ?? false;
  const allowed = new Set<UserRole>(allowedRoles);

  return (req: Request, res: Response, next: NextFunction): Response | void => {
    const requestWithUser = req as RequestWithUser;
    const user = requestWithUser.user;

    if (!user) {
      if (allowMissingAuth) {
        return next();
      }

      return res.status(401).json({
        ok: false,
        error: "UNAUTHORIZED",
      });
    }

    if (!allowed.has(user.role)) {
      return res.status(403).json({
        ok: false,
        error: "FORBIDDEN",
      });
    }

    next();
  };
}
