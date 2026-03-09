import Alert from "../models/Alert";
import CareEvent from "../models/CareEvent";
import CheckIn from "../models/CheckIn";
import Task from "../models/Task";
import {
  isBodyMapPainType,
  isBodyMapRegion,
  type BodyMapPainType,
  type BodyMapRegion,
} from "../constants/bodyMap";
import {
  isCheckInMedicationStatus,
  isCheckInSymptomFlag,
  type CheckInMedicationStatus,
  type CheckInSymptomFlag,
} from "../constants/checkin";
import { toId } from "../utils/ids";
import { classify } from "./ai";
import { emitAlertCreated } from "./n8n";

export type CheckInFlowInput = {
  patientId: string;
  date: string;
  mood: number;
  pain: number;
  symptoms?: {
    flags?: CheckInSymptomFlag[];
  };
  adherence?: {
    exercises?: number;
    medication?: boolean;
    medicationStatus?: CheckInMedicationStatus;
    medicationReason?: string;
  };
  recovery?: {
    difficultyLevel?: number;
    confidenceLevel?: number;
    mobilityLevel?: number;
  };
  support?: {
    stressLevel?: number;
    feelsSafe?: boolean;
    wantsFollowUp?: boolean;
    wantsExtraSupport?: boolean;
    needsUrgentHelp?: boolean;
  };
  sleep?: {
    hours?: number;
    quality?: number;
    disturbances?: number;
  };
  dailySignals?: {
    hydrationLevel?: number;
    energyLevel?: number;
  };
  bodyMap?: {
    primaryRegion?: BodyMapRegion;
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

  if (value?.primaryRegion) {
    if (!isBodyMapRegion(value.primaryRegion)) {
      throw new CheckInValidationError(
        "bodyMap.primaryRegion",
        "bodyMap.primaryRegion must be one of the allowed body map regions"
      );
    }

    if (!normalized.some((entry) => entry.region === value.primaryRegion)) {
      throw new CheckInValidationError(
        "bodyMap.primaryRegion",
        "bodyMap.primaryRegion must also be included in bodyMap.regions"
      );
    }
  }

  return {
    primaryRegion: value?.primaryRegion,
    regions: normalized,
  };
}

function normalizeSymptomFlags(
  value: CheckInFlowInput["symptoms"]
): CheckInFlowInput["symptoms"] | undefined {
  if (!value?.flags || value.flags.length === 0) {
    return undefined;
  }

  const seen = new Set<string>();
  const flags = value.flags.map((flag, index) => {
    if (!isCheckInSymptomFlag(flag)) {
      throw new CheckInValidationError(
        `symptoms.flags.${index}`,
        "symptoms.flags must only include allowed values"
      );
    }
    if (seen.has(flag)) {
      throw new CheckInValidationError(
        "symptoms.flags",
        "symptoms.flags must not contain duplicate values"
      );
    }
    seen.add(flag);
    return flag;
  });

  return flags.length > 0 ? { flags } : undefined;
}

export async function processCheckIn(
  input: CheckInFlowInput
): Promise<CheckInFlowResult> {
  const bodyMap = normalizeBodyMap(input.bodyMap);
  const symptoms = normalizeSymptomFlags(input.symptoms);

  const checkin = await CheckIn.create({
    patientId: input.patientId,
    date: input.date,
    mood: input.mood,
    pain: input.pain,
    symptoms,
    adherence: {
      exercises: input.adherence?.exercises ?? 0,
      medication: input.adherence?.medication ?? false,
      medicationStatus:
        input.adherence?.medicationStatus &&
        isCheckInMedicationStatus(input.adherence.medicationStatus)
          ? input.adherence.medicationStatus
          : undefined,
      medicationReason: input.adherence?.medicationReason,
    },
    recovery: input.recovery,
    sleep: input.sleep,
    support: input.support,
    dailySignals: input.dailySignals,
    bodyMap,
    notes: input.notes,
    risk: {
      level: "low",
      reasons: [],
    },
  });

  const explicitReasonCodes = [
    input.support?.needsUrgentHelp ? "URGENT_HELP_REQUESTED" : null,
    input.support?.feelsSafe === false ? "PATIENT_UNSAFE" : null,
  ].filter((value): value is string => Boolean(value));

  const classificationText = [
    input.notes || "",
    input.support?.needsUrgentHelp ? "Patient says they need urgent help." : "",
    input.support?.feelsSafe === false ? "Patient says they do not feel safe." : "",
    input.support?.wantsFollowUp ? "Patient requested clinician follow-up." : "",
  ]
    .filter(Boolean)
    .join(" ");

  const aiResult = await classify({
    type: "checkin",
    pain: input.pain,
    text: classificationText,
  });

  const reasonCodes = Array.from(
    new Set<string>([...aiResult.reasons, ...explicitReasonCodes])
  );
  const riskLevel = explicitReasonCodes.length > 0 ? "high" : aiResult.risk;

  checkin.risk = {
    level: riskLevel,
    reasons: reasonCodes,
  };
  await checkin.save();

  const resolvedReminderTasks = await Task.updateMany(
    {
      patientId: input.patientId,
      status: { $in: ["open", "in_progress"] },
      "source.entityType": "missed_checkin_reminder",
    },
    {
      $set: {
        status: "completed",
        completedAt: new Date(),
        cancelledAt: null,
      },
    }
  );

  if (resolvedReminderTasks.modifiedCount > 0) {
    await CareEvent.create({
      type: "FOLLOW_THROUGH_TASK_COMPLETED",
      patientId: input.patientId,
      payload: {
        source: "checkin",
        resolvedTaskCount: resolvedReminderTasks.modifiedCount,
        sourceEntityType: "missed_checkin_reminder",
      },
    });
  }

  if (riskLevel === "high") {
    const alert = await Alert.create({
      patientId: input.patientId,
      reason: reasonCodes.join(", "),
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
        reasons: reasonCodes,
        pain: input.pain,
      },
    });

    const n8nDelivered = await emitAlertCreated({
      type: "ALERT_CREATED",
      patientId: input.patientId,
      alertId: toId(alert._id),
      risk: "high",
      reason: reasonCodes,
      timestamp: new Date().toISOString(),
    });

    return {
      checkInId: toId(checkin._id),
      riskLevel: "high",
      reasonCodes,
      alertId: toId(alert._id),
      n8nDelivered,
    };
  }

  return {
    checkInId: toId(checkin._id),
    riskLevel: "low",
    reasonCodes,
  };
}
