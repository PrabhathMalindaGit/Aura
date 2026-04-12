import Alert from "../models/Alert";
import CheckIn from "../models/CheckIn";
import Patient from "../models/Patient";
import PromInstance from "../models/PromInstance";
import Task from "../models/Task";
import {
  getDefaultThresholdSnapshot,
} from "./patientThresholdService";
import {
  deriveMissedCheckinsFromThreshold,
  getThresholdsForPatients,
} from "./riskEvaluationService";
import { listAppointmentWorkflowItems } from "./appointmentWorkflowService";
import { getCommunicationTriageSummaryByPatient } from "./communicationTruthService";
import { normalizeRehabPhases, recomputePhaseStatuses } from "./rehabPhaseService";
import type { WorklistRecord } from "../types/worklist";

type WorklistSort =
  | "priority"
  | "updatedAt"
  | "lastCheckinAt"
  | "patientName"
  | "nextAppointmentAt";

export type WorklistFilters = {
  search?: string;
  highRiskOnly?: boolean;
  hasOpenAlerts?: boolean;
  needsResponse?: boolean;
  missedCheckins?: boolean;
  needsPromReview?: boolean;
  assignedToMe?: boolean;
  status?: "active" | "on_hold" | "discharged" | "inactive";
  sort?: WorklistSort;
};

type LatestCheckInRow = {
  _id: string;
  lastCheckinAt?: Date | string;
  lastPainScore?: number;
  latestRiskLevel?: "low" | "high";
  adherenceExercises?: number;
  adherenceMedication?: boolean;
};

type AlertSummaryRow = {
  _id: string;
  openAlertsCount: number;
  latestAlertAt?: Date;
  assignedToMeCount: number;
};

type TaskSummaryRow = {
  _id: string;
  activeTaskCount: number;
  latestTaskUpdatedAt?: Date;
  assignedToMeCount: number;
};

type PromSummaryRow = {
  _id: string;
  dueCount: number;
  overdueCount: number;
  nextDueAt?: Date;
  latestPromUpdatedAt?: Date;
};

type WorklistRecordInternal = WorklistRecord & {
  assignedToMe: boolean;
};

function toDate(value: unknown): Date | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value;
  }
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime())) {
      return parsed;
    }
  }
  return null;
}

function toIso(value: Date | null | undefined): string | undefined {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    return undefined;
  }
  return value.toISOString();
}

function getRehabPhaseLabel(rawPatient: Record<string, unknown>): string | undefined {
  const rehabValue =
    rawPatient.rehab && typeof rawPatient.rehab === "object" && !Array.isArray(rawPatient.rehab)
      ? (rawPatient.rehab as Record<string, unknown>)
      : null;

  const phases = normalizeRehabPhases(rehabValue?.phases);
  if (phases.length === 0) {
    return undefined;
  }

  const timeline = recomputePhaseStatuses(
    phases,
    typeof rehabValue?.currentKey === "string" ? rehabValue.currentKey : null,
    new Date()
  );
  return timeline.phases.find((phase) => phase.status === "current")?.title;
}

