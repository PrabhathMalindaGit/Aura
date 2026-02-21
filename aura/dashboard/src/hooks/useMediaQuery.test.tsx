/* @vitest-environment jsdom */

import { act, cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMediaQuery } from './useMediaQuery';

function TestHarness({ query }: { query: string }): JSX.Element {
  const matches = useMediaQuery(query);
  return <span>{matches ? 'match' : 'no-match'}</span>;
}

describe('useMediaQuery', () => {
  let listeners: Array<(event: MediaQueryListEvent) => void> = [];
  let currentMatches = false;

  beforeEach(() => {
    listeners = [];
    currentMatches = false;

    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: currentMatches,
        media: query,
        onchange: null,
        addListener: (listener: (event: MediaQueryListEvent) => void) => {
          listeners.push(listener);
        },
        removeListener: (listener: (event: MediaQueryListEvent) => void) => {
          listeners = listeners.filter((entry) => entry !== listener);
        },
        addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
          listeners.push(listener);
        },
        removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
          listeners = listeners.filter((entry) => entry !== listener);
        },
        dispatchEvent: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('returns current match value and updates when media query changes', () => {
    currentMatches = true;

    render(<TestHarness query="(max-width: 900px)" />);

    expect(screen.getByText('match')).toBeInTheDocument();

    act(() => {
      currentMatches = false;
      listeners.forEach((listener) => {
        listener({ matches: false } as MediaQueryListEvent);
      });
    });

    expect(screen.getByText('no-match')).toBeInTheDocument();
  });
});
