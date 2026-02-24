export type RehabPhaseStatus = "locked" | "current" | "done";

export type RehabPhase = {
  key: string;
  title: string;
  description?: string;
  order: number;
  status: RehabPhaseStatus;
  startedAt?: Date | null;
  completedAt?: Date | null;
};

export type RehabTimeline = {
  currentKey: string | null;
  phases: RehabPhase[];
};

const DEFAULT_PHASE_DEFINITIONS = [
  {
    key: "phase-early",
    title: "Early Recovery",
    description: "Pain control, swelling management, and gentle range-of-motion.",
    order: 0,
  },
  {
    key: "phase-strength",
    title: "Strength & Control",
    description: "Progressive strengthening, movement quality, and stability.",
    order: 1,
  },
  {
    key: "phase-return",
    title: "Return to Activity",
    description: "Build tolerance for daily and sport-specific activity.",
    order: 2,
  },
  {
    key: "phase-maintain",
    title: "Maintenance",
    description: "Maintain gains and prevent setbacks with routine follow-through.",
    order: 3,
  },
] as const;

function toDateOrNull(value: unknown): Date | null {
  if (!value) {
    return null;
  }

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

function normalizePhase(value: unknown): RehabPhase | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const phase = value as {
    key?: unknown;
    title?: unknown;
    description?: unknown;
    order?: unknown;
    status?: unknown;
    startedAt?: unknown;
    completedAt?: unknown;
  };

  const key = typeof phase.key === "string" ? phase.key.trim() : "";
  const title = typeof phase.title === "string" ? phase.title.trim() : "";
  const order =
    typeof phase.order === "number" && Number.isInteger(phase.order) ? phase.order : Number.NaN;

  if (!key || !title || !Number.isFinite(order)) {
    return null;
  }

  const status: RehabPhaseStatus =
    phase.status === "done" || phase.status === "current" || phase.status === "locked"
      ? phase.status
      : "locked";

  return {
    key,
    title,
    description:
      typeof phase.description === "string" && phase.description.trim()
        ? phase.description.trim()
        : undefined,
    order,
    status,
    startedAt: toDateOrNull(phase.startedAt),
    completedAt: toDateOrNull(phase.completedAt),
  };
}

export function normalizeRehabPhases(value: unknown): RehabPhase[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => normalizePhase(entry))
    .filter((entry): entry is RehabPhase => Boolean(entry))
    .sort((left, right) => left.order - right.order);
}

export function buildDefaultPhases(): RehabPhase[] {
  return DEFAULT_PHASE_DEFINITIONS.map((phase) => ({
    key: phase.key,
    title: phase.title,
    description: phase.description,
    order: phase.order,
    status: "locked",
    startedAt: null,
    completedAt: null,
  }));
}

export function recomputePhaseStatuses(
  rawPhases: RehabPhase[],
  rawCurrentKey: string | null | undefined,
  now: Date = new Date()
): RehabTimeline {
  const phases = normalizeRehabPhases(rawPhases);
  if (phases.length === 0) {
    return {
      currentKey: null,
      phases: [],
    };
  }

  const fallbackCurrentKey = phases[0].key;
  const currentKey =
    typeof rawCurrentKey === "string" && phases.some((phase) => phase.key === rawCurrentKey)
      ? rawCurrentKey
      : fallbackCurrentKey;

  const currentPhase = phases.find((phase) => phase.key === currentKey);
  const currentOrder = currentPhase?.order ?? phases[0].order;

  const nextPhases = phases.map((phase) => {
    if (phase.order < currentOrder) {
      return {
        ...phase,
        status: "done" as const,
        startedAt: phase.startedAt ?? now,
        completedAt: phase.completedAt ?? now,
      };
    }

    if (phase.key === currentKey) {
      return {
        ...phase,
        status: "current" as const,
        startedAt: phase.startedAt ?? now,
        completedAt: null,
      };
    }

    return {
      ...phase,
      status: "locked" as const,
      startedAt: null,
      completedAt: null,
    };
  });

  return {
    currentKey,
    phases: nextPhases,
  };
}
