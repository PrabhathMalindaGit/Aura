import Alert from "../models/Alert";
import CareEvent from "../models/CareEvent";
import ChatMessage from "../models/ChatMessage";
import type { RequestCorrelationContext } from "../middleware/requestContext";
import {
  dispatchJob,
  enqueueInitialAlertNotification,
  markAlertNotificationEnqueueFailure,
} from "./alertNotificationService";
import { recordPatientMessageSentEvent } from "./communicationEventService";
import { upsertCommunicationReview } from "./communicationReviewService";
import { toId } from "../utils/ids";
import { logger } from "../utils/logger";
import { redactText } from "../utils/redact";
import { AIUnavailableError, classify, ragReply } from "./ai";
import { evaluateRiskDecision } from "./riskEvaluationService";

export const HIGH_RISK_REPLY =
  "I'm concerned about your safety. I've alerted your clinician. If you feel in danger, contact local emergency services now.";

export const LOW_RISK_REPLY =
  "Thanks for sharing. I can help you track your rehab and coping strategies. What symptom changed today?";

export type ChatLowRiskMode = "legacy-static" | "rag";

export type ProcessChatInput = {
  patientId: string;
  text: string;
  lowRiskMode: ChatLowRiskMode;
  persistHighRiskAssistantReply: boolean;
};

export type ProcessChatResult = {
  userMessageId: string;
  userCreatedAt: string;
  riskLevel: "low" | "high";
  reasonCodes: string[];
  assistantReply?: string;
  assistantMessageId?: string;
  assistantCreatedAt?: string;
  alertId?: string;
  n8nDelivered?: boolean;
};

