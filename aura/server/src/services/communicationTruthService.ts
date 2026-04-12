import { Types } from "mongoose";

import ChatMessage from "../models/ChatMessage";
import CommunicationReview from "../models/CommunicationReview";
import type { CommunicationResolutionKind } from "../models/CommunicationReview";
import {
  getDefaultThresholdSnapshot,
  getPatientThresholdConfigMap,
  type PatientThresholdSnapshot,
} from "./patientThresholdService";
import { deriveResponseDelayState } from "./riskEvaluationService";
import {
  buildCommunicationThreadKey,
} from "./communicationEventService";

export type PatientCommunicationSummaryState =
  | "care_team_reviewing"
  | "response_delayed";

export type CommunicationReviewerSnapshot = {
  clinicianId: string;
  displayName?: string;
};

export type CommunicationReviewTruthState = {
  reviewedAfterLatestInbound: boolean;
  lastReviewedAt?: Date;
  lastReviewedBy?: CommunicationReviewerSnapshot;
  responseDueAt?: Date;
  responseDelayed: boolean;
  responseDelayHours?: number;
  responseAgeHours?: number;
  resolutionKind?: CommunicationResolutionKind;
  patientCommunicationSummary: PatientCommunicationSummaryState | null;
};

export type CommunicationTriageSummary = {
  patientId: string;
  threadKey: string;
  channel: "patient_chat";
  needsResponseCount: number;
  flaggedBySafetyCount: number;
  latestMessageAt?: Date;
  latestMessageId?: string;
  followUpRequested: boolean;
  linkedTaskId?: string;
  reviewedAfterLatestInbound: boolean;
  lastReviewedAt?: Date;
  lastReviewedBy?: CommunicationReviewerSnapshot;
  responseDueAt?: Date;
  responseDelayed: boolean;
  responseDelayHours?: number;
  responseAgeHours?: number;
  resolutionKind?: CommunicationResolutionKind;
  patientCommunicationSummary: PatientCommunicationSummaryState | null;
};

type CommunicationReviewRow = {
  patientId?: unknown;
  messageId?: unknown;
  needsResponse?: unknown;
  flaggedBySafety?: unknown;
  followUpRequested?: unknown;
  linkedTaskId?: unknown;
  messageCreatedAt?: unknown;
  lastReviewedAt?: unknown;
  lastReviewedBy?: unknown;
  resolutionKind?: unknown;
  resolvedAt?: unknown;
};

function toTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function toDate(value: unknown): Date | undefined {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value;
  }

  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime())) {
      return parsed;
    }
  }

  return undefined;
}

function toReviewerSnapshot(
  value: unknown
): CommunicationReviewerSnapshot | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const clinicianId = toTrimmedString(record.clinicianId);
  if (!clinicianId) {
    return undefined;
  }

  return {
    clinicianId,
    displayName: toTrimmedString(record.displayName),
  };
}

function toResolutionKind(value: unknown): CommunicationResolutionKind | undefined {
  return value === "no_follow_up_needed" ? value : undefined;
}

function mapReviewTruthRow(row: CommunicationReviewRow): {
  patientId: string;
  messageId?: string;
  needsResponse: boolean;
  flaggedBySafety: boolean;
  followUpRequested: boolean;
  linkedTaskId?: string;
  messageCreatedAt?: Date;
  lastReviewedAt?: Date;
  lastReviewedBy?: CommunicationReviewerSnapshot;
  resolutionKind?: CommunicationResolutionKind;
  resolvedAt?: Date;
} | null {
  const patientId = toTrimmedString(row.patientId);
  if (!patientId) {
    return null;
  }

  return {
    patientId,
    messageId: toTrimmedString(row.messageId),
    needsResponse: row.needsResponse === true,
    flaggedBySafety: row.flaggedBySafety === true,
    followUpRequested: row.followUpRequested === true,
    linkedTaskId: toTrimmedString(row.linkedTaskId),
    messageCreatedAt: toDate(row.messageCreatedAt),
    lastReviewedAt: toDate(row.lastReviewedAt),
    lastReviewedBy: toReviewerSnapshot(row.lastReviewedBy),
    resolutionKind: toResolutionKind(row.resolutionKind),
    resolvedAt: toDate(row.resolvedAt),
  };
}

