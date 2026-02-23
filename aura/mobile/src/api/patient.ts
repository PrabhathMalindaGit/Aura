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

export type ExercisePlanItem = {
  key: string;
  name: string;
  instructions: string;
  sets?: number;
  reps?: number;
  holdSeconds?: number;
  restSeconds?: number;
  intensity?: "easy" | "moderate" | "hard";
  videoUrl?: string;
  contraindications?: string[];
  order: number;
};

export type TodayExercisePlan = {
  title: string;
  timezone?: string;
  daysOfWeek: number[];
  items: ExercisePlanItem[];
  version: number;
  updatedAt: string;
};

export type TodayPlanResponse = {
  ok: boolean;
  patientId: string;
  date: string;
  dayOfWeek: number;
  plan: TodayExercisePlan | null;
};

export type ExerciseSessionStatus = "completed" | "abandoned";
export type ExerciseSessionDifficulty = "easy" | "ok" | "hard";

export type ExerciseSessionExercisePayload = {
  itemKey: string;
  nameSnapshot: string;
  order: number;
  planned?: {
    sets?: number;
    reps?: number;
    holdSeconds?: number;
    restSeconds?: number;
  };
  completed: boolean;
  setsDone?: number;
  repsDone?: number;
  difficulty?: ExerciseSessionDifficulty;
  painDuring?: number;
  note?: string;
  completedAt?: string;
};

export type ExerciseSessionCreatePayload = {
  startedAt: string;
  endedAt: string;
  planVersion?: number;
  planTitle?: string;
  planDayOfWeek?: number;
  status?: ExerciseSessionStatus;
  exercises: ExerciseSessionExercisePayload[];
};

export type ExerciseSessionCreateResponse = {
  ok: boolean;
  sessionId?: string;
  createdAt?: string;
};

export type ExerciseSessionListItem = {
  id: string;
  startedAt: string;
  durationSeconds: number;
  exerciseCount: number;
  completedCount: number;
  avgPainDuring?: number;
  planTitle?: string;
};

export type ExerciseSessionDetail = ExerciseSessionListItem & {
  endedAt: string;
  status: ExerciseSessionStatus;
  planVersion?: number;
  planDayOfWeek?: number;
  exercises: ExerciseSessionExercisePayload[];
};

export type CheckInItem = {
  id: string;
  date?: string;
  createdAt?: string;
  pain: number;
  mood: number;
  adherence?: {
    exercises?: number;
    medication?: boolean;
  };
  notes?: string;
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

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function normalizeExercisePlanItem(value: unknown): ExercisePlanItem | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const item = value as {
    key?: unknown;
    name?: unknown;
    instructions?: unknown;
    sets?: unknown;
    reps?: unknown;
    holdSeconds?: unknown;
    restSeconds?: unknown;
    intensity?: unknown;
    videoUrl?: unknown;
    contraindications?: unknown;
    order?: unknown;
  };

  const key = typeof item.key === "string" ? item.key.trim() : "";
  const name = typeof item.name === "string" ? item.name.trim() : "";
  const instructions =
    typeof item.instructions === "string" ? item.instructions.trim() : "";
  const order = toFiniteNumber(item.order);

  if (!key || !name || !instructions || order === null) {
    return null;
  }

  const intensity =
    item.intensity === "easy" ||
    item.intensity === "moderate" ||
    item.intensity === "hard"
      ? item.intensity
      : undefined;

  const contraindications = Array.isArray(item.contraindications)
    ? item.contraindications
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean)
    : undefined;

  return {
    key,
    name,
    instructions,
    sets: toFiniteNumber(item.sets) ?? undefined,
    reps: toFiniteNumber(item.reps) ?? undefined,
    holdSeconds: toFiniteNumber(item.holdSeconds) ?? undefined,
    restSeconds: toFiniteNumber(item.restSeconds) ?? undefined,
    intensity,
    videoUrl: typeof item.videoUrl === "string" ? item.videoUrl : undefined,
    contraindications: contraindications?.length ? contraindications : undefined,
    order,
  };
}