function deriveTopIssue(input: {
  openAlertsCount: number;
  communicationNeedsResponse: boolean;
  missedCheckins: { flag: boolean; count: number };
  activeTaskCount: number;
  proms: {
    dueCount: number;
    overdueCount: number;
  };
  appointmentStatus?: string;
  nextAppointmentAt?: string;
}): string | undefined {
  if (input.openAlertsCount > 0) {
    return `${input.openAlertsCount} open safety alert${input.openAlertsCount === 1 ? "" : "s"}`;
  }
  if (input.communicationNeedsResponse) {
    return "Patient message needs clinician follow-up";
  }
  if (input.missedCheckins.flag) {
    return `Missed ${input.missedCheckins.count} recent check-in${input.missedCheckins.count === 1 ? "" : "s"}`;
  }
  if (
    input.appointmentStatus === "missed" ||
    input.appointmentStatus === "reschedule_requested" ||
    input.appointmentStatus === "awaiting_confirmation"
  ) {
    return "Appointment workflow needs review";
  }
  if (input.activeTaskCount > 0) {
    return `${input.activeTaskCount} active follow-up task${input.activeTaskCount === 1 ? "" : "s"}`;
  }
  if (input.nextAppointmentAt) {
    return "Upcoming appointment scheduled";
  }
  if (input.proms.overdueCount > 0) {
    if (input.proms.dueCount === input.proms.overdueCount) {
      return `${input.proms.overdueCount} overdue PROM${input.proms.overdueCount === 1 ? "" : "s"}`;
    }
    return `${input.proms.dueCount} PROMs due (${input.proms.overdueCount} overdue)`;
  }
  if (input.proms.dueCount > 0) {
    return `${input.proms.dueCount} PROM${input.proms.dueCount === 1 ? "" : "s"} due`;
  }
  return undefined;
}

function derivePriorityScore(input: {
  openAlertsCount: number;
  latestRiskLevel: "low" | "high";
  lastPainScore?: number;
  communicationNeedsResponse: boolean;
  missedCheckins: { flag: boolean; count: number };
  activeTaskCount: number;
  proms: {
    dueCount: number;
    overdueCount: number;
  };
  appointmentStatus?: string;
}): number {
  let score = 0;

  score += input.openAlertsCount * 100;
  if (input.latestRiskLevel === "high") {
    score += 40;
  }
  if (typeof input.lastPainScore === "number" && input.lastPainScore >= 7) {
    score += 10;
  }
  if (input.communicationNeedsResponse) {
    score += 35;
  }
  if (input.missedCheckins.flag) {
    score += 25 + input.missedCheckins.count * 5;
  }
  score += input.activeTaskCount * 12;

  if (input.appointmentStatus === "missed") {
    score += 30;
  } else if (input.appointmentStatus === "reschedule_requested") {
    score += 20;
  } else if (input.appointmentStatus === "awaiting_confirmation") {
    score += 12;
  } else if (input.appointmentStatus === "upcoming") {
    score += 4;
  }

  score += input.proms.overdueCount * 2;
  score += Math.max(0, input.proms.dueCount - input.proms.overdueCount);

  return score;
}

function compareWorklistRecords(
  left: WorklistRecordInternal,
  right: WorklistRecordInternal,
  sort: WorklistSort
): number {
  if (sort === "patientName") {
    return left.patientName.localeCompare(right.patientName);
  }

  if (sort === "lastCheckinAt") {
    return Date.parse(right.lastCheckinAt ?? "") - Date.parse(left.lastCheckinAt ?? "");
  }

  if (sort === "nextAppointmentAt") {
    return Date.parse(left.nextAppointmentAt ?? "9999-12-31T00:00:00.000Z") -
      Date.parse(right.nextAppointmentAt ?? "9999-12-31T00:00:00.000Z");
  }

  if (sort === "updatedAt") {
    return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
  }

  return (
    right.priorityScore - left.priorityScore ||
    Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
  );
}

function getLatestDate(dates: Array<Date | null | undefined>): Date {
  const validDates = dates.filter(
    (value): value is Date => value instanceof Date && Number.isFinite(value.getTime())
  );

  if (validDates.length === 0) {
    return new Date(0);
  }

  return validDates.reduce((latest, current) =>
    current.getTime() > latest.getTime() ? current : latest
  );
}

