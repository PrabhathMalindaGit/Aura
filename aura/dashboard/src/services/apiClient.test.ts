import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchJson } from './apiClient';
import { createAppError, isRetryable } from '../utils/errors';

describe('fetchJson', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
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
