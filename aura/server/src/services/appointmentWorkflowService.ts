import AppointmentRequest from "../models/AppointmentRequest";
import AppointmentSlot from "../models/AppointmentSlot";

export const APPOINTMENT_WORKFLOW_STATUS_VALUES = [
  "upcoming",
  "awaiting_confirmation",
  "completed",
  "missed",
  "reschedule_requested",
] as const;

export type AppointmentWorkflowStatus =
  (typeof APPOINTMENT_WORKFLOW_STATUS_VALUES)[number];

export type AppointmentWorkflowItem = {
  requestId: string;
  slotId: string;
  patientId: string;
  clinicianId: string;
  startsAt: Date;
  endsAt: Date;
  requestStatus: "pending" | "approved" | "rejected" | "canceled";
  slotStatus: "available" | "closed";
  workflowStatus: AppointmentWorkflowStatus;
  note?: string;
  modality: "video";
  meetingLink?: string;
  reviewedAt?: Date | null;
  createdAt?: Date | null;
  updatedAt?: Date | null;
};

type ListAppointmentWorkflowOptions = {
  clinicianId?: string;
  patientId?: string;
  from?: Date;
  to?: Date;
  workflowStatuses?: AppointmentWorkflowStatus[];
  limit?: number;
};

function safeDate(value: unknown): Date | null {
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

function toNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isRescheduleRequested(note: string | undefined): boolean {
  if (!note) {
    return false;
  }
  return /resched/i.test(note);
}

export function deriveAppointmentWorkflowStatus(input: {
  startsAt: Date;
  endsAt: Date;
  requestStatus: "pending" | "approved" | "rejected" | "canceled";
  note?: string;
  now?: Date;
}): AppointmentWorkflowStatus {
  const now = input.now ?? new Date();
  const endsAtMs = input.endsAt.getTime();
  const startsAtMs = input.startsAt.getTime();

  if (isRescheduleRequested(input.note)) {
    return "reschedule_requested";
  }

  if (input.requestStatus === "approved") {
    return endsAtMs < now.getTime() ? "completed" : "upcoming";
  }

  if (input.requestStatus === "pending") {
    return endsAtMs < now.getTime() ? "missed" : "awaiting_confirmation";
  }

  if (input.requestStatus === "canceled") {
    return startsAtMs >= now.getTime() ? "reschedule_requested" : "missed";
  }

  return endsAtMs < now.getTime() ? "missed" : "awaiting_confirmation";
}

export async function listAppointmentWorkflowItems(
  options: ListAppointmentWorkflowOptions = {}
): Promise<AppointmentWorkflowItem[]> {
  const slotFilter: Record<string, unknown> = {};
  if (options.clinicianId) {
    slotFilter.clinicianId = options.clinicianId;
  }

  const startsAtFilter: Record<string, Date> = {};
  if (options.from) {
    startsAtFilter.$gte = options.from;
  }
  if (options.to) {
    startsAtFilter.$lte = options.to;
  }
  if (Object.keys(startsAtFilter).length > 0) {
    slotFilter.startsAt = startsAtFilter;
  }

  const slots = await AppointmentSlot.find(slotFilter)
    .select({
      clinicianId: 1,
      startsAt: 1,
      endsAt: 1,
      meetingLink: 1,
      modality: 1,
      status: 1,
      updatedAt: 1,
    })
    .lean();

  if (slots.length === 0) {
    return [];
  }

  const slotIds = slots.map((slot) => slot._id);
  const requestFilter: Record<string, unknown> = {
    slotId: { $in: slotIds },
  };
  if (options.patientId) {
    requestFilter.patientId = options.patientId;
  }

  const requests = await AppointmentRequest.find(requestFilter)
    .sort({ createdAt: -1 })
    .limit(options.limit ?? 500)
    .lean();

  const slotById = new Map(slots.map((slot) => [String(slot._id), slot]));
  const now = new Date();

  const items = requests
    .map((request) => {
      const slot = slotById.get(String(request.slotId));
      const startsAt = safeDate(slot?.startsAt);
      const endsAt = safeDate(slot?.endsAt);
      if (!slot || !startsAt || !endsAt) {
        return null;
      }

      const workflowStatus = deriveAppointmentWorkflowStatus({
        startsAt,
        endsAt,
        requestStatus:
          request.status === "approved" ||
          request.status === "rejected" ||
          request.status === "canceled"
            ? request.status
            : "pending",
        note: toNonEmptyString(request.note),
        now,
      });

      return {
        requestId: String(request._id),
        slotId: String(request.slotId),
        patientId: request.patientId,
        clinicianId: slot.clinicianId,
        startsAt,
        endsAt,
        requestStatus:
          request.status === "approved" ||
          request.status === "rejected" ||
          request.status === "canceled"
            ? request.status
            : "pending",
        slotStatus: slot.status === "closed" ? "closed" : "available",
        workflowStatus,
        note: toNonEmptyString(request.note),
        modality: slot.modality === "video" ? "video" : "video",
        meetingLink: toNonEmptyString(slot.meetingLink),
        reviewedAt: safeDate(request.reviewedAt),
        createdAt: safeDate(request.createdAt),
        updatedAt: safeDate(request.updatedAt) ?? safeDate(slot.updatedAt),
      } satisfies AppointmentWorkflowItem;
    })
    .filter(Boolean) as AppointmentWorkflowItem[];

  const filtered = Array.isArray(options.workflowStatuses) && options.workflowStatuses.length > 0
    ? items.filter((item) => options.workflowStatuses?.includes(item.workflowStatus))
    : items;

  return filtered.sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime());
}