function getResponseDueAt(
  messageCreatedAt: Date | undefined,
  thresholdHours: number | undefined
): Date | undefined {
  if (!messageCreatedAt || typeof thresholdHours !== "number") {
    return undefined;
  }

  return new Date(messageCreatedAt.getTime() + thresholdHours * 60 * 60 * 1000);
}

export function deriveCommunicationReviewTruthState(input: {
  review: {
    needsResponse: boolean;
    flaggedBySafety: boolean;
    messageCreatedAt?: Date;
    lastReviewedAt?: Date;
    lastReviewedBy?: CommunicationReviewerSnapshot;
    resolutionKind?: CommunicationResolutionKind;
    resolvedAt?: Date;
  };
  thresholds: PatientThresholdSnapshot;
  now?: Date;
}): CommunicationReviewTruthState {
  const now = input.now ?? new Date();
  const messageCreatedAt = input.review.messageCreatedAt;
  const lastReviewedAt = input.review.lastReviewedAt;
  const hasUnresolvedResponse =
    input.review.needsResponse && !(input.review.resolvedAt instanceof Date);
  const reviewedAfterLatestInbound =
    hasUnresolvedResponse &&
    Boolean(
      messageCreatedAt &&
        lastReviewedAt &&
        lastReviewedAt.getTime() >= messageCreatedAt.getTime()
    );

  const responseState =
    hasUnresolvedResponse && messageCreatedAt
      ? deriveResponseDelayState({
          messageCreatedAt,
          flaggedBySafety: input.review.flaggedBySafety,
          now,
          thresholds: input.thresholds,
        })
      : undefined;

  const responseDueAt = getResponseDueAt(
    messageCreatedAt,
    responseState?.thresholdHours
  );
  const responseDelayed = responseState?.delayed === true;

  return {
    reviewedAfterLatestInbound,
    lastReviewedAt,
    lastReviewedBy: input.review.lastReviewedBy,
    responseDueAt,
    responseDelayed,
    responseDelayHours: responseState?.thresholdHours,
    responseAgeHours: responseState?.elapsedHours,
    resolutionKind: input.review.resolutionKind,
    patientCommunicationSummary: hasUnresolvedResponse
      ? responseDelayed
        ? "response_delayed"
        : reviewedAfterLatestInbound
          ? "care_team_reviewing"
          : null
      : null,
  };
}

