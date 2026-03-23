import { markError, markSuccess } from './connectionStore';
import { AppError, createAppError, isAppError } from '../utils/errors';

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_API_BASE_URL = 'http://localhost:3000';
const JSON_CONTENT_TYPE = 'application/json';
const CLINICIAN_TOKEN_STORAGE_KEYS = ['aura_access_token', 'aura_auth_token', 'clinicianToken'];
const TOKEN_EXPIRY_SKEW_SECONDS = 15;
const AUTH_REQUIRED_EVENT = 'aura:auth-required';

export type AuthRequiredReason = 'missing' | 'expired';

type QueryPrimitive = string | number | boolean | null | undefined;
type QueryValue = QueryPrimitive | QueryPrimitive[];

export interface FetchJsonOptions extends Omit<RequestInit, 'body'> {
  query?: Record<string, QueryValue>;
  json?: unknown;
  timeoutMs?: number;
  body?: BodyInit | null;
}

export function getApiBaseUrl(): string {
  return import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL;
}

function getBrowserStorages(): Storage[] {
  if (typeof window === 'undefined') {
    return [];
  }

  const storages: Storage[] = [];
  if (typeof window.localStorage !== 'undefined') {
    storages.push(window.localStorage);
  }
  if (typeof window.sessionStorage !== 'undefined') {
    storages.push(window.sessionStorage);
  }
  return storages;
}

function decodeJwtExp(value: string): number | null {
  const sections = value.split('.');
  if (sections.length < 2) {
    return null;
  }

  try {
    const base64 = sections[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const payload = JSON.parse(atob(padded)) as { exp?: unknown };
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

function emitAuthRequired(reason: AuthRequiredReason): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<AuthRequiredReason>(AUTH_REQUIRED_EVENT, {
      detail: reason,
    }),
  );
}

export function subscribeAuthRequired(listener: (reason: AuthRequiredReason) => void): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handler = (event: Event): void => {
    const customEvent = event as CustomEvent<AuthRequiredReason>;
    listener(customEvent.detail ?? 'expired');
  };

  window.addEventListener(AUTH_REQUIRED_EVENT, handler as EventListener);
  return () => {
    window.removeEventListener(AUTH_REQUIRED_EVENT, handler as EventListener);
  };
}

export function clearStoredClinicianTokens(options: { emitEvent?: boolean; reason?: AuthRequiredReason } = {}): void {
  const storages = getBrowserStorages();
  if (storages.length === 0) {
    return;
  }

  for (const storage of storages) {
    for (const key of CLINICIAN_TOKEN_STORAGE_KEYS) {
      storage.removeItem(key);
    }
  }

  if (options.emitEvent) {
    emitAuthRequired(options.reason ?? 'expired');
  }
}

export function setStoredClinicianToken(token: string): void {
  const normalized = token.trim();
  if (!normalized) {
    return;
  }

  const storages = getBrowserStorages();
  if (storages.length === 0) {
    return;
  }

  for (const storage of storages) {
    for (const key of CLINICIAN_TOKEN_STORAGE_KEYS) {
      storage.removeItem(key);
    }
  }

  storages[0].setItem('aura_access_token', normalized);
}

export function getStoredClinicianToken(): string | null {
  const storages = getBrowserStorages();
  if (storages.length === 0) {
    return null;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);

  for (const key of CLINICIAN_TOKEN_STORAGE_KEYS) {
    for (const storage of storages) {
      const value = storage.getItem(key);
      if (!value || !value.trim()) {
        continue;
      }

      const trimmed = value.trim();
      const exp = decodeJwtExp(trimmed);

      if (exp !== null && exp <= nowSeconds + TOKEN_EXPIRY_SKEW_SECONDS) {
        storage.removeItem(key);
        continue;
      }

      return trimmed;
    }
  }

  return null;
}

function appendQueryParams(url: URL, query?: Record<string, QueryValue>): void {
  if (!query) {
    return;
  }

  Object.entries(query).forEach(([key, value]) => {
    if (value === null || value === undefined) {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item !== null && item !== undefined) {
          url.searchParams.append(key, String(item));
        }
      });
      return;
    }

    url.searchParams.set(key, String(value));
  });
}

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const baseUrl = getApiBaseUrl();
  const isAbsolute = /^https?:\/\//.test(path);
  const url = isAbsolute
    ? new URL(path)
    : new URL(path.startsWith('/') ? path : `/${path}`, baseUrl);

  appendQueryParams(url, query);
  return url.toString();
}

