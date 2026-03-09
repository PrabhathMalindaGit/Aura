import { apiFetchJson } from "@/src/api/client";

export type AppointmentSlot = {
  slotId: string;
  clinicianName?: string;
  startsAt: string;
  endsAt: string;
  modality: "video";
};

export type AppointmentRequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "canceled";

export type AppointmentWorkflowStatus =
  | "upcoming"
  | "awaiting_confirmation"
  | "completed"
  | "missed"
  | "reschedule_requested";

export type AppointmentRequestItem = {
  requestId: string;
  slotId: string;
  status: AppointmentRequestStatus;
  workflowStatus?: AppointmentWorkflowStatus;
  startsAt: string;
  endsAt: string;
  modality: "video";
  meetingLink?: string;
  reviewedAt?: string;
  createdAt: string;
};

export type CreateAppointmentRequestPayload = {
  slotId: string;
  note?: string;
};

function toTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeSlot(value: unknown): AppointmentSlot | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as {
    slotId?: unknown;
    clinicianName?: unknown;
    startsAt?: unknown;
    endsAt?: unknown;
    modality?: unknown;
  };
  const slotId = toTrimmedString(record.slotId);
  const startsAt = toTrimmedString(record.startsAt);
  const endsAt = toTrimmedString(record.endsAt);
  if (!slotId || !startsAt || !endsAt) {
    return null;
  }
  return {
    slotId,
    clinicianName: toTrimmedString(record.clinicianName) ?? undefined,
    startsAt,
    endsAt,
    modality: record.modality === "video" ? "video" : "video",
  };
}

function normalizeRequest(value: unknown): AppointmentRequestItem | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as {
    requestId?: unknown;
    slotId?: unknown;
    status?: unknown;
    workflowStatus?: unknown;
    startsAt?: unknown;
    endsAt?: unknown;
    modality?: unknown;
    meetingLink?: unknown;
    reviewedAt?: unknown;
    createdAt?: unknown;
  };
  const requestId = toTrimmedString(record.requestId);
  const slotId = toTrimmedString(record.slotId);
  const startsAt = toTrimmedString(record.startsAt);
  const endsAt = toTrimmedString(record.endsAt);
  const createdAt = toTrimmedString(record.createdAt);
  const status =
    record.status === "pending" ||
    record.status === "approved" ||
    record.status === "rejected" ||
    record.status === "canceled"
      ? record.status
      : null;
  const workflowStatus =
    record.workflowStatus === "upcoming" ||
    record.workflowStatus === "awaiting_confirmation" ||
    record.workflowStatus === "completed" ||
    record.workflowStatus === "missed" ||
    record.workflowStatus === "reschedule_requested"
      ? record.workflowStatus
      : undefined;
  if (!requestId || !slotId || !startsAt || !endsAt || !createdAt || !status) {
    return null;
  }
  return {
    requestId,
    slotId,
    status,
    workflowStatus,
    startsAt,
    endsAt,
    modality: record.modality === "video" ? "video" : "video",
    meetingLink: toTrimmedString(record.meetingLink) ?? undefined,
    reviewedAt: toTrimmedString(record.reviewedAt) ?? undefined,
    createdAt,
  };
}

export async function listAvailableSlots(
  token: string,
  params: {
    from?: string;
    to?: string;
    limit?: number;
  } = {}
): Promise<AppointmentSlot[]> {
  const query = new URLSearchParams();
  if (params.from) {
    query.set("from", params.from);
  }
  if (params.to) {
    query.set("to", params.to);
  }
  if (typeof params.limit === "number" && Number.isFinite(params.limit)) {
    query.set("limit", String(Math.max(1, Math.trunc(params.limit))));
  }

  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  const payload = await apiFetchJson<{ items?: unknown }>(
    `/patient/appointments/slots${suffix}`,
    {
      method: "GET",
      token,
    }
  );

  const items = Array.isArray(payload?.items) ? payload.items : [];
  return items
    .map((item) => normalizeSlot(item))
    .filter((item): item is AppointmentSlot => Boolean(item));
}

export async function createAppointmentRequest(
  token: string,
  payload: CreateAppointmentRequestPayload
): Promise<{
  requestId: string;
  status: AppointmentRequestStatus;
}> {
  const response = await apiFetchJson<{
    requestId?: unknown;
    status?: unknown;
  }>("/patient/appointments/requests", {
    method: "POST",
    token,
    body: payload,
  });

  const requestId = toTrimmedString(response.requestId);
  const status =
    response.status === "pending" ||
    response.status === "approved" ||
    response.status === "rejected" ||
    response.status === "canceled"
      ? response.status
      : null;
  if (!requestId || !status) {
    throw {
      title: "Unexpected response",
      message: "Could not parse appointment request response.",
      kind: "unknown",
      retryable: false,
    };
  }
  return {
    requestId,
    status,
  };
}

export async function listMyRequests(
  token: string,
  status?: AppointmentRequestStatus
): Promise<AppointmentRequestItem[]> {
  const query = new URLSearchParams();
  if (status) {
    query.set("status", status);
  }
  query.set("limit", "100");
  const payload = await apiFetchJson<{ items?: unknown }>(
    `/patient/appointments/requests?${query.toString()}`,
    {
      method: "GET",
      token,
    }
  );
  const items = Array.isArray(payload?.items) ? payload.items : [];
  return items
    .map((item) => normalizeRequest(item))
    .filter((item): item is AppointmentRequestItem => Boolean(item));
}

export async function cancelMyRequest(
  token: string,
  requestId: string
): Promise<AppointmentRequestItem> {
  const payload = await apiFetchJson<{ item?: unknown }>(
    `/patient/appointments/requests/${encodeURIComponent(requestId)}/cancel`,
    {
      method: "POST",
      token,
    }
  );
  const item = normalizeRequest(payload.item);
  if (!item) {
    throw {
      title: "Unexpected response",
      message: "Could not parse canceled appointment response.",
      kind: "unknown",
      retryable: false,
    };
  }
  return item;
}