export async function listClinicianWorklist(
  filters: WorklistFilters = {},
  clinicianId?: string
): Promise<WorklistRecord[]> {
  const now = new Date();
  const [
    patients,
    latestCheckins,
    openAlerts,
    openTasks,
    dueProms,
    communicationSummaryMap,
    appointmentItems,
  ] =
    await Promise.all([
      Patient.find({})
        .select({
          patientId: 1,
          displayName: 1,
          status: 1,
          clinicianId: 1,
          rehab: 1,
          createdAt: 1,
          updatedAt: 1,
        })
        .lean(),
      CheckIn.aggregate<LatestCheckInRow>([
        { $sort: { patientId: 1, date: -1, createdAt: -1 } },
        {
          $group: {
            _id: "$patientId",
            lastCheckinAt: { $first: "$date" },
            lastPainScore: { $first: "$pain" },
            latestRiskLevel: { $first: "$risk.level" },
            adherenceExercises: { $first: "$adherence.exercises" },
            adherenceMedication: { $first: "$adherence.medication" },
          },
        },
      ]),
      Alert.aggregate<AlertSummaryRow>([
        { $match: { status: "open" } },
        {
          $group: {
            _id: "$patientId",
            openAlertsCount: { $sum: 1 },
            latestAlertAt: { $max: "$createdAt" },
            assignedToMeCount: {
              $sum: clinicianId
                ? {
                    $cond: [{ $eq: ["$assignedTo", clinicianId] }, 1, 0],
                  }
                : 0,
            },
          },
        },
      ]),
      Task.aggregate<TaskSummaryRow>([
        { $match: { status: { $in: ["open", "in_progress"] } } },
        {
          $group: {
            _id: "$patientId",
            activeTaskCount: { $sum: 1 },
            latestTaskUpdatedAt: { $max: "$updatedAt" },
            assignedToMeCount: {
              $sum: clinicianId
                ? {
                    $cond: [{ $eq: ["$assignedTo", clinicianId] }, 1, 0],
                  }
                : 0,
            },
          },
        },
      ]),
      PromInstance.aggregate<PromSummaryRow>([
        { $match: { status: "due" } },
        {
          $group: {
            _id: "$patientId",
            dueCount: { $sum: 1 },
            overdueCount: {
              $sum: {
                $cond: [{ $lt: ["$dueAt", now] }, 1, 0],
              },
            },
            nextDueAt: { $min: "$dueAt" },
            latestPromUpdatedAt: { $max: "$updatedAt" },
          },
        },
      ]),
      getCommunicationTriageSummaryByPatient(),
      listAppointmentWorkflowItems({
        workflowStatuses: [
          "upcoming",
          "awaiting_confirmation",
          "missed",
          "reschedule_requested",
        ],
      }),
    ]);

  const patientMap = new Map(
    patients.map((patient) => [patient.patientId, patient as Record<string, unknown>])
  );
  const latestCheckinMap = new Map(latestCheckins.map((row) => [row._id, row]));
  const openAlertMap = new Map(openAlerts.map((row) => [row._id, row]));
  const openTaskMap = new Map(openTasks.map((row) => [row._id, row]));
  const duePromMap = new Map(dueProms.map((row) => [row._id, row]));

  const appointmentByPatient = new Map<
    string,
    {
      nextAppointmentAt?: Date;
      appointmentStatus?: string;
      assignedToMe: boolean;
      latestUpdatedAt?: Date;
    }
  >();

  for (const item of appointmentItems) {
    const current = appointmentByPatient.get(item.patientId);
    const nextAppointmentAt =
      !current?.nextAppointmentAt ||
      item.startsAt.getTime() < current.nextAppointmentAt.getTime()
        ? item.startsAt
        : current.nextAppointmentAt;
    const appointmentStatus =
      current?.appointmentStatus === "missed"
        ? current.appointmentStatus
        : item.workflowStatus;
    const latestUpdatedAt = getLatestDate([current?.latestUpdatedAt, item.updatedAt]);
    appointmentByPatient.set(item.patientId, {
      nextAppointmentAt,
      appointmentStatus,
      assignedToMe: (current?.assignedToMe ?? false) || item.clinicianId === clinicianId,
      latestUpdatedAt,
    });
  }

  const patientIds = new Set<string>();
  for (const patient of patients) {
    patientIds.add(patient.patientId);
  }
  for (const row of latestCheckins) {
    patientIds.add(row._id);
  }
  for (const row of openAlerts) {
    patientIds.add(row._id);
  }
  for (const row of openTasks) {
    patientIds.add(row._id);
  }
  for (const row of dueProms) {
    patientIds.add(row._id);
  }
  for (const patientId of communicationSummaryMap.keys()) {
    patientIds.add(patientId);
  }
  for (const item of appointmentItems) {
    patientIds.add(item.patientId);
  }
  const thresholdMap = await getThresholdsForPatients(Array.from(patientIds));

  const rows: WorklistRecordInternal[] = Array.from(patientIds).map((patientId) => {
    const patient = patientMap.get(patientId);
    const latestCheckin = latestCheckinMap.get(patientId);
    const alertSummary = openAlertMap.get(patientId);
    const taskSummary = openTaskMap.get(patientId);
    const promSummary = duePromMap.get(patientId);
    const communicationSummary = communicationSummaryMap.get(patientId);
    const appointmentSummary = appointmentByPatient.get(patientId);

    const patientStatus =
      patient?.status === "on_hold" ||
      patient?.status === "discharged" ||
      patient?.status === "inactive"
        ? patient.status
        : "active";
    const thresholds = thresholdMap.get(patientId);

    const referenceDate =
      toDate(latestCheckin?.lastCheckinAt) ??
      toDate(patient?.updatedAt) ??
      toDate(patient?.createdAt);
    const missedCheckins = deriveMissedCheckinsFromThreshold({
      patientStatus,
      referenceDate,
      now,
      thresholds: thresholds ?? getDefaultThresholdSnapshot(patientId),
    });
    const latestRiskLevel =
      (alertSummary?.openAlertsCount ?? 0) > 0 ||
      latestCheckin?.latestRiskLevel === "high"
        ? "high"
        : "low";
    const nextAppointmentAtIso = toIso(appointmentSummary?.nextAppointmentAt);
    const nextPromDueAtIso = toIso(promSummary?.nextDueAt);
    const topIssue = deriveTopIssue({
      openAlertsCount: alertSummary?.openAlertsCount ?? 0,
      communicationNeedsResponse: (communicationSummary?.needsResponseCount ?? 0) > 0,
      missedCheckins,
      activeTaskCount: taskSummary?.activeTaskCount ?? 0,
      proms: {
        dueCount: promSummary?.dueCount ?? 0,
        overdueCount: promSummary?.overdueCount ?? 0,
      },
      appointmentStatus: appointmentSummary?.appointmentStatus,
      nextAppointmentAt: nextAppointmentAtIso,
    });

    const updatedAt = getLatestDate([
      toDate(patient?.updatedAt),
      toDate(latestCheckin?.lastCheckinAt),
      toDate(alertSummary?.latestAlertAt),
      toDate(taskSummary?.latestTaskUpdatedAt),
      toDate(promSummary?.latestPromUpdatedAt),
      toDate(communicationSummary?.latestMessageAt),
      appointmentSummary?.latestUpdatedAt,
    ]);

    const assignedToMe =
      (typeof patient?.clinicianId === "string" && patient.clinicianId === clinicianId) ||
      (alertSummary?.assignedToMeCount ?? 0) > 0 ||
      (taskSummary?.assignedToMeCount ?? 0) > 0 ||
      Boolean(appointmentSummary?.assignedToMe);

    const row: WorklistRecordInternal = {
      patientId,
      patientName:
        (typeof patient?.displayName === "string" && patient.displayName.trim()) || patientId,
      patientStatus,
      rehabPhase: patient ? getRehabPhaseLabel(patient) : undefined,
      lastCheckinAt: toIso(toDate(latestCheckin?.lastCheckinAt)) ?? undefined,
      openAlertsCount: alertSummary?.openAlertsCount ?? 0,
      latestRiskLevel,
      lastPainScore: latestCheckin?.lastPainScore,
      adherenceSummary: {
        exercisesPct:
          typeof latestCheckin?.adherenceExercises === "number"
            ? Math.round(latestCheckin.adherenceExercises * 100)
            : undefined,
        medicationTaken:
          typeof latestCheckin?.adherenceMedication === "boolean"
            ? latestCheckin.adherenceMedication
            : undefined,
      },
      nextAppointmentAt: nextAppointmentAtIso,
      missedCheckins,
      communicationNeedsResponse: (communicationSummary?.needsResponseCount ?? 0) > 0,
      communicationSummary: communicationSummary
        ? {
            needsResponseCount: communicationSummary.needsResponseCount,
            flaggedBySafetyCount: communicationSummary.flaggedBySafetyCount,
            latestMessageAt: toIso(communicationSummary.latestMessageAt),
            delayedResponse: communicationSummary.responseDelayed,
            responseDelayed: communicationSummary.responseDelayed,
            responseDelayHours: communicationSummary.responseDelayHours,
            responseAgeHours: communicationSummary.responseAgeHours,
            responseDueAt: toIso(communicationSummary.responseDueAt),
            reviewedAfterLatestInbound:
              communicationSummary.reviewedAfterLatestInbound,
            lastReviewedAt: toIso(communicationSummary.lastReviewedAt),
            lastReviewedBy: communicationSummary.lastReviewedBy,
            resolutionKind: communicationSummary.resolutionKind,
          }
        : undefined,
      activeTaskCount: taskSummary?.activeTaskCount ?? 0,
      proms: {
        dueCount: promSummary?.dueCount ?? 0,
        overdueCount: promSummary?.overdueCount ?? 0,
        nextDueAt: nextPromDueAtIso,
      },
      thresholdSummary: thresholds
        ? {
            painHighThreshold: thresholds.painHighThreshold,
            missedCheckinDays: thresholds.missedCheckinDays,
            responseDelayHours: thresholds.responseDelayHours,
            safetyFlaggedResponseDelayHours:
              thresholds.safetyFlaggedResponseDelayHours,
            configured: thresholds.configured,
            updatedAt: thresholds.updatedAt,
            updatedByName: thresholds.updatedBy?.name,
          }
        : undefined,
      topIssue,
      reviewReason: topIssue,
      priorityScore: derivePriorityScore({
        openAlertsCount: alertSummary?.openAlertsCount ?? 0,
        latestRiskLevel,
        lastPainScore: latestCheckin?.lastPainScore,
        communicationNeedsResponse: (communicationSummary?.needsResponseCount ?? 0) > 0,
        missedCheckins,
        activeTaskCount: taskSummary?.activeTaskCount ?? 0,
        proms: {
          dueCount: promSummary?.dueCount ?? 0,
          overdueCount: promSummary?.overdueCount ?? 0,
        },
        appointmentStatus: appointmentSummary?.appointmentStatus,
      }),
      updatedAt: updatedAt.toISOString(),
      assignedToMe,
    };

    return row;
  });

  const normalizedSearch = filters.search?.trim().toLowerCase();
  const sort = filters.sort ?? "priority";

  return rows
    .filter((row) => {
      if (normalizedSearch) {
        const matches =
          row.patientId.toLowerCase().includes(normalizedSearch) ||
          row.patientName.toLowerCase().includes(normalizedSearch);
        if (!matches) {
          return false;
        }
      }
      if (filters.status && row.patientStatus !== filters.status) {
        return false;
      }
      if (filters.highRiskOnly && row.latestRiskLevel !== "high") {
        return false;
      }
      if (filters.hasOpenAlerts && row.openAlertsCount <= 0) {
        return false;
      }
      if (filters.needsResponse && !row.communicationNeedsResponse) {
        return false;
      }
      if (filters.missedCheckins && !row.missedCheckins.flag) {
        return false;
      }
      if (filters.assignedToMe && !row.assignedToMe) {
        return false;
      }
      if (filters.needsPromReview && row.proms.dueCount <= 0) {
        return false;
      }
      return true;
    })
    .sort((left, right) => compareWorklistRecords(left, right, sort))
    .map(({ assignedToMe: _assignedToMe, ...row }) => row);
}
