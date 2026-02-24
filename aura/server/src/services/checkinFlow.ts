import Alert from "../models/Alert";
import CareEvent from "../models/CareEvent";
import CheckIn from "../models/CheckIn";
import {
  isBodyMapPainType,
  isBodyMapRegion,
  type BodyMapPainType,
  type BodyMapRegion,
} from "../constants/bodyMap";
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
  sleep?: {
    hours?: number;
    quality?: number;
    disturbances?: number;
  };
  bodyMap?: {
    regions: Array<{
      region: BodyMapRegion;
      intensity: number;
      type: BodyMapPainType;
    }>;
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

export class CheckInValidationError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = "CheckInValidationError";
    this.field = field;
  }
}

function normalizeBodyMap(
  value: CheckInFlowInput["bodyMap"]
): CheckInFlowInput["bodyMap"] | undefined {
  if (!value) {
    return undefined;
  }

  const regions = Array.isArray(value.regions) ? value.regions : [];
  if (regions.length === 0) {
    return undefined;
  }

  if (regions.length > 12) {
    throw new CheckInValidationError(
      "bodyMap.regions",
      "bodyMap.regions must include at most 12 regions"
    );
  }

  const seen = new Set<string>();
  const normalized = regions.map((item, index) => {
    if (!isBodyMapRegion(item.region)) {
      throw new CheckInValidationError(
        `bodyMap.regions.${index}.region`,
        "region must be one of the allowed body map regions"
      );
    }

    if (!Number.isInteger(item.intensity) || item.intensity < 0 || item.intensity > 10) {
      throw new CheckInValidationError(
        `bodyMap.regions.${index}.intensity`,
        "intensity must be an integer between 0 and 10"
      );
    }

    if (!isBodyMapPainType(item.type)) {
      throw new CheckInValidationError(
        `bodyMap.regions.${index}.type`,
        "type must be one of the allowed pain types"
      );
    }

    if (seen.has(item.region)) {
      throw new CheckInValidationError(
        "bodyMap.regions",
        "bodyMap.regions must not contain duplicate regions"
      );
    }
    seen.add(item.region);

    return {
      region: item.region,
      intensity: item.intensity,
      type: item.type,
    };
  });

  return { regions: normalized };
}

export async function processCheckIn(
  input: CheckInFlowInput
): Promise<CheckInFlowResult> {
  const bodyMap = normalizeBodyMap(input.bodyMap);

  const checkin = await CheckIn.create({
    patientId: input.patientId,
    date: input.date,
    mood: input.mood,
    pain: input.pain,
    adherence: {
      exercises: input.adherence?.exercises ?? 0,
      medication: input.adherence?.medication ?? false,
    },
    sleep: input.sleep,
    bodyMap,
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
