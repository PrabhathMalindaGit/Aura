import AsyncStorage from "@react-native-async-storage/async-storage";

import type { AppointmentRequestItem, AppointmentSlot } from "@/src/api/appointments";

type StoredSlotsCache = {
  cachedAt: number;
  slots: AppointmentSlot[];
};

type StoredRequestsCache = {
  cachedAt: number;
  requests: AppointmentRequestItem[];
};

const SLOTS_PREFIX = "aura:appointmentsSlotsCache:v1:";
const REQUESTS_PREFIX = "aura:appointmentsRequestsCache:v1:";

function slotsKey(patientId: string): string {
  return `${SLOTS_PREFIX}${patientId}`;
}

function requestsKey(patientId: string): string {
  return `${REQUESTS_PREFIX}${patientId}`;
}

function normalizeSlots(value: unknown): StoredSlotsCache | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as {
    cachedAt?: unknown;
    slots?: unknown;
  };
  if (
    typeof record.cachedAt !== "number" ||
    !Number.isFinite(record.cachedAt) ||
    !Array.isArray(record.slots)
  ) {
    return null;
  }

  const slots = record.slots
    .filter((item): item is AppointmentSlot => {
      if (!item || typeof item !== "object") {
        return false;
      }
      const row = item as {
        slotId?: unknown;
        startsAt?: unknown;
        endsAt?: unknown;
        modality?: unknown;
      };
      return (
        typeof row.slotId === "string" &&
        typeof row.startsAt === "string" &&
        typeof row.endsAt === "string" &&
        (row.modality === "video" || row.modality === undefined)
      );
    })
    .sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt));

  return {
    cachedAt: record.cachedAt,
    slots,
  };
}

function normalizeRequests(value: unknown): StoredRequestsCache | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as {
    cachedAt?: unknown;
    requests?: unknown;
  };
  if (
    typeof record.cachedAt !== "number" ||
    !Number.isFinite(record.cachedAt) ||
    !Array.isArray(record.requests)
  ) {
    return null;
  }
  const requests = record.requests
    .filter((item): item is AppointmentRequestItem => {
      if (!item || typeof item !== "object") {
        return false;
      }
      const row = item as {
        requestId?: unknown;
        slotId?: unknown;
        status?: unknown;
        workflowStatus?: unknown;
        startsAt?: unknown;
        endsAt?: unknown;
        createdAt?: unknown;
      };
      return (
        typeof row.requestId === "string" &&
        typeof row.slotId === "string" &&
        typeof row.startsAt === "string" &&
        typeof row.endsAt === "string" &&
        typeof row.createdAt === "string" &&
        (row.workflowStatus === undefined ||
          row.workflowStatus === "upcoming" ||
          row.workflowStatus === "awaiting_confirmation" ||
          row.workflowStatus === "completed" ||
          row.workflowStatus === "missed" ||
          row.workflowStatus === "reschedule_requested") &&
        (row.status === "pending" ||
          row.status === "approved" ||
          row.status === "rejected" ||
          row.status === "canceled")
      );
    })
    .sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt));

  return {
    cachedAt: record.cachedAt,
    requests,
  };
}

export async function getCachedAppointmentSlots(
  patientId: string
): Promise<StoredSlotsCache | null> {
  if (!patientId.trim()) {
    return null;
  }
  try {
    const raw = await AsyncStorage.getItem(slotsKey(patientId));
    if (!raw) {
      return null;
    }
    return normalizeSlots(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function setCachedAppointmentSlots(
  patientId: string,
  slots: AppointmentSlot[]
): Promise<void> {
  if (!patientId.trim()) {
    return;
  }
  const payload: StoredSlotsCache = {
    cachedAt: Date.now(),
    slots,
  };
  await AsyncStorage.setItem(slotsKey(patientId), JSON.stringify(payload));
}

export async function clearCachedAppointmentSlots(patientId: string): Promise<void> {
  if (!patientId.trim()) {
    return;
  }
  await AsyncStorage.removeItem(slotsKey(patientId));
}

export async function getCachedAppointmentRequests(
  patientId: string
): Promise<StoredRequestsCache | null> {
  if (!patientId.trim()) {
    return null;
  }
  try {
    const raw = await AsyncStorage.getItem(requestsKey(patientId));
    if (!raw) {
      return null;
    }
    return normalizeRequests(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function setCachedAppointmentRequests(
  patientId: string,
  requests: AppointmentRequestItem[]
): Promise<void> {
  if (!patientId.trim()) {
    return;
  }
  const payload: StoredRequestsCache = {
    cachedAt: Date.now(),
    requests,
  };
  await AsyncStorage.setItem(requestsKey(patientId), JSON.stringify(payload));
}

export async function clearCachedAppointmentRequests(patientId: string): Promise<void> {
  if (!patientId.trim()) {
    return;
  }
  await AsyncStorage.removeItem(requestsKey(patientId));
}
