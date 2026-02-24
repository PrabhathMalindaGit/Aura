import AsyncStorage from "@react-native-async-storage/async-storage";

const PREFIX = "aura:promDraft:v1:";

type PromDraftRecord = {
  answers: Record<string, number>;
  updatedAt: number;
};

function storageKey(patientId: string, promId: string): string {
  return `${PREFIX}${patientId}:${promId}`;
}

function parseDraft(raw: string | null): PromDraftRecord | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PromDraftRecord>;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const answers =
      parsed.answers && typeof parsed.answers === "object"
        ? Object.fromEntries(
            Object.entries(parsed.answers)
              .map(([questionId, value]) => [questionId, Number(value)] as const)
              .filter(
                ([questionId, value]) =>
                  typeof questionId === "string" &&
                  questionId.trim().length > 0 &&
                  Number.isFinite(value)
              )
          )
        : {};

    const updatedAt =
      typeof parsed.updatedAt === "number" && Number.isFinite(parsed.updatedAt)
        ? parsed.updatedAt
        : Date.now();

    return {
      answers,
      updatedAt,
    };
  } catch {
    return null;
  }
}

export async function getPromDraft(
  patientId: string,
  promId: string
): Promise<PromDraftRecord | null> {
  if (!patientId.trim() || !promId.trim()) {
    return null;
  }

  try {
    const raw = await AsyncStorage.getItem(storageKey(patientId, promId));
    return parseDraft(raw);
  } catch {
    return null;
  }
}

export async function setPromDraft(
  patientId: string,
  promId: string,
  answers: Record<string, number>
): Promise<void> {
  if (!patientId.trim() || !promId.trim()) {
    return;
  }

  const sanitizedAnswers = Object.fromEntries(
    Object.entries(answers)
      .map(([questionId, value]) => [questionId, Number(value)] as const)
      .filter(
        ([questionId, value]) =>
          typeof questionId === "string" &&
          questionId.trim().length > 0 &&
          Number.isFinite(value)
      )
  );

  const payload: PromDraftRecord = {
    answers: sanitizedAnswers,
    updatedAt: Date.now(),
  };

  await AsyncStorage.setItem(storageKey(patientId, promId), JSON.stringify(payload));
}

export async function clearPromDraft(
  patientId: string,
  promId: string
): Promise<void> {
  if (!patientId.trim() || !promId.trim()) {
    return;
  }

  await AsyncStorage.removeItem(storageKey(patientId, promId));
}

export async function clearAllPromDraftsForPatient(patientId: string): Promise<void> {
  if (!patientId.trim()) {
    return;
  }

  const allKeys = await AsyncStorage.getAllKeys();
  const draftKeys = allKeys.filter((key) => key.startsWith(`${PREFIX}${patientId}:`));
  if (draftKeys.length > 0) {
    await AsyncStorage.multiRemove(draftKeys);
  }
}
