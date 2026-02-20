/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_SESSION_SETTINGS,
  getSessionSettings,
  getSessionSettingsStorageKey,
  setSessionSettings,
} from './sessionSettings';

describe('sessionSettings', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('returns defaults when storage is missing or invalid', () => {
    expect(getSessionSettings()).toEqual(DEFAULT_SESSION_SETTINGS);

    window.localStorage.setItem(getSessionSettingsStorageKey(), '{bad json');
    expect(getSessionSettings()).toEqual(DEFAULT_SESSION_SETTINGS);

    window.localStorage.setItem(getSessionSettingsStorageKey(), JSON.stringify({ idleMinutes: -5 }));
    expect(getSessionSettings().idleMinutes).toBe(DEFAULT_SESSION_SETTINGS.idleMinutes);
  });

  it('stores and retrieves settings safely', () => {
    const updated = setSessionSettings({
      enabled: true,
      idleMinutes: 10,
      absoluteHours: 4,
      warningSeconds: 45,
    });

    expect(updated.enabled).toBe(true);
    expect(updated.idleMinutes).toBe(10);
    expect(updated.absoluteHours).toBe(4);
    expect(updated.warningSeconds).toBe(45);

    const roundTrip = getSessionSettings();
    expect(roundTrip.idleMinutes).toBe(10);
    expect(roundTrip.absoluteHours).toBe(4);
    expect(roundTrip.warningSeconds).toBe(45);
    expect(roundTrip.absoluteWarningSeconds).toBe(DEFAULT_SESSION_SETTINGS.absoluteWarningSeconds);
  });
});
