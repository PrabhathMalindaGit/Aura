import type { ErrorKey, LastErrorRecord } from "@/src/state/lastError";

export type AppError = {
  title: string;
  message: string;
  kind: "network" | "server" | "validation" | "unknown";
  retryable: boolean;
  detail?: string;
};

export function normalizeUnknownError(error: unknown): AppError {
  const fallback: AppError = {
    title: "Something went wrong",
    message: "Please try again.",
    kind: "unknown",
    retryable: true,
  };

  if (!error) {
    return fallback;
  }

  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Please try again.";
  const normalizedMessage = message.trim() || "Please try again.";
  const lower = normalizedMessage.toLowerCase();

  if (lower.includes("network") || lower.includes("offline")) {
    return {
      title: "No connection",
      message: "Check your internet connection and try again.",
      kind: "network",
      retryable: true,
    };
  }

  if (lower.includes("validation") || lower.includes("invalid")) {
    return {
      title: "Check your input",
      message: "Please review your entries and try again.",
      kind: "validation",
      retryable: false,
    };
  }

  if (lower.includes("server") || lower.includes("500")) {
    return {
      title: "Service unavailable",
      message: "The service is temporarily unavailable. Please try again shortly.",
      kind: "server",
      retryable: true,
    };
  }

  return {
    ...fallback,
    message: normalizedMessage,
  };
}

export function toLastErrorRecord(
  key: ErrorKey,
  appError: {
    title: string;
    message: string;
    kind: AppError["kind"] | "offline";
    retryable: boolean;
    detail?: string;
  },
  titleOverride?: string
): LastErrorRecord {
  const message = appError.message || "Please try again.";
  const normalizedLower = message.toLowerCase();

  const kind: LastErrorRecord["kind"] =
    appError.kind === "offline"
      ? "offline"
      : appError.kind === "network" &&
          (normalizedLower.includes("offline") ||
            normalizedLower.includes("no connection"))
        ? "offline"
        : appError.kind;

  return {
    key,
    title: titleOverride || appError.title || "Something went wrong",
    message,
    kind,
    retryable: appError.retryable,
    at: Date.now(),
    detail: appError.detail,
  };
}
