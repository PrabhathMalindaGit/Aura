import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ExerciseSessionDifficulty } from '@/src/api/patient';

const PREFIX = 'aura:activeExerciseSession:v1:';

export type ActiveExerciseSessionExercise = {
  itemKey: string;
  nameSnapshot: string;
  order: number;
  instructions: string;
  planned?: {
    sets?: number;
    reps?: number;
    holdSeconds?: number;
    restSeconds?: number;
  };
  completed: boolean;
  difficulty?: ExerciseSessionDifficulty;
  painDuring?: number;
  note?: string;
  completedAt?: string;
};

export type ActiveExerciseSessionRecord = {
  patientId: string;
  date: string;
  planVersion?: number;
  planTitle?: string;
  planDayOfWeek?: number;
  startedAt: string;
  status: 'in_progress' | 'complete';
  completedAt?: string;
  completionSource?: 'server' | 'pending';
  exercises: ActiveExerciseSessionExercise[];
  updatedAt: number;
};

function storageKey(patientId: string): string {
  return `${PREFIX}${patientId}`;
}

function normalizeExercise(value: unknown): ActiveExerciseSessionExercise | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  const itemKey = typeof record.itemKey === 'string' ? record.itemKey : '';
  const nameSnapshot = typeof record.nameSnapshot === 'string' ? record.nameSnapshot : '';
  const order = typeof record.order === 'number' && Number.isFinite(record.order) ? record.order : 0;
  const instructions = typeof record.instructions === 'string' ? record.instructions : '';

  if (!itemKey || !nameSnapshot) {
    return null;
  }

  return {
    itemKey,
    nameSnapshot,
    order,
    instructions,
    planned:
      record.planned && typeof record.planned === 'object'
        ? (record.planned as ActiveExerciseSessionExercise['planned'])
        : undefined,
    completed: record.completed === true,
    difficulty:
      record.difficulty === 'easy' || record.difficulty === 'ok' || record.difficulty === 'hard'
        ? record.difficulty
        : undefined,
    painDuring:
      typeof record.painDuring === 'number' && Number.isFinite(record.painDuring)
        ? record.painDuring
        : undefined,
    note: typeof record.note === 'string' ? record.note : undefined,
    completedAt: typeof record.completedAt === 'string' ? record.completedAt : undefined,
  };
}

function normalizeRecord(value: unknown): ActiveExerciseSessionRecord | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  const patientId = typeof record.patientId === 'string' ? record.patientId.trim() : '';
  const date = typeof record.date === 'string' ? record.date.trim() : '';
  const startedAt = typeof record.startedAt === 'string' ? record.startedAt : '';
  const status = record.status === 'in_progress' || record.status === 'complete' ? record.status : null;

  if (!patientId || !date || !startedAt || !status) {
    return null;
  }

  const exercises = Array.isArray(record.exercises)
    ? record.exercises
        .map((item) => normalizeExercise(item))
        .filter((item): item is ActiveExerciseSessionExercise => Boolean(item))
    : [];

  return {
    patientId,
    date,
    planVersion:
      typeof record.planVersion === 'number' && Number.isFinite(record.planVersion)
        ? record.planVersion
        : undefined,
    planTitle: typeof record.planTitle === 'string' ? record.planTitle : undefined,
    planDayOfWeek:
      typeof record.planDayOfWeek === 'number' && Number.isFinite(record.planDayOfWeek)
        ? record.planDayOfWeek
        : undefined,
    startedAt,
    status,
    completedAt: typeof record.completedAt === 'string' ? record.completedAt : undefined,
    completionSource:
      record.completionSource === 'server' || record.completionSource === 'pending'
        ? record.completionSource
        : undefined,
    exercises,
    updatedAt:
      typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt)
        ? record.updatedAt
        : Date.now(),
  };
}

export async function getActiveExerciseSession(
  patientId: string,
): Promise<ActiveExerciseSessionRecord | null> {
  if (!patientId.trim()) {
    return null;
  }

  try {
    const raw = await AsyncStorage.getItem(storageKey(patientId));
    if (!raw) {
      return null;
    }

    return normalizeRecord(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function setActiveExerciseSession(
  record: ActiveExerciseSessionRecord,
): Promise<void> {
  if (!record.patientId.trim()) {
    return;
  }

  try {
    await AsyncStorage.setItem(
      storageKey(record.patientId),
      JSON.stringify({
        ...record,
        updatedAt: Date.now(),
      }),
    );
  } catch {
    // Best effort only.
  }
}

export async function clearActiveExerciseSession(patientId: string): Promise<void> {
  if (!patientId.trim()) {
    return;
  }

  try {
    await AsyncStorage.removeItem(storageKey(patientId));
  } catch {
    // Ignore cleanup failures.
  }
}
