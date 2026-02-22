const URL_PATTERN = /https?:\/\/[^\s]+/gi;
const TELEGRAM_TOKEN_PATTERN = /\b\d{6,}:[A-Za-z0-9_-]{20,}\b/g;
const LONG_TOKEN_PATTERN = /\b[A-Za-z0-9_-]{24,}\b/g;
const MULTI_SPACE_PATTERN = /\s+/g;

const MAX_NOTIFICATION_ERROR_LENGTH = 200;

function inferNotificationErrorCode(raw: string): string | undefined {
  const lower = raw.toLowerCase();

  if (/\b401\b/.test(lower) || /\b403\b/.test(lower) || lower.includes("unauthorized")) {
    return "TELEGRAM_UNAUTHORIZED";
  }
  if (/\b429\b/.test(lower) || lower.includes("too many requests")) {
    return "TELEGRAM_RATE_LIMITED";
  }
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return "TELEGRAM_TIMEOUT";
  }
  if (
    lower.includes("econn") ||
    lower.includes("enotfound") ||
    lower.includes("network")
  ) {
    return "TELEGRAM_NETWORK_ERROR";
  }
  if (/\b404\b/.test(lower) || lower.includes("chat not found")) {
    return "TELEGRAM_TARGET_NOT_FOUND";
  }

  return undefined;
}

export function sanitizeNotificationError(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const inferred = inferNotificationErrorCode(trimmed);
  if (inferred) {
    return inferred;
  }

  const redacted = trimmed
    .replace(URL_PATTERN, "[redacted-url]")
    .replace(TELEGRAM_TOKEN_PATTERN, "[redacted-token]")
    .replace(LONG_TOKEN_PATTERN, "[redacted-token]")
    .replace(MULTI_SPACE_PATTERN, " ")
    .trim();

  if (!redacted) {
    return "TELEGRAM_DELIVERY_FAILED";
  }

  if (redacted.length <= MAX_NOTIFICATION_ERROR_LENGTH) {
    return redacted;
  }

  return `${redacted.slice(0, MAX_NOTIFICATION_ERROR_LENGTH)}…`;
}