export async function getCommunicationTriageSummaryByPatient(
  patientIds?: string[]
): Promise<Map<string, CommunicationTriageSummary>> {
  const normalizedPatientIds = Array.isArray(patientIds)
    ? Array.from(new Set(patientIds.map((value) => value.trim()).filter(Boolean)))
    : [];
  const query =
    normalizedPatientIds.length > 0
      ? { patientId: { $in: normalizedPatientIds } }
      : {};
  const rows = await CommunicationReview.find(query)
    .sort({ messageCreatedAt: -1, updatedAt: -1 })
    .lean();

  const mappedRows = rows
    .map((row) => mapReviewTruthRow(row as CommunicationReviewRow))
    .filter(
      (
        row
      ): row is NonNullable<ReturnType<typeof mapReviewTruthRow>> => Boolean(row)
    );

  if (mappedRows.length === 0) {
    return new Map();
  }

  const grouped = new Map<
    string,
    Array<NonNullable<ReturnType<typeof mapReviewTruthRow>>>
  >();
  for (const row of mappedRows) {
    const current = grouped.get(row.patientId);
    if (current) {
      current.push(row);
    } else {
      grouped.set(row.patientId, [row]);
    }
  }

  const thresholdMap = await getPatientThresholdConfigMap([...grouped.keys()]);
  const now = new Date();
  const summaries = new Map<string, CommunicationTriageSummary>();

  for (const [patientId, patientRows] of grouped.entries()) {
    const sortedRows = [...patientRows].sort((left, right) => {
      const leftTs =
        left.messageCreatedAt?.getTime() ??
        left.lastReviewedAt?.getTime() ??
        0;
      const rightTs =
        right.messageCreatedAt?.getTime() ??
        right.lastReviewedAt?.getTime() ??
        0;
      return rightTs - leftTs;
    });
    const latestRow = sortedRows[0];
    const openRows = sortedRows.filter(
      (row) => row.needsResponse && !row.resolvedAt
    );
    const latestOpenRow = openRows[0];
    const reviewForTruth = latestOpenRow ?? latestRow;
    const thresholds =
      thresholdMap.get(patientId) ?? getDefaultThresholdSnapshot(patientId);
    const truthState = deriveCommunicationReviewTruthState({
      review: {
        needsResponse: reviewForTruth.needsResponse,
        flaggedBySafety: reviewForTruth.flaggedBySafety,
        messageCreatedAt: reviewForTruth.messageCreatedAt,
        lastReviewedAt: reviewForTruth.lastReviewedAt,
        lastReviewedBy: reviewForTruth.lastReviewedBy,
        resolutionKind: reviewForTruth.resolutionKind,
        resolvedAt: reviewForTruth.resolvedAt,
      },
      thresholds,
      now,
    });

    summaries.set(patientId, {
      patientId,
      threadKey: buildCommunicationThreadKey(patientId),
      channel: "patient_chat",
      needsResponseCount: openRows.length,
      flaggedBySafetyCount: openRows.filter((row) => row.flaggedBySafety).length,
      latestMessageAt: latestOpenRow?.messageCreatedAt ?? latestRow.messageCreatedAt,
      latestMessageId: latestOpenRow?.messageId ?? latestRow.messageId,
      followUpRequested: openRows.some((row) => row.followUpRequested),
      linkedTaskId: latestOpenRow?.linkedTaskId ?? reviewForTruth.linkedTaskId,
      reviewedAfterLatestInbound: truthState.reviewedAfterLatestInbound,
      lastReviewedAt: truthState.lastReviewedAt,
      lastReviewedBy: truthState.lastReviewedBy,
      responseDueAt: truthState.responseDueAt,
      responseDelayed: truthState.responseDelayed,
      responseDelayHours: truthState.responseDelayHours,
      responseAgeHours: truthState.responseAgeHours,
      resolutionKind: latestRow.resolutionKind,
      patientCommunicationSummary: truthState.patientCommunicationSummary,
    });
  }

  return summaries;
}

export async function getPatientCommunicationSummary(
  patientId: string
): Promise<PatientCommunicationSummaryState | null> {
  const summary = (
    await getCommunicationTriageSummaryByPatient([patientId])
  ).get(patientId.trim());

  return summary?.patientCommunicationSummary ?? null;
}

export async function getTrustedPatientMessageContext(input: {
  patientId: string;
  messageId?: string;
}): Promise<{
  messageId: string;
  createdAt?: Date;
} | null> {
  const patientId = input.patientId.trim();
  const messageId = toTrimmedString(input.messageId);
  if (!patientId || !messageId || !Types.ObjectId.isValid(messageId)) {
    return null;
  }

  const message = await ChatMessage.findOne({
    _id: messageId,
    patientId,
    role: "user",
  })
    .select({ _id: 1, createdAt: 1 })
    .lean();

  if (!message) {
    const review = await CommunicationReview.findOne({
      patientId,
      messageId,
    })
      .select({ messageId: 1, messageCreatedAt: 1 })
      .lean();

    if (!review) {
      return null;
    }

    return {
      messageId: toTrimmedString(review.messageId) ?? messageId,
      createdAt: toDate(review.messageCreatedAt),
    };
  }

  return {
    messageId: String(message._id),
    createdAt: toDate(message.createdAt),
  };
}
