import { API_BASE } from "@/src/config/env";

export type ApiError = {
  status?: number;
  title: string;
  message: string;
  kind: "offline" | "network" | "server" | "validation" | "unknown";
  retryable: boolean;
  detail?: string;
};

type ApiFetchJsonOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  headers?: Record<string, string>;
  body?: unknown;
  token?: string;
  timeoutMs?: number;
  isOffline?: boolean;
};

const DEFAULT_TIMEOUT_MS = 12000;

function parseMaybeJson(text: string): unknown {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function getOfflineSignal(): boolean {
  if (typeof navigator !== "undefined" && typeof navigator.onLine === "boolean") {
    return !navigator.onLine;
  }
  return false;
}

function hasDOMException(): boolean {
  return typeof (globalThis as { DOMException?: unknown }).DOMException !== "undefined";
}

function isAbortLikeError(error: unknown): boolean {
  const candidate = error as { name?: unknown; message?: unknown } | null;
  const name = typeof candidate?.name === "string" ? candidate.name : "";
  const message = String(candidate?.message ?? "");

  if (name === "AbortError") {
    return true;
  }
  if (message.toLowerCase().includes("aborted")) {
    return true;
  }
  if (hasDOMException()) {
    const DOMEx = (globalThis as { DOMException?: unknown }).DOMException;
    try {
      if (typeof DOMEx === "function" && error instanceof (DOMEx as new (...args: never[]) => object)) {
        return true;
      }
    } catch {
      // no-op: guard against invalid global constructors.
    }
  }
  return false;
}

function buildApiError(error: ApiError): ApiError {
  return error;
}

function mapHttpError(status: number, payload: unknown): ApiError {
  const payloadMessage =
    payload && typeof payload === "object" && "message" in payload
      ? String((payload as { message?: unknown }).message ?? "")
      : "";

  if (status === 400) {
    return buildApiError({
      status,
      title: "Invalid request",
      message: payloadMessage || "Please check your input and try again.",
      kind: "validation",
      retryable: false,
    });
  }

  if (status === 401 || status === 403) {
    return buildApiError({
      status,
      title: "Unauthorized",
      message: payloadMessage || "Authentication failed. Please sign in again.",
      kind: "validation",
      retryable: false,
    });
  }

  if (status === 404) {
    return buildApiError({
      status,
      title: "Not found",
      message: payloadMessage || "Requested resource was not found.",
      kind: "unknown",
      retryable: false,
    });
  }

  if (status >= 500) {
    return buildApiError({
      status,
      title: "Server error",
      message:
        payloadMessage || "The service is temporarily unavailable. Please retry.",
      kind: "server",
      retryable: true,
    });
  }

  return buildApiError({
    status,
    title: "Request failed",
    message: payloadMessage || "Please try again.",
    kind: "unknown",
    retryable: true,
  });
}

export function isApiError(error: unknown): error is ApiError {
  return (
    typeof error === "object" &&
    error !== null &&
    "title" in error &&
    "message" in error &&
    "kind" in error &&
    "retryable" in error
  );
}

export async function apiFetchJson<T>(
  path: string,
  options: ApiFetchJsonOptions = {}
): Promise<T> {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(options.headers ?? {}),
  };
  const isFormDataBody =
    typeof FormData !== "undefined" && options.body instanceof FormData;

  if (options.body !== undefined && !isFormDataBody) {
    headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
  }

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  try {
    const response = await fetch(url, {
      method: options.method ?? "GET",
      headers,
      body:
        options.body !== undefined
          ? isFormDataBody
            ? (options.body as FormData)
            : JSON.stringify(options.body)
          : undefined,
      signal: controller.signal,
    });

    const text = await response.text();
    const parsed = parseMaybeJson(text);

    if (!response.ok) {
      throw mapHttpError(response.status, parsed);
    }

    if (parsed === null || parsed === "") {
      return {} as T;
    }

    return parsed as T;
  } catch (error) {
    if (isApiError(error)) {
      throw error;
    }

    if (isAbortLikeError(error)) {
      throw buildApiError({
        title: "Timed out",
        message: "The request timed out. Please try again.",
        kind: options.isOffline ? "offline" : "network",
        retryable: true,
      });
    }

    const offlineSignal = options.isOffline || getOfflineSignal();
    if (error instanceof TypeError) {
      throw buildApiError({
        title: offlineSignal ? "Offline" : "Network error",
        message: offlineSignal
          ? "You’re offline. Nothing was sent."
          : "Could not reach the service. Please try again.",
        kind: offlineSignal ? "offline" : "network",
        retryable: true,
      });
    }

    throw buildApiError({
      title: "Something went wrong",
      message: "Please try again.",
      kind: "unknown",
      retryable: true,
      detail: error instanceof Error ? error.message : undefined,
    });
  } finally {
    clearTimeout(timeout);
  }
}
