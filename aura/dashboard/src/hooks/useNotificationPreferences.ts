import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  getMillisecondsUntilNextMinuteBoundary,
  getNotificationPreferences,
  isQuietHoursActive,
  resolveEffectiveNotificationCueMode,
  subscribeNotificationPreferences,
  type NotificationPreferencesSnapshot,
} from '../services/notificationPreferences';
import type { ClinicianNotificationCueMode } from '../services/clinicianProfile';

export interface RuntimeNotificationPreferences extends NotificationPreferencesSnapshot {
  quietHoursActive: boolean;
  effectiveCommunicationCueMode: ClinicianNotificationCueMode;
  effectiveSafetyCueMode: ClinicianNotificationCueMode;
}

export function useNotificationPreferences(): RuntimeNotificationPreferences {
  const snapshot = useSyncExternalStore(
    subscribeNotificationPreferences,
    getNotificationPreferences,
    getNotificationPreferences,
  );
  const [minuteAnchor, setMinuteAnchor] = useState(() => Date.now());

  useEffect(() => {
    setMinuteAnchor(Date.now());
  }, [snapshot.quietHours.enabled, snapshot.quietHours.startTime, snapshot.quietHours.endTime]);

  useEffect(() => {
    if (typeof window === 'undefined' || !snapshot.quietHours.enabled) {
      return;
    }

    let timeoutId: number | null = null;

    const scheduleNextTick = (): void => {
      timeoutId = window.setTimeout(() => {
        setMinuteAnchor(Date.now());
        scheduleNextTick();
      }, getMillisecondsUntilNextMinuteBoundary(new Date()));
    };

    scheduleNextTick();

    return () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [snapshot.quietHours.enabled, snapshot.quietHours.startTime, snapshot.quietHours.endTime]);

  const quietHoursActive = useMemo(
    () => isQuietHoursActive(snapshot.quietHours, new Date(minuteAnchor)),
    [minuteAnchor, snapshot.quietHours],
  );

  return useMemo(
    () => ({
      ...snapshot,
      quietHoursActive,
      effectiveCommunicationCueMode: resolveEffectiveNotificationCueMode(
        snapshot.communication.cueMode,
        quietHoursActive,
      ),
      effectiveSafetyCueMode: resolveEffectiveNotificationCueMode(
        snapshot.safety.cueMode,
        quietHoursActive,
      ),
    }),
    [quietHoursActive, snapshot],
  );
}
