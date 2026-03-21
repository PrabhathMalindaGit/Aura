import {
  getClinicianProfile,
  subscribeClinicianProfile,
  type ClinicianNotificationCueMode,
  type ClinicianNotificationPreferences,
  type ClinicianNotificationQuietHours,
} from './clinicianProfile';

export type NotificationPreferencesSnapshot = ClinicianNotificationPreferences;

let cachedSnapshot: NotificationPreferencesSnapshot | null = null;
let cachedSnapshotKey: string | null = null;

function buildSnapshot(
  notificationPreferences: ClinicianNotificationPreferences,
): NotificationPreferencesSnapshot {
  return {
    communication: {
      ...notificationPreferences.communication,
    },
    safety: {
      ...notificationPreferences.safety,
    },
    quietHours: {
      ...notificationPreferences.quietHours,
    },
  };
}

function timeToMinutes(value: string): number | null {
  if (!/^\d{2}:\d{2}$/.test(value)) {
    return null;
  }

  const [hours, minutes] = value.split(':').map((segment) => Number(segment));
  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  return hours * 60 + minutes;
}

export function getNotificationPreferences(): NotificationPreferencesSnapshot {
  const nextSnapshot = buildSnapshot(getClinicianProfile().notificationPreferences);
  const snapshotKey = JSON.stringify(nextSnapshot);

  if (cachedSnapshot && cachedSnapshotKey === snapshotKey) {
    return cachedSnapshot;
  }

  cachedSnapshot = nextSnapshot;
  cachedSnapshotKey = snapshotKey;
  return nextSnapshot;
}

export function subscribeNotificationPreferences(listener: () => void): () => void {
  return subscribeClinicianProfile(() => {
    getNotificationPreferences();
    listener();
  });
}

export function isQuietHoursActive(
  quietHours: ClinicianNotificationQuietHours,
  now: Date = new Date(),
): boolean {
  if (!quietHours.enabled) {
    return false;
  }

  const startMinutes = timeToMinutes(quietHours.startTime);
  const endMinutes = timeToMinutes(quietHours.endTime);
  if (startMinutes === null || endMinutes === null || startMinutes === endMinutes) {
    return false;
  }

  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  if (startMinutes < endMinutes) {
    return nowMinutes >= startMinutes && nowMinutes < endMinutes;
  }

  return nowMinutes >= startMinutes || nowMinutes < endMinutes;
}

export function resolveEffectiveNotificationCueMode(
  cueMode: ClinicianNotificationCueMode,
  quietHoursActive: boolean,
): ClinicianNotificationCueMode {
  return quietHoursActive ? 'reduced' : cueMode;
}

export function getMillisecondsUntilNextMinuteBoundary(now: Date = new Date()): number {
  const elapsedMs = now.getSeconds() * 1000 + now.getMilliseconds();
  return Math.max(1, 60_000 - elapsedMs);
}
