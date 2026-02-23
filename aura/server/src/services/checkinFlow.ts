import Alert from "../models/Alert";
import CareEvent from "../models/CareEvent";
import CheckIn from "../models/CheckIn";
import { toId } from "../utils/ids";
import { classify } from "./ai";
import { emitAlertCreated } from "./n8n";

export type CheckInFlowInput = {
  patientId: string;
  date: string;
  mood: number;
  pain: number;
  adherence?: {
    exercises?: number;
    medication?: boolean;
  };
  notes?: string;
};

export type CheckInFlowResult = {
  checkInId: string;
  riskLevel: "low" | "high";
  reasonCodes: string[];
  alertId?: string;
  n8nDelivered?: boolean;
};

export async function processCheckIn(
  input: CheckInFlowInput
): Promise<CheckInFlowResult> {
  const checkin = await CheckIn.create({
    patientId: input.patientId,
    date: input.date,
    mood: input.mood,
    pain: input.pain,
    adherence: {
      exercises: input.adherence?.exercises ?? 0,
      medication: input.adherence?.medication ?? false,
    },
    notes: input.notes,
    risk: {
      level: "low",
      reasons: [],
    },
  });

  const aiResult = await classify({
    type: "checkin",
    pain: input.pain,
    text: input.notes || "",
  });

  checkin.risk = {
    level: aiResult.risk,
    reasons: aiResult.reasons,
  };
  await checkin.save();

  if (aiResult.risk === "high") {
    const alert = await Alert.create({
      patientId: input.patientId,
      reason: aiResult.reasons.join(", "),
      source: {
        type: "checkin",
        sourceId: toId(checkin._id),
      },
    });

    await CareEvent.create({
      type: "ALERT_CREATED",
      patientId: input.patientId,
      alertId: toId(alert._id),
      payload: {
        reasons: aiResult.reasons,
        pain: input.pain,
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

    return {
      checkInId: toId(checkin._id),
      riskLevel: "high",
      reasonCodes: aiResult.reasons,
      alertId: toId(alert._id),
      n8nDelivered,
    };
  }

  return {
    checkInId: toId(checkin._id),
    riskLevel: "low",
    reasonCodes: aiResult.reasons,
  };
}
