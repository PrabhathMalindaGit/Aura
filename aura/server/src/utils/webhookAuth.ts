import { NextFunction, Request, Response } from "express";

import { env } from "../env";
import { logger } from "./logger";
import { requireHeaderSecret } from "./sharedSecret";

export function requireWebhookKey(req: Request, res: Response, next: NextFunction): void | Response {
  return requireHeaderSecret({
    headerName: "x-aura-webhook-key",
    expected: env.AURA_WEBHOOK_KEY,
    logger,
    loggerMessage: "Webhook authentication failed",
    getFailureLogContext: (request, provided) => ({
      route: request.path,
      hasExpectedKey: Boolean(env.AURA_WEBHOOK_KEY),
      hasProvidedKey: Boolean(provided),
    }),
  })(req, res, next);
}