export async function processChatMessage(
  input: ProcessChatInput,
  requestContext?: RequestCorrelationContext
): Promise<ProcessChatResult> {
  const aiResult = await classify(
    { type: "chat", text: input.text },
    {
      requestId: requestContext?.requestId,
      flow: "chat",
      patientId: input.patientId,
    }
  );
  const riskDecision = await evaluateRiskDecision({
    patientId: input.patientId,
    aiRisk: aiResult.risk,
    aiReasons: aiResult.reasons,
  });
  let assistantReply: string | undefined;
  if (riskDecision.riskLevel === "low") {
    if (input.lowRiskMode === "rag") {
      try {
        assistantReply = (
          await ragReply(
            {
              patientId: input.patientId,
              message: input.text,
            },
            {
              requestId: requestContext?.requestId,
              flow: "chat",
              patientId: input.patientId,
            }
          )
        ).reply;
      } catch (error) {
        if (!(error instanceof AIUnavailableError)) {
          throw error;
        }

        logger.warn("chat.low_risk_reply_fallback_used", {
          requestId: requestContext?.requestId,
          flow: "chat",
          patientId: input.patientId,
          aiErrorKind: error.kind,
          statusCode: error.statusCode,
        });
        assistantReply = LOW_RISK_REPLY;
      }
    } else {
      assistantReply = LOW_RISK_REPLY;
    }
  }

  // The critical write set is user+assistant for low risk and user+alert for high risk.
  const userMsg = await ChatMessage.create({
    patientId: input.patientId,
    role: "user",
    text: input.text,
    risk: {
      level: riskDecision.riskLevel,
      reasons: riskDecision.reasonCodes,
    },
  });

  if (riskDecision.riskLevel === "high") {
    let alertId: string;
    try {
      const alert = await Alert.create({
        patientId: input.patientId,
        reason: riskDecision.reasonCodes.join(", "),
        source: {
          type: "chat",
          sourceId: toId(userMsg._id),
        },
      });
      alertId = toId(alert._id);
    } catch (error) {
      // Compensating cleanup reduces partial writes here, but this is not true cross-document atomicity.
      try {
        const rollbackResult = await ChatMessage.deleteOne({ _id: userMsg._id });
        if (rollbackResult.deletedCount !== 1) {
          logger.error("HIGH_SEVERITY_INTEGRITY_ERROR: chat rollback failed", {
            flow: "chat",
            stage: "alert_create",
            patientId: input.patientId,
            userMessageId: toId(userMsg._id),
            originalError: error instanceof Error ? error.message : String(error),
            rollbackError: `deleteOne deleted ${rollbackResult.deletedCount ?? 0} records`,
          });
        }
      } catch (rollbackError) {
        logger.error("HIGH_SEVERITY_INTEGRITY_ERROR: chat rollback failed", {
          flow: "chat",
          stage: "alert_create",
          patientId: input.patientId,
          userMessageId: toId(userMsg._id),
          originalError: error instanceof Error ? error.message : String(error),
          rollbackError:
            rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
        });
      }
      throw error;
    }

    let assistantMessageId: string | undefined;
    let assistantCreatedAt: string | undefined;
    let n8nDelivered: boolean | undefined;

    // Ancillary work is post-commit and best-effort so primary safety state stays truthful.
    try {
      await upsertCommunicationReview({
        patientId: input.patientId,
        messageId: toId(userMsg._id),
        needsResponse: true,
        flaggedBySafety: true,
        followUpRequested: true,
        messageCreatedAt: userMsg.createdAt,
        messagePreview: input.text,
      });
    } catch (error) {
      logger.error("Chat communication review upsert failed", {
        flow: "chat",
        stage: "post_commit",
        patientId: input.patientId,
        userMessageId: toId(userMsg._id),
        alertId,
        message: error instanceof Error ? error.message : String(error),
      });
    }

    try {
      await recordPatientMessageSentEvent({
        patientId: input.patientId,
        messageId: toId(userMsg._id),
        createdAt: userMsg.createdAt,
      });
    } catch (error) {
      logger.error("Chat communication event write failed", {
        flow: "chat",
        stage: "post_commit",
        patientId: input.patientId,
        userMessageId: toId(userMsg._id),
        alertId,
        message: error instanceof Error ? error.message : String(error),
      });
    }

    try {
      await CareEvent.create({
        type: "ALERT_CREATED",
        patientId: input.patientId,
        alertId,
        payload: {
          reasons: riskDecision.reasonCodes,
          text: redactText(input.text),
        },
      });
    } catch (error) {
      logger.error("Chat alert care event write failed", {
        flow: "chat",
        patientId: input.patientId,
        userMessageId: toId(userMsg._id),
        alertId,
        message: error instanceof Error ? error.message : String(error),
      });
    }

    try {
      const notificationJob = await enqueueInitialAlertNotification({
        alert: {
          _id: alertId,
          patientId: input.patientId,
          reason: riskDecision.reasonCodes,
        },
        reasonCodes: riskDecision.reasonCodes,
        requestId: requestContext?.requestId,
      });
      n8nDelivered = await dispatchJob(
        toId(notificationJob._id),
        undefined,
        requestContext
      );
      if (!n8nDelivered) {
        logger.error("Chat alert webhook delivery not confirmed", {
          flow: "chat",
          patientId: input.patientId,
          userMessageId: toId(userMsg._id),
          alertId,
        });
      }
    } catch (error) {
      logger.error("HIGH_SEVERITY_DURABILITY_ERROR: alert notification enqueue failed", {
        flow: "chat",
        patientId: input.patientId,
        userMessageId: toId(userMsg._id),
        alertId,
        message: error instanceof Error ? error.message : String(error),
      });
      await markAlertNotificationEnqueueFailure({
        alertId,
        errorCode: "ALERT_NOTIFICATION_ENQUEUE_FAILED",
      });
      try {
        await CareEvent.create({
          type: "NOTIFICATION_FAILED",
          patientId: input.patientId,
          alertId,
          payload: {
            channel: "telegram",
            error: "ALERT_NOTIFICATION_ENQUEUE_FAILED",
          },
        });
      } catch (careEventError) {
        logger.error("Chat enqueue failure care event write failed", {
          flow: "chat",
          patientId: input.patientId,
          userMessageId: toId(userMsg._id),
          alertId,
          message:
            careEventError instanceof Error
              ? careEventError.message
              : String(careEventError),
        });
      }
      n8nDelivered = false;
    }

    if (input.persistHighRiskAssistantReply) {
      try {
        const assistantMsg = await ChatMessage.create({
          patientId: input.patientId,
          role: "assistant",
          text: HIGH_RISK_REPLY,
          risk: {
            level: "high",
            reasons: riskDecision.reasonCodes,
          },
        });
        assistantMessageId = toId(assistantMsg._id);
        assistantCreatedAt = assistantMsg.createdAt.toISOString();
      } catch (error) {
        logger.error("Chat legacy high-risk assistant persistence failed", {
          flow: "chat",
          stage: "post_commit",
          patientId: input.patientId,
          userMessageId: toId(userMsg._id),
          alertId,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      userMessageId: toId(userMsg._id),
      userCreatedAt: userMsg.createdAt.toISOString(),
      riskLevel: "high",
      reasonCodes: riskDecision.reasonCodes,
      assistantReply: input.persistHighRiskAssistantReply
        ? HIGH_RISK_REPLY
        : undefined,
      assistantMessageId,
      assistantCreatedAt,
      alertId,
      n8nDelivered,
    };
  }

  let assistantMsg;
  try {
    assistantMsg = await ChatMessage.create({
      patientId: input.patientId,
      role: "assistant",
      text: assistantReply,
      risk: {
        level: "low",
        reasons: [],
      },
    });
  } catch (error) {
    try {
      const rollbackResult = await ChatMessage.deleteOne({ _id: userMsg._id });
      if (rollbackResult.deletedCount !== 1) {
        logger.error("HIGH_SEVERITY_INTEGRITY_ERROR: chat rollback failed", {
          flow: "chat",
          stage: "assistant_create",
          patientId: input.patientId,
          userMessageId: toId(userMsg._id),
          originalError: error instanceof Error ? error.message : String(error),
          rollbackError: `deleteOne deleted ${rollbackResult.deletedCount ?? 0} records`,
        });
      }
    } catch (rollbackError) {
      logger.error("HIGH_SEVERITY_INTEGRITY_ERROR: chat rollback failed", {
        flow: "chat",
        stage: "assistant_create",
        patientId: input.patientId,
        userMessageId: toId(userMsg._id),
        originalError: error instanceof Error ? error.message : String(error),
        rollbackError:
          rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
      });
    }
    throw error;
  }

  try {
    await upsertCommunicationReview({
      patientId: input.patientId,
      messageId: toId(userMsg._id),
      needsResponse: false,
      flaggedBySafety: false,
      followUpRequested: false,
      messageCreatedAt: userMsg.createdAt,
      messagePreview: input.text,
    });
  } catch (error) {
    logger.error("Chat communication review upsert failed", {
      flow: "chat",
      stage: "post_commit",
      patientId: input.patientId,
      userMessageId: toId(userMsg._id),
      assistantMessageId: toId(assistantMsg._id),
      message: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    await recordPatientMessageSentEvent({
      patientId: input.patientId,
      messageId: toId(userMsg._id),
      createdAt: userMsg.createdAt,
    });
  } catch (error) {
    logger.error("Chat communication event write failed", {
      flow: "chat",
      stage: "post_commit",
      patientId: input.patientId,
      userMessageId: toId(userMsg._id),
      assistantMessageId: toId(assistantMsg._id),
      message: error instanceof Error ? error.message : String(error),
    });
  }

  return {
    userMessageId: toId(userMsg._id),
    userCreatedAt: userMsg.createdAt.toISOString(),
    riskLevel: "low",
    reasonCodes: riskDecision.reasonCodes,
    assistantReply,
    assistantMessageId: toId(assistantMsg._id),
    assistantCreatedAt: assistantMsg.createdAt.toISOString(),
  };
}
