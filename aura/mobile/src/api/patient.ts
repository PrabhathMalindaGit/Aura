import { apiFetchJson, type ApiError } from "@/src/api/client";
import type { Patient, Risk } from "@/src/types/models";

type PatientLike = {
  id?: string;
  patientId?: string;
  displayName?: string;
};

type LoginApiPayload = {
  token?: string;
  patient?: PatientLike;
};

type MeApiPayload = {
  ok?: boolean;
  patient?: PatientLike;
} & PatientLike;

export type LoginResponse = {
  token: string;
  patient: Patient | null;
};

export type CheckInCreatePayload = {
  date: string;
  mood: number;
  pain: number;
  adherence: {
    exercises: number;
    medication: boolean;
  };
  notes?: string;
};

export type CheckInCreateResponse = {
  ok: boolean;
  checkInId?: string;
  risk?: Risk;
  alertId?: string | null;
};

export type ChatRole = "patient" | "assistant" | "system";

export type ChatItem = {
  id?: string;
  role: ChatRole;
  text: string;
  createdAt?: string;
};

export type ChatSendResponse = {
  ok?: boolean;
  risk?: { level: "low" | "high"; reasonCodes?: string[] };
  alertId?: string | null;
  assistant?: { text?: string; message?: string; reply?: string };
  reply?: string;
  message?: string;
  messages?: ChatItem[];
};

function toPatient(value: PatientLike | null | undefined): Patient | null {
  if (!value) {
    return null;
  }

  const id = value.id ?? value.patientId;
  if (!id || !id.trim()) {
    return null;
  }

  return {
    id,
    displayName: value.displayName,
  };
}

function invalidResponseError(message: string): ApiError {
  return {
    title: "Unexpected response",
    message,
    kind: "unknown",
    retryable: false,
  };
}

export async function login(accessCode: string): Promise<LoginResponse> {
  const payload = await apiFetchJson<LoginApiPayload>("/patient/auth/login", {
    method: "POST",
    body: { accessCode },
  });

  if (!payload?.token || typeof payload.token !== "string") {
    throw invalidResponseError("Sign-in response did not include a token.");
  }

  return {
    token: payload.token,
    patient: toPatient(payload.patient),
  };
}

export async function getMe(token: string): Promise<Patient> {
  const payload = await apiFetchJson<MeApiPayload>("/patient/me", {
    method: "GET",
    token,
  });

  const patient = payload?.patient ? toPatient(payload.patient) : toPatient(payload);
  if (!patient) {
    throw invalidResponseError("Could not parse patient profile.");
  }

  return patient;
}

function toRisk(value: unknown): Risk | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const candidate = value as { level?: unknown; reasonCodes?: unknown };
  if (candidate.level !== "low" && candidate.level !== "high") {
    return undefined;
  }

  const reasonCodes = Array.isArray(candidate.reasonCodes)
    ? candidate.reasonCodes
        .map((code) => (typeof code === "string" ? code : null))
        .filter((code): code is string => Boolean(code))
    : undefined;

  return {
    level: candidate.level,
    reasonCodes,
  };
}

export async function createCheckin(
  token: string,
  payload: CheckInCreatePayload
): Promise<CheckInCreateResponse> {
  const response = await apiFetchJson<{
    ok?: unknown;
    checkInId?: unknown;
    risk?: unknown;
    alertId?: unknown;
  }>("/patient/checkins", {
    method: "POST",
    token,
    body: payload,
  });

  const checkInId =
    typeof response.checkInId === "string" ? response.checkInId : undefined;
  const alertId =
    typeof response.alertId === "string" ? response.alertId : null;

  return {
    ok: response.ok !== false,
    checkInId,
    risk: toRisk(response.risk),
    alertId,
  };
}

function toChatRole(value: unknown): ChatRole {
  if (value === "assistant" || value === "system" || value === "patient") {
    return value;
  }
  return "assistant";
}

function toChatItem(value: unknown): ChatItem | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as {
    id?: unknown;
    _id?: unknown;
    role?: unknown;
    text?: unknown;
    message?: unknown;
    content?: unknown;
    createdAt?: unknown;
  };
  const textSource = candidate.text ?? candidate.message ?? candidate.content;
  const text = typeof textSource === "string" ? textSource.trim() : "";
  if (!text) {
    return null;
  }

  const id =
    typeof candidate.id === "string"
      ? candidate.id
      : typeof candidate._id === "string"
        ? candidate._id
        : undefined;
  const createdAt =
    typeof candidate.createdAt === "string" ? candidate.createdAt : undefined;

  return {
    id,
    role: toChatRole(candidate.role),
    text,
    createdAt,
  };
}

function sortChatItemsAscending(items: ChatItem[]): ChatItem[] {
  return [...items].sort((a, b) => {
    const aTs = a.createdAt ? Date.parse(a.createdAt) : Number.NaN;
    const bTs = b.createdAt ? Date.parse(b.createdAt) : Number.NaN;
    if (!Number.isFinite(aTs) && !Number.isFinite(bTs)) {
      return 0;
    }
    if (!Number.isFinite(aTs)) {
      return 1;
    }
    if (!Number.isFinite(bTs)) {
      return -1;
    }
    return aTs - bTs;
  });
}

export async function chatHistory(token: string, limit = 50): Promise<ChatItem[]> {
  const payload = await apiFetchJson<
    | ChatItem[]
    | {
        items?: unknown;
        messages?: unknown;
      }
  >(`/patient/chat/history?limit=${encodeURIComponent(String(limit))}`, {
    method: "GET",
    token,
  });

  const source = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.items)
      ? payload.items
      : Array.isArray(payload?.messages)
        ? payload.messages
        : [];

  const normalized = source
    .map((item) => toChatItem(item))
    .filter((item): item is ChatItem => Boolean(item));

  return sortChatItemsAscending(normalized);
}

export async function sendChat(
  token: string,
  message: string
): Promise<ChatSendResponse> {
  return apiFetchJson<ChatSendResponse>("/patient/chat/send", {
    method: "POST",
    token,
    body: { message },
  });
}

export function extractAssistantText(resp: ChatSendResponse): string | null {
  const value =
    resp.reply ??
    resp.assistant?.reply ??
    resp.assistant?.text ??
    resp.assistant?.message;

  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (
    typeof resp.message === "string" &&
    resp.message.trim() &&
    resp.risk?.level !== "high" &&
    !resp.alertId
  ) {
    return resp.message.trim();
  }

  const assistantFromMessages = Array.isArray(resp.messages)
    ? resp.messages.find(
        (item) =>
          item.role === "assistant" &&
          typeof item.text === "string" &&
          item.text.trim().length > 0
      )
    : undefined;

  if (assistantFromMessages?.text) {
    return assistantFromMessages.text.trim();
  }

  return null;
}
