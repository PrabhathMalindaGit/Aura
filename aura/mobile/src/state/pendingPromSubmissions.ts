import AsyncStorage from "@react-native-async-storage/async-storage";

import type { PromAnswer } from "@/src/api/patient";

const PREFIX = "aura:pendingPromSubmissions:v1:";

export type PendingPromSubmission = {
  localId: string;
  promId: string;
  createdAt: string;
  answers: PromAnswer[];
};

function storageKey(patientId: string): string {
  return `${PREFIX}${patientId}`;
}

function normalizeAnswer(value: unknown): PromAnswer | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const answer = value as { questionId?: unknown; value?: unknown };
  const questionId =
    typeof answer.questionId === "string" ? answer.questionId.trim() : "";
  const numericValue = Number(answer.value);
  if (!questionId || !Number.isFinite(numericValue)) {
    return null;
  }

  return {
    questionId,
    value: numericValue,
  };
}

function parsePending(raw: string | null): PendingPromSubmission[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((entry) => {
        if (!entry || typeof entry !== "object") {
          return null;
        }

        const item = entry as {
          localId?: unknown;
          promId?: unknown;
          createdAt?: unknown;
          answers?: unknown;
        };

        if (
          typeof item.localId !== "string" ||
          !item.localId.trim() ||
          typeof item.promId !== "string" ||
          !item.promId.trim() ||
          typeof item.createdAt !== "string"
        ) {
          return null;
        }

        const answers = Array.isArray(item.answers)
          ? item.answers
              .map((answer) => normalizeAnswer(answer))
              .filter((answer): answer is PromAnswer => Boolean(answer))
          : [];

        return {
          localId: item.localId,
          promId: item.promId,
          createdAt: item.createdAt,
          answers,
        };
      })
      .filter((entry): entry is PendingPromSubmission => Boolean(entry));
  } catch {
    return [];
  }
}

async function writePending(
  patientId: string,
  entries: PendingPromSubmission[]
): Promise<void> {
  await AsyncStorage.setItem(storageKey(patientId), JSON.stringify(entries));
}

export async function getPendingPromSubmissions(
  patientId: string
): Promise<PendingPromSubmission[]> {
  if (!patientId.trim()) {
    return [];
  }

  try {
    const raw = await AsyncStorage.getItem(storageKey(patientId));
    return parsePending(raw);
  } catch {
    return [];
  }
}

export async function addPendingPromSubmission(
  patientId: string,
  payload: {
    promId: string;
    answers: PromAnswer[];
  }
): Promise<PendingPromSubmission> {
  if (!patientId.trim()) {
    throw new Error("patientId is required");
  }

  const normalizedAnswers = payload.answers
    .map((answer) => normalizeAnswer(answer))
    .filter((answer): answer is PromAnswer => Boolean(answer));

  const nextEntry: PendingPromSubmission = {
    localId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    promId: payload.promId,
    createdAt: new Date().toISOString(),
    answers: normalizedAnswers,
  };

  const current = await getPendingPromSubmissions(patientId);
  const withoutSameProm = current.filter((entry) => entry.promId !== payload.promId);
  const next = [nextEntry, ...withoutSameProm];
  await writePending(patientId, next);
  return nextEntry;
}

export async function removePendingPromSubmission(
  patientId: string,
  localId: string
): Promise<void> {
  if (!patientId.trim() || !localId.trim()) {
    return;
  }

  const current = await getPendingPromSubmissions(patientId);
  const next = current.filter((entry) => entry.localId !== localId);
  await writePending(patientId, next);
}

export async function clearPendingPromSubmissions(patientId: string): Promise<void> {
  if (!patientId.trim()) {
    return;
  }
  await AsyncStorage.removeItem(storageKey(patientId));
}
