import CommunicationReview from "../models/CommunicationReview";

export type CommunicationReviewUpsertInput = {
  patientId: string;
  messageId: string;
  needsResponse: boolean;
  flaggedBySafety: boolean;
  followUpRequested: boolean;
  messageCreatedAt?: Date;
  messagePreview?: string;
};

export type CommunicationReviewSummary = {
  patientId: string;
  needsResponseCount: number;
  flaggedBySafetyCount: number;
  latestMessageAt?: Date;
};

function normalizePreview(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  return trimmed.length <= 280 ? trimmed : `${trimmed.slice(0, 277)}...`;
}

export async function upsertCommunicationReview(
  input: CommunicationReviewUpsertInput
) {
  return CommunicationReview.findOneAndUpdate(
    { messageId: input.messageId },
    {
      $set: {
        patientId: input.patientId,
        messageId: input.messageId,
        source: "chat",
        needsResponse: input.needsResponse,
        flaggedBySafety: input.flaggedBySafety,
        followUpRequested: input.followUpRequested,
        messageCreatedAt: input.messageCreatedAt ?? null,
        messagePreview: normalizePreview(input.messagePreview),
      },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }
  );
}

export async function linkTaskToCommunicationReview(
  messageId: string,
  taskId: string
): Promise<void> {
  await CommunicationReview.updateOne(
    { messageId },
    {
      $set: {
        linkedTaskId: taskId,
        followUpRequested: true,
      },
    }
  );
}

export async function resolveCommunicationReview(
  messageId: string,
  reviewedAt: Date = new Date()
): Promise<void> {
  await CommunicationReview.updateOne(
    { messageId },
    {
      $set: {
        needsResponse: false,
        followUpRequested: false,
        lastClinicianReplyAt: reviewedAt,
      },
    }
  );
}

export async function countCommunicationsNeedingResponse(): Promise<number> {
  return CommunicationReview.countDocuments({ needsResponse: true });
}

export async function getCommunicationOverviewCounts(): Promise<{
  needsResponseCount: number;
  flaggedBySafetyCount: number;
  followUpRequestedCount: number;
}> {
  const [needsResponseCount, flaggedBySafetyCount, followUpRequestedCount] =
    await Promise.all([
      CommunicationReview.countDocuments({ needsResponse: true }),
      CommunicationReview.countDocuments({ flaggedBySafety: true }),
      CommunicationReview.countDocuments({ followUpRequested: true }),
    ]);

  return {
    needsResponseCount,
    flaggedBySafetyCount,
    followUpRequestedCount,
  };
}

export async function listRecentCommunicationNeedingResponse(limit = 10) {
  return CommunicationReview.find({ needsResponse: true })
    .sort({ messageCreatedAt: -1, updatedAt: -1 })
    .limit(limit)
    .lean();
}

export async function getCommunicationNeedsResponseSummaryByPatient(
  patientIds?: string[]
): Promise<Map<string, CommunicationReviewSummary>> {
  const match: Record<string, unknown> = {
    needsResponse: true,
  };
  if (Array.isArray(patientIds) && patientIds.length > 0) {
    match.patientId = { $in: patientIds };
  }

  const rows = await CommunicationReview.aggregate<CommunicationReviewSummary>([
    { $match: match },
    {
      $group: {
        _id: "$patientId",
        needsResponseCount: { $sum: 1 },
        flaggedBySafetyCount: {
          $sum: {
            $cond: [{ $eq: ["$flaggedBySafety", true] }, 1, 0],
          },
        },
        latestMessageAt: { $max: "$messageCreatedAt" },
      },
    },
    {
      $project: {
        _id: 0,
        patientId: "$_id",
        needsResponseCount: 1,
        flaggedBySafetyCount: 1,
        latestMessageAt: 1,
      },
    },
  ]);

  return new Map(rows.map((row) => [row.patientId, row]));
}
