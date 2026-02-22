/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getThemeMode, getThemeStorageKey, initTheme, setThemeMode } from './theme';

interface MediaChangeListenerMap {
  [query: string]: Set<(event: MediaQueryListEvent) => void>;
}

interface MatchMediaController {
  setMatch: (query: string, nextValue: boolean) => void;
}

function installMatchMediaController(initialMatches: Record<string, boolean>): MatchMediaController {
  const matchesByQuery = new Map<string, boolean>(Object.entries(initialMatches));
  const listenersByQuery: MediaChangeListenerMap = {};

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => {
      if (!listenersByQuery[query]) {
        listenersByQuery[query] = new Set();
      }

      return {
        matches: matchesByQuery.get(query) ?? false,
        media: query,
        onchange: null,
        addListener: (callback: (event: MediaQueryListEvent) => void) => {
          listenersByQuery[query].add(callback);
        },
        removeListener: (callback: (event: MediaQueryListEvent) => void) => {
          listenersByQuery[query].delete(callback);
        },
        addEventListener: (_type: string, callback: (event: MediaQueryListEvent) => void) => {
          listenersByQuery[query].add(callback);
        },
        removeEventListener: (_type: string, callback: (event: MediaQueryListEvent) => void) => {
          listenersByQuery[query].delete(callback);
        },
        dispatchEvent: vi.fn(),
      };
    }),
  });

  return {
    setMatch: (query: string, nextValue: boolean) => {
      matchesByQuery.set(query, nextValue);
      const event = { matches: nextValue, media: query } as MediaQueryListEvent;
      listenersByQuery[query]?.forEach((listener) => listener(event));
    },
  };
}

describe('theme service', () => {
  const systemDarkQuery = '(prefers-color-scheme: dark)';

  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  it('defaults to system mode when storage is missing or invalid', () => {
    expect(getThemeMode()).toBe('system');

    window.localStorage.setItem(getThemeStorageKey(), 'unknown-value');
    expect(getThemeMode()).toBe('system');
  });

  it('setThemeMode("dark") stores preference and adds .dark class', () => {
    setThemeMode('dark');

    expect(window.localStorage.getItem(getThemeStorageKey())).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('setThemeMode("light") stores preference and removes .dark class', () => {
    document.documentElement.classList.add('dark');

    setThemeMode('light');

    expect(window.localStorage.getItem(getThemeStorageKey())).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('system mode reacts to prefers-color-scheme changes', () => {
    const controller = installMatchMediaController({
      [systemDarkQuery]: false,
    });

    window.localStorage.setItem(getThemeStorageKey(), 'system');
    initTheme();
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    controller.setMatch(systemDarkQuery, true);
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    controller.setMatch(systemDarkQuery, false);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});

