import Alert from "../models/Alert";
import CareEvent from "../models/CareEvent";
import ChatMessage from "../models/ChatMessage";
import { upsertCommunicationReview } from "./communicationReviewService";
import { toId } from "../utils/ids";
import { redactText } from "../utils/redact";
import { classify, ragReply } from "./ai";
import { emitAlertCreated } from "./n8n";

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
  input: ProcessChatInput
): Promise<ProcessChatResult> {
  const userMsg = await ChatMessage.create({
    patientId: input.patientId,
    role: "user",
    text: input.text,
    risk: {
      level: "low",
      reasons: [],
    },
  });

  const aiResult = await classify({ type: "chat", text: input.text });

  userMsg.risk = {
    level: aiResult.risk,
    reasons: aiResult.reasons,
  };
  await userMsg.save();

  await upsertCommunicationReview({
    patientId: input.patientId,
    messageId: toId(userMsg._id),
    needsResponse: aiResult.risk === "high",
    flaggedBySafety: aiResult.risk === "high",
    followUpRequested: aiResult.risk === "high",
    messageCreatedAt: userMsg.createdAt,
    messagePreview: input.text,
  });

  if (aiResult.risk === "high") {
    const alert = await Alert.create({
      patientId: input.patientId,
      reason: aiResult.reasons.join(", "),
      source: {
        type: "chat",
        sourceId: toId(userMsg._id),
      },
    });

    await CareEvent.create({
      type: "ALERT_CREATED",
      patientId: input.patientId,
      alertId: toId(alert._id),
      payload: {
        reasons: aiResult.reasons,
        text: redactText(input.text),
      },
    });

    const n8nDelivered = await emitAlertCreated({
      type: "ALERT_CREATED",
      patientId: input.patientId,
      alertId: toId(alert._id),
      risk: "high",
      reason: aiResult.reasons,
      timestamp: new Date().toISOString(),
    });

    let assistantMessageId: string | undefined;
    let assistantCreatedAt: string | undefined;

    if (input.persistHighRiskAssistantReply) {
      const assistantMsg = await ChatMessage.create({
        patientId: input.patientId,
        role: "assistant",
        text: HIGH_RISK_REPLY,
        risk: {
          level: "high",
          reasons: aiResult.reasons,
        },
      });
      assistantMessageId = toId(assistantMsg._id);
      assistantCreatedAt = assistantMsg.createdAt.toISOString();
    }

    return {
      userMessageId: toId(userMsg._id),
      userCreatedAt: userMsg.createdAt.toISOString(),
      riskLevel: "high",
      reasonCodes: aiResult.reasons,
      assistantReply: input.persistHighRiskAssistantReply
        ? HIGH_RISK_REPLY
        : undefined,
      assistantMessageId,
      assistantCreatedAt,
      alertId: toId(alert._id),
      n8nDelivered,
    };
  }

  const assistantReply =
    input.lowRiskMode === "rag"
      ? (await ragReply({
          patientId: input.patientId,
          message: input.text,
        })).reply
      : LOW_RISK_REPLY;

  const assistantMsg = await ChatMessage.create({
    patientId: input.patientId,
    role: "assistant",
    text: assistantReply,
    risk: {
      level: "low",
      reasons: [],
    },
  });

  return {
    userMessageId: toId(userMsg._id),
    userCreatedAt: userMsg.createdAt.toISOString(),
    riskLevel: "low",
    reasonCodes: aiResult.reasons,
    assistantReply,
    assistantMessageId: toId(assistantMsg._id),
    assistantCreatedAt: assistantMsg.createdAt.toISOString(),
  };
}
