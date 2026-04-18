import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { installMatchMediaMock, installResizeObserverMock } from './mocks';

beforeEach(() => {
  vi.useRealTimers();
  installMatchMediaMock();
  installResizeObserverMock();

  if (typeof window !== 'undefined' && typeof window.scrollTo !== 'function') {
    Object.defineProperty(window, 'scrollTo', {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
  }
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();

  if (typeof window !== 'undefined') {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.replaceState(null, '', '/');
  }
});
