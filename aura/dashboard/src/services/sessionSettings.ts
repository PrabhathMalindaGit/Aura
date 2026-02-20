import { SESSION_SETTINGS_STORAGE_KEY } from '../utils/storageKeys';

export interface SessionSettings {
  enabled: boolean;
  idleMinutes: number;
  warningSeconds: number;
  absoluteHours: number;
  absoluteWarningSeconds: number;
  activityDebounceSeconds: number;
}

export interface SessionSettingsUpdate {
  enabled?: boolean;
  idleMinutes?: number;
  warningSeconds?: number;
  absoluteHours?: number;
  absoluteWarningSeconds?: number;
  activityDebounceSeconds?: number;
}

const SESSION_SETTINGS_EVENT = 'aura:session-settings-change';

export const DEFAULT_SESSION_SETTINGS: SessionSettings = {
  enabled: true,
  idleMinutes: 15,
  warningSeconds: 60,
  absoluteHours: 8,
  absoluteWarningSeconds: 5 * 60,
  activityDebounceSeconds: 5,
};

function asPositiveNumber(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }

  return value;
}

function normalizeSettings(value: unknown): SessionSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DEFAULT_SESSION_SETTINGS };
  }

  const candidate = value as SessionSettingsUpdate;

  return {
    enabled:
      typeof candidate.enabled === 'boolean'
        ? candidate.enabled
        : DEFAULT_SESSION_SETTINGS.enabled,
    idleMinutes: asPositiveNumber(candidate.idleMinutes, DEFAULT_SESSION_SETTINGS.idleMinutes),
    warningSeconds: asPositiveNumber(candidate.warningSeconds, DEFAULT_SESSION_SETTINGS.warningSeconds),
    absoluteHours: asPositiveNumber(candidate.absoluteHours, DEFAULT_SESSION_SETTINGS.absoluteHours),
    absoluteWarningSeconds: asPositiveNumber(
      candidate.absoluteWarningSeconds,
      DEFAULT_SESSION_SETTINGS.absoluteWarningSeconds,
    ),
    activityDebounceSeconds: asPositiveNumber(
      candidate.activityDebounceSeconds,
      DEFAULT_SESSION_SETTINGS.activityDebounceSeconds,
    ),
  };
}

function readRawSettings(): unknown {
  if (typeof window === 'undefined') {
    return undefined;
  }

  try {
    const raw = window.localStorage.getItem(SESSION_SETTINGS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

function emitSettingsChange(settings: SessionSettings): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<SessionSettings>(SESSION_SETTINGS_EVENT, {
      detail: settings,
    }),
  );
}

export function getSessionSettingsStorageKey(): string {
  return SESSION_SETTINGS_STORAGE_KEY;
}

export function getSessionSettings(): SessionSettings {
  return normalizeSettings(readRawSettings());
}

export function setSessionSettings(update: SessionSettingsUpdate): SessionSettings {
  const current = getSessionSettings();
  const merged = normalizeSettings({ ...current, ...update });

  if (typeof window === 'undefined') {
    return merged;
  }

  try {
    window.localStorage.setItem(SESSION_SETTINGS_STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // Ignore write failures and continue using in-memory settings.
  }

  emitSettingsChange(merged);
  return merged;
}

export function subscribeSessionSettings(listener: (settings: SessionSettings) => void): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const onStorage = (event: StorageEvent): void => {
    if (event.key !== SESSION_SETTINGS_STORAGE_KEY) {
      return;
    }

    listener(getSessionSettings());
  };

  const onCustomEvent = (event: Event): void => {
    const customEvent = event as CustomEvent<SessionSettings>;
    listener(customEvent.detail ?? getSessionSettings());
  };

  window.addEventListener('storage', onStorage);
  window.addEventListener(SESSION_SETTINGS_EVENT, onCustomEvent as EventListener);

  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(SESSION_SETTINGS_EVENT, onCustomEvent as EventListener);
  };
}
