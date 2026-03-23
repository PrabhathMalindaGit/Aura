import { env } from "../env";

type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function normalizeValue(value: unknown): unknown {
  if (value === undefined) {
    return undefined;
  }

  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
    };
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizeValue(entry))
      .filter((entry) => entry !== undefined);
  }

  if (typeof value === "object") {
    const normalizedEntries = Object.entries(value).flatMap(([key, entry]) => {
      const normalized = normalizeValue(entry);
      return normalized === undefined ? [] : [[key, normalized] as const];
    });

    return Object.fromEntries(normalizedEntries);
  }

  return String(value);
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_WEIGHT[level] >= LOG_LEVEL_WEIGHT[env.LOG_LEVEL];
}

function writeLog(
  level: Extract<LogLevel, "info" | "warn" | "error">,
  event: string,
  meta?: Record<string, unknown>
): void {
  if (!shouldLog(level)) {
    return;
  }

  const payload = {
    ts: new Date().toISOString(),
    level,
    event,
    ...(meta ? ((normalizeValue(meta) as Record<string, unknown>) ?? {}) : {}),
  };

  const line = JSON.stringify(payload);

  if (level === "warn") {
    console.warn(line);
    return;
  }

  if (level === "error") {
    console.error(line);
    return;
  }

  console.log(line);
}

export const logger = {
  info(message: string, meta?: Record<string, unknown>): void {
    writeLog("info", message, meta);
  },

  warn(message: string, meta?: Record<string, unknown>): void {
    writeLog("warn", message, meta);
  },

  error(message: string, meta?: Record<string, unknown>): void {
    writeLog("error", message, meta);
  },
};
