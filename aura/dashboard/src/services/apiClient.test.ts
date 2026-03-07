import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchJson, subscribeAuthRequired } from './apiClient';
import { createAppError, isRetryable } from '../utils/errors';

function readAuthorizationHeader(init: RequestInit | undefined): string | null {
  const headers = new Headers((init?.headers ?? {}) as HeadersInit);
  return headers.get('Authorization');
}

function toBase64Url(value: string): string {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function buildTokenWithExp(exp: number): string {
  const header = toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = toBase64Url(JSON.stringify({ exp }));
  return `${header}.${payload}.signature`;
}

describe('fetchJson', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    if (typeof window !== 'undefined') {
      window.localStorage.clear();
      window.sessionStorage.clear();
    }
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('parses JSON responses', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ ok: true, value: 42 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));

    const result = await fetchJson<{ ok: boolean; value: number }>('/clinician/alerts');

    expect(result).toEqual({ ok: true, value: 42 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('times out and returns AppError(kind="Timeout")', async () => {
    vi.useFakeTimers();

    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
        new Promise((_resolve, reject) => {
          const signal = init?.signal;
          if (!signal) {
            reject(new Error('Expected signal'));
            return;
          }

          signal.addEventListener(
            'abort',
            () => {
              reject(new DOMException('Aborted', 'AbortError'));
            },
            { once: true },
          );
        }),
    );

    const assertion = expect(fetchJson('/slow-endpoint', { timeoutMs: 25 })).rejects.toMatchObject({
      kind: 'Timeout',
    });
    await vi.advanceTimersByTimeAsync(30);

    await assertion;
  });

  it('maps HTTP 500 to AppError(kind="HTTP")', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: false }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(fetchJson('/clinician/alerts')).rejects.toMatchObject({
      kind: 'HTTP',
      status: 500,
    });
  });

  it('maps non-JSON success responses to AppError(kind="Parse")', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('plain-text-response', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      }),
    );

    await expect(fetchJson('/clinician/alerts')).rejects.toMatchObject({ kind: 'Parse' });
  });

  it('attaches Authorization from aura_access_token when header is missing', async () => {
    window.localStorage.setItem('aura_access_token', 'ACCESS_TOKEN');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await fetchJson('/clinician/patients', { method: 'GET' });

    const init = fetchMock.mock.calls[0]?.[1];
    expect(readAuthorizationHeader(init)).toBe('Bearer ACCESS_TOKEN');
  });

  it('prefers aura_access_token over legacy clinicianToken when both exist', async () => {
    window.localStorage.setItem('clinicianToken', 'LEGACY_TOKEN');
    window.localStorage.setItem('aura_access_token', 'ACCESS_TOKEN');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await fetchJson('/clinician/patients', { method: 'GET' });

    const init = fetchMock.mock.calls[0]?.[1];
    expect(readAuthorizationHeader(init)).toBe('Bearer ACCESS_TOKEN');
  });

  it('falls back to clinicianToken when modern keys are missing', async () => {
    window.localStorage.setItem('clinicianToken', 'LEGACY_TOKEN');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await fetchJson('/clinician/patients', { method: 'GET' });

    const init = fetchMock.mock.calls[0]?.[1];
    expect(readAuthorizationHeader(init)).toBe('Bearer LEGACY_TOKEN');
  });

  it('falls back to sessionStorage token when localStorage is empty', async () => {
    window.sessionStorage.setItem('aura_auth_token', 'SESSION_TOKEN');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await fetchJson('/clinician/patients', { method: 'GET' });

    const init = fetchMock.mock.calls[0]?.[1];
    expect(readAuthorizationHeader(init)).toBe('Bearer SESSION_TOKEN');
  });

  it('skips expired modern token and falls back to clinicianToken', async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    window.localStorage.setItem('aura_access_token', buildTokenWithExp(nowSeconds - 60));
    window.localStorage.setItem('clinicianToken', 'LEGACY_TOKEN');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await fetchJson('/clinician/patients', { method: 'GET' });

    const init = fetchMock.mock.calls[0]?.[1];
    expect(readAuthorizationHeader(init)).toBe('Bearer LEGACY_TOKEN');
    expect(window.localStorage.getItem('aura_access_token')).toBeNull();
  });

  it('does not override explicit Authorization header', async () => {
    window.localStorage.setItem('aura_access_token', 'ACCESS_TOKEN');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await fetchJson('/clinician/patients', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer EXPLICIT_TOKEN',
      },
    });

    const init = fetchMock.mock.calls[0]?.[1];
    expect(readAuthorizationHeader(init)).toBe('Bearer EXPLICIT_TOKEN');
  });

  it('clears tokens and emits auth-required event on clinician 401 response', async () => {
    window.localStorage.setItem('aura_access_token', 'ACCESS_TOKEN');
    const reasons: string[] = [];
    const unsubscribe = subscribeAuthRequired((reason) => {
      reasons.push(reason);
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: 'UNAUTHORIZED' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(fetchJson('/clinician/alerts')).rejects.toMatchObject({
      kind: 'HTTP',
      status: 401,
    });

    unsubscribe();
    expect(window.localStorage.getItem('aura_access_token')).toBeNull();
    expect(reasons).toContain('expired');
  });
});

describe('isRetryable', () => {
  it('returns true for network and timeout errors', () => {
    expect(isRetryable(createAppError('Network', 'network issue'))).toBe(true);
    expect(isRetryable(createAppError('Timeout', 'timeout'))).toBe(true);
  });

  it('returns true for HTTP 5xx and false otherwise', () => {
    expect(isRetryable(createAppError('HTTP', 'server', { status: 503 }))).toBe(true);
    expect(isRetryable(createAppError('HTTP', 'not found', { status: 404 }))).toBe(false);
    expect(isRetryable(createAppError('Parse', 'bad payload'))).toBe(false);
  });
});