function normalizeTodayPlan(value: unknown): TodayExercisePlan | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as {
    title?: unknown;
    timezone?: unknown;
    daysOfWeek?: unknown;
    items?: unknown;
    version?: unknown;
    updatedAt?: unknown;
  };

  const title = typeof candidate.title === "string" ? candidate.title.trim() : "";
  const version = toFiniteNumber(candidate.version);
  const updatedAt =
    typeof candidate.updatedAt === "string" ? candidate.updatedAt : undefined;

  if (!title || version === null || !updatedAt) {
    return null;
  }

  const daysOfWeek = Array.isArray(candidate.daysOfWeek)
    ? candidate.daysOfWeek
        .map((day) => toFiniteNumber(day))
        .filter((day): day is number => day !== null && day >= 0 && day <= 6)
    : [];
  const normalizedItems = Array.isArray(candidate.items)
    ? candidate.items
        .map((item) => normalizeExercisePlanItem(item))
        .filter((item): item is ExercisePlanItem => Boolean(item))
    : [];

  return {
    title,
    timezone: typeof candidate.timezone === "string" ? candidate.timezone : undefined,
    daysOfWeek,
    items: [...normalizedItems].sort((left, right) => left.order - right.order),
    version,
    updatedAt,
  };
}

function normalizeCheckInItem(value: unknown): CheckInItem | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const item = value as {
    id?: unknown;
    _id?: unknown;
    checkInId?: unknown;
    date?: unknown;
    createdAt?: unknown;
    pain?: unknown;
    mood?: unknown;
    adherence?: {
      exercises?: unknown;
      medication?: unknown;
    };
    notes?: unknown;
  };

  const idSource = item.id ?? item._id ?? item.checkInId;
  const id = typeof idSource === "string" ? idSource : null;
  if (!id || !id.trim()) {
    return null;
  }

  const pain = toFiniteNumber(item.pain);
  const mood = toFiniteNumber(item.mood);
  if (pain === null || mood === null) {
    return null;
  }

  const exercises = toFiniteNumber(item.adherence?.exercises);
  const medication =
    typeof item.adherence?.medication === "boolean"
      ? item.adherence.medication
      : undefined;

  const adherence =
    exercises !== null || typeof medication === "boolean"
      ? {
          exercises: exercises !== null ? exercises : undefined,
          medication,
        }
      : undefined;

  return {
    id: id.trim(),
    date: typeof item.date === "string" ? item.date : undefined,
    createdAt: typeof item.createdAt === "string" ? item.createdAt : undefined,
    pain,
    mood,
    adherence,
    notes: typeof item.notes === "string" ? item.notes : undefined,
  };
}

function normalizeSessionExercise(
  value: unknown
): ExerciseSessionExercisePayload | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const item = value as {
    itemKey?: unknown;
    nameSnapshot?: unknown;
    order?: unknown;
    planned?: {
      sets?: unknown;
      reps?: unknown;
      holdSeconds?: unknown;
      restSeconds?: unknown;
    };
    completed?: unknown;
    setsDone?: unknown;
    repsDone?: unknown;
    difficulty?: unknown;
    painDuring?: unknown;
    note?: unknown;
    completedAt?: unknown;
  };

  const itemKey =
    typeof item.itemKey === "string" ? item.itemKey.trim() : "";
  const nameSnapshot =
    typeof item.nameSnapshot === "string" ? item.nameSnapshot.trim() : "";
  const order = toFiniteNumber(item.order);
  if (!itemKey || !nameSnapshot || order === null) {
    return null;
  }

  const planned =
    item.planned && typeof item.planned === "object"
      ? {
          sets: toFiniteNumber(item.planned.sets) ?? undefined,
          reps: toFiniteNumber(item.planned.reps) ?? undefined,
          holdSeconds: toFiniteNumber(item.planned.holdSeconds) ?? undefined,
          restSeconds: toFiniteNumber(item.planned.restSeconds) ?? undefined,
        }
      : undefined;

  const difficulty =
    item.difficulty === "easy" ||
    item.difficulty === "ok" ||
    item.difficulty === "hard"
      ? item.difficulty
      : undefined;

  const painDuring = toFiniteNumber(item.painDuring);
  const note = typeof item.note === "string" ? item.note.trim() : "";

  return {
    itemKey,
    nameSnapshot,
    order,
    planned,
    completed: item.completed === true,
    setsDone: toFiniteNumber(item.setsDone) ?? undefined,
    repsDone: toFiniteNumber(item.repsDone) ?? undefined,
    difficulty,
    painDuring: painDuring ?? undefined,
    note: note ? note : undefined,
    completedAt:
      typeof item.completedAt === "string" ? item.completedAt : undefined,
  };
}

