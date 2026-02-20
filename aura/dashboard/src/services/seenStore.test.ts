/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearSeenStoreForTests,
  getSeenMap,
  getSeenStorageKey,
  isSeen,
  markSeen,
  pruneSeenMap,
} from './seenStore';

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('seenStore', () => {
  it('reads and writes seen timestamps safely', () => {
    expect(isSeen('alert-1')).toBe(false);

    const map = markSeen('alert-1', 'anon', '2026-02-20T10:00:00.000Z');

    expect(map['alert-1']).toBe('2026-02-20T10:00:00.000Z');
    expect(isSeen('alert-1')).toBe(true);
    expect(getSeenMap()['alert-1']).toBe('2026-02-20T10:00:00.000Z');
  });

  it('prunes entries older than 90 days and keeps most recent 1000', () => {
    const seed: Record<string, string> = {
      'old-alert': daysAgoIso(120),
    };

    for (let index = 0; index < 1005; index += 1) {
      seed[`recent-${index}`] = daysAgoIso(index % 30);
    }

    window.localStorage.setItem(getSeenStorageKey('anon'), JSON.stringify(seed));
    const pruned = pruneSeenMap('anon');

    expect(pruned['old-alert']).toBeUndefined();
    expect(Object.keys(pruned).length).toBe(1000);
    expect(pruned['recent-0']).toBeDefined();
  });

  it('uses per-user keying and anon fallback bucket', () => {
    markSeen('alert-anon');
    markSeen('alert-a', 'clinician-a');
    markSeen('alert-b', 'clinician-b');

    expect(isSeen('alert-anon')).toBe(true);
    expect(isSeen('alert-a')).toBe(false);
    expect(isSeen('alert-a', 'clinician-a')).toBe(true);
    expect(isSeen('alert-b', 'clinician-a')).toBe(false);
    expect(isSeen('alert-b', 'clinician-b')).toBe(true);
  });

  it('handles malformed JSON without throwing', () => {
    window.localStorage.setItem(getSeenStorageKey(), '{bad-json');
    expect(getSeenMap()).toEqual({});
  });

  it('clears bucketed storage for tests', () => {
    markSeen('alert-a', 'clinician-a');
    clearSeenStoreForTests('clinician-a');
    expect(getSeenMap('clinician-a')).toEqual({});
  });
});
