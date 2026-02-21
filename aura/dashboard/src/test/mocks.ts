import { vi } from 'vitest';

export function createJsonResponse(body: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export function installMatchMediaMock(resolveMatches: (query: string) => boolean = () => false): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: resolveMatches(query),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

export function installResizeObserverMock(): void {
  class ResizeObserverMock {
    observe(): void {
      // noop
    }

    unobserve(): void {
      // noop
    }

    disconnect(): void {
      // noop
    }
  }

  Object.defineProperty(window, 'ResizeObserver', {
    configurable: true,
    writable: true,
    value: ResizeObserverMock,
  });
}

export function freezeTime(isoDateTime: string): void {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(isoDateTime));
}

export function restoreTime(): void {
  vi.useRealTimers();
}