function normalizeSessionListItem(value: unknown): ExerciseSessionListItem | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const item = value as {
    id?: unknown;
    _id?: unknown;
    startedAt?: unknown;
    durationSeconds?: unknown;
    exerciseCount?: unknown;
    completedCount?: unknown;
    avgPainDuring?: unknown;
    planTitle?: unknown;
  };

  const id = typeof (item.id ?? item._id) === "string" ? String(item.id ?? item._id) : "";
  const startedAt = typeof item.startedAt === "string" ? item.startedAt : "";
  const durationSeconds = toFiniteNumber(item.durationSeconds);
  const exerciseCount = toFiniteNumber(item.exerciseCount);
  const completedCount = toFiniteNumber(item.completedCount);

  if (!id || !startedAt || durationSeconds === null || exerciseCount === null || completedCount === null) {
    return null;
  }

  const avgPainDuring = toFiniteNumber(item.avgPainDuring);
  const planTitle = typeof item.planTitle === "string" ? item.planTitle : undefined;

  return {
    id,
    startedAt,
    durationSeconds,
    exerciseCount,
    completedCount,
    avgPainDuring: avgPainDuring ?? undefined,
    planTitle,
  };
}

function normalizeSessionDetail(value: unknown): ExerciseSessionDetail | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as {
    endedAt?: unknown;
    status?: unknown;
    planVersion?: unknown;
    planDayOfWeek?: unknown;
    exercises?: unknown;
  };
  const base = normalizeSessionListItem(record);
  if (!base) {
    return null;
  }

  const endedAt = typeof record.endedAt === "string" ? record.endedAt : "";
  if (!endedAt) {
    return null;
  }

  const status: ExerciseSessionStatus =
    record.status === "abandoned" ? "abandoned" : "completed";

  const exercises = Array.isArray(record.exercises)
    ? record.exercises
        .map((entry) => normalizeSessionExercise(entry))
        .filter((entry): entry is ExerciseSessionExercisePayload => Boolean(entry))
        .sort((left, right) => left.order - right.order)
    : [];

  return {
    ...base,
    endedAt,
    status,
    planVersion: toFiniteNumber(record.planVersion) ?? undefined,
    planDayOfWeek: toFiniteNumber(record.planDayOfWeek) ?? undefined,
    exercises,
  };
}

function parseCheckInTimestamp(item: CheckInItem): number {
  const dateTs = item.date ? Date.parse(item.date) : Number.NaN;
  if (Number.isFinite(dateTs)) {
    return dateTs;
  }

  const createdTs = item.createdAt ? Date.parse(item.createdAt) : Number.NaN;
  if (Number.isFinite(createdTs)) {
    return createdTs;
  }

  return 0;
}

function sortCheckInsDesc(items: CheckInItem[]): CheckInItem[] {
  return [...items].sort((a, b) => parseCheckInTimestamp(b) - parseCheckInTimestamp(a));
}

