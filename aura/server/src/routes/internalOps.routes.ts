import { Router } from "express";

import { buildOpsSummary } from "../services/opsSummaryService";
import { logger } from "../utils/logger";
import { requireWebhookKey } from "../utils/webhookAuth";

const router = Router();

router.get("/internal/ops/summary", requireWebhookKey, async (_req, res) => {
  try {
    const summary = await buildOpsSummary();

    logger.info("internal.ops.summary.generated", {
      requestId: res.locals.requestId,
      queued: summary.notificationPipeline.queued,
      awaitingCallback: summary.notificationPipeline.awaitingCallback,
      awaitingCallbackPastDeadline:
        summary.notificationPipeline.awaitingCallbackPastDeadline,
      retryScheduled: summary.notificationPipeline.retryScheduled,
      reconciliationNeeded: summary.notificationPipeline.reconciliationNeeded,
      failed: summary.notificationPipeline.failed,
    });

    return res.json({
      ok: true,
      generatedAt: summary.generatedAt,
      notificationPipeline: summary.notificationPipeline,
    });
  } catch (error) {
    logger.error("internal.ops.summary.failed", {
      requestId: res.locals.requestId,
      route: "GET /internal/ops/summary",
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({
      ok: false,
      error: "INTERNAL_ERROR",
    });
  }
});

export default router;
