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
import type { RequestCorrelationContext } from "../middleware/requestContext";
import { toId } from "../utils/ids";
import { logger } from "../utils/logger";
import {
  dispatchJob,
  enqueueInitialAlertNotification,
  markAlertNotificationEnqueueFailure,
} from "./alertNotificationService";
import { classify } from "./ai";

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

export class DuplicateCheckInError extends Error {
  constructor(message = "A check-in for this patient and date already exists") {
    super(message);
    this.name = "DuplicateCheckInError";
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
  input: CheckInFlowInput,
  requestContext?: RequestCorrelationContext
): Promise<CheckInFlowResult> {
  const bodyMap = normalizeBodyMap(input.bodyMap);
  const symptoms = normalizeSymptomFlags(input.symptoms);
  const existingCheckIn = await CheckIn.exists({
    patientId: input.patientId,
    date: input.date,
  });

  if (existingCheckIn) {
    throw new DuplicateCheckInError();
  }

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
  }, {
    requestId: requestContext?.requestId,
    flow: "checkin",
    patientId: input.patientId,
  });

  const reasonCodes = Array.from(
    new Set<string>([...aiResult.reasons, ...explicitReasonCodes])
  );
  const riskLevel = explicitReasonCodes.length > 0 ? "high" : aiResult.risk;

  // The critical write set is the finalized check-in, plus the alert for high-risk cases.
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
      level: riskLevel,
      reasons: reasonCodes,
    },
  });

  let alertId: string | undefined;
  let n8nDelivered: boolean | undefined;

  if (riskLevel === "high") {
    try {
      const alert = await Alert.create({
        patientId: input.patientId,
        reason: reasonCodes.join(", "),
        source: {
          type: "checkin",
          sourceId: toId(checkin._id),
        },
      });
      alertId = toId(alert._id);
    } catch (error) {
      // Compensating cleanup reduces partial writes here, but this is not true cross-document atomicity.
      try {
        const rollbackResult = await CheckIn.deleteOne({ _id: checkin._id });
        if (rollbackResult.deletedCount !== 1) {
          logger.error("HIGH_SEVERITY_INTEGRITY_ERROR: check-in rollback failed", {
            flow: "checkin",
            stage: "alert_create",
            patientId: input.patientId,
            checkInId: toId(checkin._id),
            originalError: error instanceof Error ? error.message : String(error),
            rollbackError: `deleteOne deleted ${rollbackResult.deletedCount ?? 0} records`,
          });
        }
      } catch (rollbackError) {
        logger.error("HIGH_SEVERITY_INTEGRITY_ERROR: check-in rollback failed", {
          flow: "checkin",
          stage: "alert_create",
          patientId: input.patientId,
          checkInId: toId(checkin._id),
          originalError: error instanceof Error ? error.message : String(error),
          rollbackError:
            rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
        });
      }
      throw error;
    }
  }

  // Ancillary work is post-commit and best-effort so primary safety state stays truthful.
  try {
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
      try {
        await CareEvent.create({
          type: "FOLLOW_THROUGH_TASK_COMPLETED",
          patientId: input.patientId,
          payload: {
            source: "checkin",
            resolvedTaskCount: resolvedReminderTasks.modifiedCount,
            sourceEntityType: "missed_checkin_reminder",
          },
        });
      } catch (error) {
        logger.error("Check-in follow-through care event write failed", {
          flow: "checkin",
          patientId: input.patientId,
          checkInId: toId(checkin._id),
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  } catch (error) {
    logger.error("Check-in reminder task resolution failed", {
      flow: "checkin",
      patientId: input.patientId,
      checkInId: toId(checkin._id),
      message: error instanceof Error ? error.message : String(error),
    });
  }

  if (riskLevel === "high" && alertId) {
    try {
      await CareEvent.create({
        type: "ALERT_CREATED",
        patientId: input.patientId,
        alertId,
        payload: {
          reasons: reasonCodes,
          pain: input.pain,
        },
      });
    } catch (error) {
      logger.error("Check-in alert care event write failed", {
        flow: "checkin",
        patientId: input.patientId,
        checkInId: toId(checkin._id),
        alertId,
        message: error instanceof Error ? error.message : String(error),
      });
    }

    try {
      const notificationJob = await enqueueInitialAlertNotification({
        alert: {
          _id: alertId,
          patientId: input.patientId,
          reason: reasonCodes,
        },
        reasonCodes,
        requestId: requestContext?.requestId,
      });
      n8nDelivered = await dispatchJob(
        toId(notificationJob._id),
        undefined,
        requestContext
      );
      if (!n8nDelivered) {
        logger.error("Check-in alert webhook delivery not confirmed", {
          flow: "checkin",
          patientId: input.patientId,
          checkInId: toId(checkin._id),
          alertId,
        });
      }
    } catch (error) {
      logger.error("HIGH_SEVERITY_DURABILITY_ERROR: alert notification enqueue failed", {
        flow: "checkin",
        patientId: input.patientId,
        checkInId: toId(checkin._id),
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
        logger.error("Check-in enqueue failure care event write failed", {
          flow: "checkin",
          patientId: input.patientId,
          checkInId: toId(checkin._id),
          alertId,
          message:
            careEventError instanceof Error
              ? careEventError.message
              : String(careEventError),
        });
      }
      n8nDelivered = false;
    }

    return {
      checkInId: toId(checkin._id),
      riskLevel: "high",
      reasonCodes,
      alertId,
      n8nDelivered,
    };
  }

  return {
    checkInId: toId(checkin._id),
    riskLevel: "low",
    reasonCodes,
  };
}