function toEndpointPath(path: string): string {
  if (/^https?:\/\//.test(path)) {
    try {
      return new URL(path).pathname || '/';
    } catch {
      return '/';
    }
  }

  return path.startsWith('/') ? path : `/${path}`;
}

function shouldClearClinicianSession(endpointPath: string): boolean {
  return endpointPath.startsWith('/clinician/') || endpointPath === '/auth/clinician/me';
}

function safeMessageForStatus(status: number): { message: string; hint?: string } {
  if (status === 400) {
    return { message: 'The request was invalid.', hint: 'Please refresh and try again.' };
  }

  if (status === 401 || status === 403) {
    return { message: 'You are not authorized for this action.' };
  }

  if (status === 404) {
    return { message: 'Requested resource was not found.' };
  }

  if (status >= 500) {
    return {
      message: 'The server is temporarily unavailable.',
      hint: 'Please retry in a moment.',
    };
  }

  return { message: 'The request could not be completed.' };
}

function buildHttpError(status: number): AppError {
  const { message, hint } = safeMessageForStatus(status);
  return createAppError('HTTP', message, { status, hint });
}

function mapUnknownToAppError(error: unknown): AppError {
  if (isAppError(error)) {
    return error;
  }

  if (error instanceof DOMException && error.name === 'AbortError') {
    return createAppError('Timeout', 'The request timed out.', {
      hint: 'Check connectivity and retry.',
    });
  }

  if (error instanceof TypeError) {
    return createAppError('Network', 'Unable to reach the service.', {
      hint: 'Check network connection and try again.',
    });
  }

  return createAppError('Unknown', 'Unexpected error occurred.', {
    hint: 'Please retry. If this continues, contact support.',
  });
}

function withAbortSignal(
  signal: AbortSignal | null | undefined,
  controller: AbortController,
): AbortSignal {
  if (!signal) {
    return controller.signal;
  }

  if (signal.aborted) {
    controller.abort();
    return controller.signal;
  }

  const abortHandler = (): void => controller.abort();
  signal.addEventListener('abort', abortHandler, { once: true });
  return controller.signal;
}

export async function fetchJson<T>(path: string, options: FetchJsonOptions = {}): Promise<T> {
  const { query, json, timeoutMs = DEFAULT_TIMEOUT_MS, headers, signal, body, ...requestInit } =
    options;

  const controller = new AbortController();
  const endpointPath = toEndpointPath(path);
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  const requestHeaders = new Headers(headers ?? {});
  requestHeaders.set('Accept', JSON_CONTENT_TYPE);
  if (json !== undefined && !requestHeaders.has('Content-Type')) {
    requestHeaders.set('Content-Type', JSON_CONTENT_TYPE);
  }

  if (!requestHeaders.has('Authorization')) {
    const clinicianToken = getStoredClinicianToken();
    if (clinicianToken) {
      requestHeaders.set('Authorization', `Bearer ${clinicianToken}`);
    }
  }

  const resolvedSignal = withAbortSignal(signal, controller);

  try {
    const response = await fetch(buildUrl(path, query), {
      ...requestInit,
      headers: requestHeaders,
      body: json !== undefined ? JSON.stringify(json) : body,
      signal: resolvedSignal,
    });

    if (!response.ok) {
      throw buildHttpError(response.status);
    }

    if (response.status === 204) {
      markSuccess(endpointPath);
      return undefined as T;
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes(JSON_CONTENT_TYPE)) {
      throw createAppError('Parse', 'Received an invalid response format from the server.');
    }

    try {
      const jsonData = (await response.json()) as T;
      markSuccess(endpointPath);
      return jsonData;
    } catch {
      throw createAppError('Parse', 'Could not read server response.');
    }
  } catch (error) {
    const appError = mapUnknownToAppError(error);
    if (
      appError.kind === 'HTTP' &&
      (appError.status === 401 || appError.status === 403) &&
      shouldClearClinicianSession(endpointPath)
    ) {
      clearStoredClinicianTokens({ emitEvent: true, reason: 'expired' });
    }
    markError(endpointPath, appError);
    throw appError;
  } finally {
    clearTimeout(timer);
  }
}
