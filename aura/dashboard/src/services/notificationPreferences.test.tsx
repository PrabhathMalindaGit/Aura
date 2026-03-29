/* @vitest-environment jsdom */

import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNotificationPreferences } from '../hooks/useNotificationPreferences';
import { clearClinicianProfileForTests, getClinicianProfile, setClinicianProfile } from './clinicianProfile';
import {
  getMillisecondsUntilNextMinuteBoundary,
  isQuietHoursActive,
} from './notificationPreferences';

function toBase64Url(value: string): string {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function buildToken(input: { sub: string; name?: string; exp?: number }): string {
  const header = toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = toBase64Url(
    JSON.stringify({
      sub: input.sub,
      name: input.name,
      exp: input.exp ?? Math.floor(Date.now() / 1000) + 60 * 60,
    }),
  );

  return `${header}.${payload}.signature`;
}

function signInAs(input: { sub: string; name?: string }): void {
  window.localStorage.setItem('aura_access_token', buildToken(input));
}

function NotificationPreferencesProbe(): JSX.Element {
  const preferences = useNotificationPreferences();

  return (
    <div>
      <span data-testid="quiet-hours-active">
        {preferences.quietHoursActive ? 'on' : 'off'}
      </span>
      <span data-testid="communication-cue-mode">
        {preferences.effectiveCommunicationCueMode}
      </span>
      <span data-testid="safety-cue-mode">{preferences.effectiveSafetyCueMode}</span>
    </div>
  );
}

describe('notificationPreferences helpers', () => {
  beforeEach(() => {
    vi.useRealTimers();
    window.localStorage.clear();
    window.sessionStorage.clear();
    clearClinicianProfileForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('evaluates normal and overnight quiet-hours windows truthfully', () => {
    expect(
      isQuietHoursActive(
        {
          enabled: false,
          startTime: '22:00',
          endTime: '07:00',
        },
        new Date(2026, 2, 21, 23, 0, 0),
      ),
    ).toBe(false);

    expect(
      isQuietHoursActive(
        {
          enabled: true,
          startTime: '13:00',
          endTime: '15:00',
        },
        new Date(2026, 2, 21, 14, 0, 0),
      ),
    ).toBe(true);
    expect(
      isQuietHoursActive(
        {
          enabled: true,
          startTime: '13:00',
          endTime: '15:00',
        },
        new Date(2026, 2, 21, 15, 0, 0),
      ),
    ).toBe(false);

    expect(
      isQuietHoursActive(
        {
          enabled: true,
          startTime: '22:00',
          endTime: '07:00',
        },
        new Date(2026, 2, 21, 22, 30, 0),
      ),
    ).toBe(true);
    expect(
      isQuietHoursActive(
        {
          enabled: true,
          startTime: '22:00',
          endTime: '07:00',
        },
        new Date(2026, 2, 22, 6, 59, 0),
      ),
    ).toBe(true);
    expect(
      isQuietHoursActive(
        {
          enabled: true,
          startTime: '22:00',
          endTime: '07:00',
        },
        new Date(2026, 2, 22, 7, 0, 0),
      ),
    ).toBe(false);

    expect(
      isQuietHoursActive(
        {
          enabled: true,
          startTime: '09:00',
          endTime: '09:00',
        },
        new Date(2026, 2, 21, 9, 0, 0),
      ),
    ).toBe(false);
  });

  it('computes minute-boundary delays without waking more often than needed', () => {
    expect(getMillisecondsUntilNextMinuteBoundary(new Date(2026, 2, 21, 21, 59, 0, 0))).toBe(
      60_000,
    );
    expect(
      getMillisecondsUntilNextMinuteBoundary(new Date(2026, 2, 21, 21, 59, 59, 250)),
    ).toBe(750);
  });

  it('rolls quiet-hours state at minute granularity and cleans up the timer on unmount', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 21, 21, 59, 30, 0));
    signInAs({ sub: 'auth-clinician-notification-hook', name: 'Dr Hook' });

    setClinicianProfile({
      ...getClinicianProfile(),
      notificationPreferences: {
        communication: { cueMode: 'default' },
        safety: { cueMode: 'default' },
        quietHours: {
          enabled: true,
          startTime: '22:00',
          endTime: '07:00',
        },
      },
    });

    const view = render(<NotificationPreferencesProbe />);

    expect(screen.getByTestId('quiet-hours-active')).toHaveTextContent('off');
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    await vi.advanceTimersByTimeAsync(60_000);

    expect(screen.getByTestId('quiet-hours-active')).toHaveTextContent('on');
    expect(screen.getByTestId('communication-cue-mode')).toHaveTextContent('reduced');
    expect(screen.getByTestId('safety-cue-mode')).toHaveTextContent('reduced');

    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