export async function listCheckins(
  token: string,
  params?: { from?: string; to?: string; limit?: number }
): Promise<CheckInItem[]> {
  const query = new URLSearchParams();
  if (params?.from) {
    query.set("from", params.from);
  }
  if (params?.to) {
    query.set("to", params.to);
  }
  if (typeof params?.limit === "number" && Number.isFinite(params.limit)) {
    query.set("limit", String(params.limit));
  }

  const path = query.toString()
    ? `/patient/checkins?${query.toString()}`
    : "/patient/checkins";

  const payload = await apiFetchJson<
    | CheckInItem[]
    | {
        items?: unknown;
        checkins?: unknown;
      }
  >(path, {
    method: "GET",
    token,
  });

  const rawItems = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.items)
      ? payload.items
      : Array.isArray(payload?.checkins)
        ? payload.checkins
        : [];

  const normalized = rawItems
    .map((item) => normalizeCheckInItem(item))
    .filter((item): item is CheckInItem => Boolean(item));

  return sortCheckInsDesc(normalized);
}

export async function getTodayExercisePlan(
  token: string,
  params?: { date?: string; tzOffsetMinutes?: number }
): Promise<TodayPlanResponse> {
  const query = new URLSearchParams();
  if (params?.date) {
    query.set("date", params.date);
  }
  if (
    typeof params?.tzOffsetMinutes === "number" &&
    Number.isFinite(params.tzOffsetMinutes)
  ) {
    query.set("tzOffsetMinutes", String(Math.trunc(params.tzOffsetMinutes)));
  }

  const path = query.toString()
    ? `/patient/exercise-plan/today?${query.toString()}`
    : "/patient/exercise-plan/today";

  const payload = await apiFetchJson<{
    ok?: unknown;
    patientId?: unknown;
    date?: unknown;
    dayOfWeek?: unknown;
    plan?: unknown;
  }>(path, {
    method: "GET",
    token,
  });

  const patientId =
    typeof payload.patientId === "string" ? payload.patientId : "";
  const date = typeof payload.date === "string" ? payload.date : "";
  const dayOfWeek = toFiniteNumber(payload.dayOfWeek) ?? 0;
  const plan = normalizeTodayPlan(payload.plan);

  return {
    ok: payload.ok !== false,
    patientId,
    date,
    dayOfWeek,
    plan,
  };
}

export async function createExerciseSession(
  token: string,
  payload: ExerciseSessionCreatePayload
): Promise<ExerciseSessionCreateResponse> {
  const response = await apiFetchJson<{
    ok?: unknown;
    sessionId?: unknown;
    createdAt?: unknown;
  }>("/patient/exercise-sessions", {
    method: "POST",
    token,
    body: payload,
  });

  return {
    ok: response.ok !== false,
    sessionId:
      typeof response.sessionId === "string" ? response.sessionId : undefined,
    createdAt:
      typeof response.createdAt === "string" ? response.createdAt : undefined,
  };
}

export async function listExerciseSessions(
  token: string,
  limit = 20
): Promise<ExerciseSessionListItem[]> {
  const payload = await apiFetchJson<
    | ExerciseSessionListItem[]
    | {
        sessions?: unknown;
        items?: unknown;
      }
  >(`/patient/exercise-sessions?limit=${encodeURIComponent(String(limit))}`, {
    method: "GET",
    token,
  });

  const source = Array.isArray(payload)
    ? payload
    : Array.isArray(payload.sessions)
      ? payload.sessions
      : Array.isArray(payload.items)
        ? payload.items
        : [];

  return source
    .map((entry) => normalizeSessionListItem(entry))
    .filter((entry): entry is ExerciseSessionListItem => Boolean(entry))
    .sort(
      (left, right) =>
        Date.parse(right.startedAt) - Date.parse(left.startedAt)
    );
}

export async function getExerciseSession(
  token: string,
  sessionId: string
): Promise<ExerciseSessionDetail> {
  const payload = await apiFetchJson<{
    session?: unknown;
    data?: unknown;
  }>(`/patient/exercise-sessions/${encodeURIComponent(sessionId)}`, {
    method: "GET",
    token,
  });

  const detail =
    normalizeSessionDetail(payload.session) ?? normalizeSessionDetail(payload.data);
  if (!detail) {
    throw invalidResponseError("Could not parse exercise session detail.");
  }

  return detail;
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
