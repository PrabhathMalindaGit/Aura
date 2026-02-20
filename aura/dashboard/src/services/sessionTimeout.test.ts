/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSessionTimeoutManager, type SessionTimeoutReason, type SessionTimeoutWarning } from './sessionTimeout';
import { DEFAULT_SESSION_SETTINGS } from './sessionSettings';

describe('sessionTimeout manager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-20T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('enters idle warning window and logs out when countdown ends', () => {
    let latestWarning: SessionTimeoutWarning | null = null;
    let logoutReason: SessionTimeoutReason | null = null;

    const manager = createSessionTimeoutManager({
      config: {
        ...DEFAULT_SESSION_SETTINGS,
        idleMinutes: 1,
        warningSeconds: 10,
        absoluteHours: 12,
      },
      onWarningChange: (warning) => {
        latestWarning = warning;
      },
      onLogout: (reason) => {
        logoutReason = reason;
      },
    });

    manager.start();

    vi.advanceTimersByTime(50_000);
    expect(latestWarning?.kind).toBe('idle');
    expect(Math.ceil((latestWarning?.remainingMs ?? 0) / 1000)).toBeLessThanOrEqual(10);

    vi.advanceTimersByTime(10_000);
    expect(logoutReason).toBe('idle');
  });

  it('continueSession clears idle warning and resets deadline', () => {
    let latestWarning: SessionTimeoutWarning | null = null;

    const manager = createSessionTimeoutManager({
      config: {
        ...DEFAULT_SESSION_SETTINGS,
        idleMinutes: 1,
        warningSeconds: 10,
      },
      onWarningChange: (warning) => {
        latestWarning = warning;
      },
      onLogout: vi.fn(),
    });

    manager.start();

    vi.advanceTimersByTime(50_000);
    expect(latestWarning?.kind).toBe('idle');

    manager.continueSession();
    expect(latestWarning).toBeNull();

    vi.advanceTimersByTime(49_000);
    expect(latestWarning).toBeNull();

    vi.advanceTimersByTime(1_000);
    expect(latestWarning?.kind).toBe('idle');
  });

  it('absolute timeout warning appears regardless of activity', () => {
    let latestWarning: SessionTimeoutWarning | null = null;

    const manager = createSessionTimeoutManager({
      config: {
        ...DEFAULT_SESSION_SETTINGS,
        idleMinutes: 10,
        warningSeconds: 10,
        absoluteHours: 0.001,
        absoluteWarningSeconds: 2,
        activityDebounceSeconds: 0.1,
      },
      onWarningChange: (warning) => {
        latestWarning = warning;
      },
      onLogout: vi.fn(),
    });

    manager.start();

    vi.advanceTimersByTime(1_000);
    document.dispatchEvent(new Event('click'));
    vi.advanceTimersByTime(650);
    document.dispatchEvent(new Event('mousemove'));

    expect(latestWarning?.kind).toBe('absolute');
  });
});
