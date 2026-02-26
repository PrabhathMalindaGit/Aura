import AppointmentRequest from "../models/AppointmentRequest";
import AppointmentSlot from "../models/AppointmentSlot";

const MAX_NOTE_LENGTH = 280;
const MIN_LEAD_TIME_MS = 2 * 60 * 60 * 1000;
const MIN_DURATION_MINUTES = 15;
const MAX_DURATION_MINUTES = 120;

export class AppointmentServiceError extends Error {
  code: string;
  status: number;

  constructor(code: string, status: number, message: string) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function serviceError(
  code: string,
  status: number,
  message: string
): AppointmentServiceError {
  return new AppointmentServiceError(code, status, message);
}

function safeNote(note: string | undefined): string | undefined {
  if (!note) {
    return undefined;
  }
  const trimmed = note.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.slice(0, MAX_NOTE_LENGTH);
}

export function validateSlotDuration(startsAt: Date, endsAt: Date): void {
  const startMs = startsAt.getTime();
  const endMs = endsAt.getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    throw serviceError("VALIDATION_ERROR", 400, "startsAt and endsAt must be valid ISO datetimes.");
  }
  if (endMs <= startMs) {
    throw serviceError("VALIDATION_ERROR", 400, "endsAt must be after startsAt.");
  }
  const durationMinutes = (endMs - startMs) / 60_000;
  if (durationMinutes < MIN_DURATION_MINUTES || durationMinutes > MAX_DURATION_MINUTES) {
    throw serviceError(
      "VALIDATION_ERROR",
      400,
      `slot duration must be between ${MIN_DURATION_MINUTES} and ${MAX_DURATION_MINUTES} minutes.`
    );
  }
}

type CreateRequestInput = {
  slotId: string;
  patientId: string;
  note?: string;
  now?: Date;
};

export async function createAppointmentRequest({
  slotId,
  patientId,
  note,
  now = new Date(),
}: CreateRequestInput) {
  const slot = await AppointmentSlot.findById(slotId).lean();
  if (!slot) {
    throw serviceError("NOT_FOUND", 404, "Slot not found.");
  }

  if (slot.status !== "available") {
    throw serviceError("SLOT_UNAVAILABLE", 409, "Slot is no longer available.");
  }

  if (slot.startsAt.getTime() - now.getTime() < MIN_LEAD_TIME_MS) {
    throw serviceError(
      "LEAD_TIME_VIOLATION",
      400,
      "Slots must be requested at least 2 hours in advance."
    );
  }

  try {
    const created = await AppointmentRequest.create({
      slotId: slot._id,
      patientId,
      status: "pending",
      note: safeNote(note),
    });
    return created;
  } catch (error) {
    const maybeCode =
      typeof error === "object" && error !== null && "code" in error
        ? (error as { code?: unknown }).code
        : null;
    if (maybeCode === 11000) {
      throw serviceError("REQUEST_EXISTS", 409, "You already requested this slot.");
    }
    throw error;
  }
}

type ReviewInput = {
  requestId: string;
  clinicianId: string;
  clinicianName?: string;
  allowAnyClinician?: boolean;
  now?: Date;
};

async function loadRequestAndSlotOrThrow(requestId: string) {
  const request = await AppointmentRequest.findById(requestId);
  if (!request) {
    throw serviceError("NOT_FOUND", 404, "Appointment request not found.");
  }
  const slot = await AppointmentSlot.findById(request.slotId);
  if (!slot) {
    throw serviceError("NOT_FOUND", 404, "Appointment slot not found.");
  }
  return { request, slot };
}

function assertClinicianCanReview(
  slotClinicianId: string,
  clinicianId: string,
  allowAnyClinician: boolean
): void {
  if (allowAnyClinician) {
    return;
  }
  if (slotClinicianId !== clinicianId) {
    throw serviceError("FORBIDDEN", 403, "You cannot review requests for another clinician.");
  }
}

export async function approveAppointmentRequest({
  requestId,
  clinicianId,
  clinicianName,
  allowAnyClinician = false,
  now = new Date(),
}: ReviewInput) {
  const { request, slot } = await loadRequestAndSlotOrThrow(requestId);
  assertClinicianCanReview(slot.clinicianId, clinicianId, allowAnyClinician);

  if (request.status !== "pending") {
    throw serviceError("INVALID_STATE", 409, "Only pending requests can be approved.");
  }

  const closedSlot = await AppointmentSlot.findOneAndUpdate(
    { _id: slot._id, status: "available" },
    { $set: { status: "closed" } },
    { new: true }
  );
  if (!closedSlot) {
    throw serviceError("SLOT_UNAVAILABLE", 409, "Slot is no longer available.");
  }

  const approved = await AppointmentRequest.findOneAndUpdate(
    { _id: request._id, status: "pending" },
    {
      $set: {
        status: "approved",
        reviewedAt: now,
        reviewedBy: {
          clinicianId,
          name: clinicianName,
        },
      },
    },
    { new: true }
  );

  if (!approved) {
    await AppointmentSlot.updateOne(
      { _id: slot._id, status: "closed" },
      { $set: { status: "available" } }
    );
    throw serviceError("INVALID_STATE", 409, "Request is no longer pending.");
  }

  await AppointmentRequest.updateMany(
    {
      slotId: slot._id,
      _id: { $ne: approved._id },
      status: "pending",
    },
    {
      $set: {
        status: "rejected",
        reviewedAt: now,
        reviewedBy: {
          clinicianId,
          name: clinicianName,
        },
      },
    }
  );

  return approved;
}

export async function rejectAppointmentRequest({
  requestId,
  clinicianId,
  clinicianName,
  allowAnyClinician = false,
  now = new Date(),
}: ReviewInput) {
  const { request, slot } = await loadRequestAndSlotOrThrow(requestId);
  assertClinicianCanReview(slot.clinicianId, clinicianId, allowAnyClinician);

  if (request.status !== "pending") {
    throw serviceError("INVALID_STATE", 409, "Only pending requests can be rejected.");
  }

  const rejected = await AppointmentRequest.findOneAndUpdate(
    { _id: request._id, status: "pending" },
    {
      $set: {
        status: "rejected",
        reviewedAt: now,
        reviewedBy: {
          clinicianId,
          name: clinicianName,
        },
      },
    },
    { new: true }
  );

  if (!rejected) {
    throw serviceError("INVALID_STATE", 409, "Request is no longer pending.");
  }

  return rejected;
}

type CancelInput = {
  requestId: string;
  patientId: string;
  now?: Date;
};

export async function cancelAppointmentRequestByPatient({
  requestId,
  patientId,
  now = new Date(),
}: CancelInput) {
  const request = await AppointmentRequest.findOne({ _id: requestId, patientId });
  if (!request) {
    throw serviceError("NOT_FOUND", 404, "Appointment request not found.");
  }

  if (request.status !== "pending" && request.status !== "approved") {
    throw serviceError("INVALID_STATE", 409, "Only pending or approved requests can be canceled.");
  }

  const previousStatus = request.status;
  request.status = "canceled";
  await request.save();

  if (previousStatus === "approved") {
    const slot = await AppointmentSlot.findById(request.slotId);
    if (slot && slot.startsAt.getTime() > now.getTime() && slot.status === "closed") {
      slot.status = "available";
      await slot.save();
    }
  }

  return request;
}
