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
