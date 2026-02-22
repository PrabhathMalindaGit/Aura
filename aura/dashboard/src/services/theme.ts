export type ThemeMode = 'system' | 'light' | 'dark';

const THEME_STORAGE_KEY = 'aura_theme_mode';
const THEME_CHANGE_EVENT = 'aura:theme-mode-change';
const DARK_CLASS = 'dark';
const COLOR_SCHEME_QUERY = '(prefers-color-scheme: dark)';

let removeSystemListener: (() => void) | null = null;

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'system' || value === 'light' || value === 'dark';
}

function getSystemPrefersDark(): boolean {
  if (!isBrowser() || typeof window.matchMedia !== 'function') {
    return false;
  }

  return window.matchMedia(COLOR_SCHEME_QUERY).matches;
}

function applyThemeClass(prefersDark: boolean): void {
  if (!isBrowser()) {
    return;
  }

  document.documentElement.classList.toggle(DARK_CLASS, prefersDark);
}

function detachSystemListener(): void {
  if (!removeSystemListener) {
    return;
  }

  removeSystemListener();
  removeSystemListener = null;
}

function attachSystemListener(): void {
  if (!isBrowser() || typeof window.matchMedia !== 'function') {
    return;
  }

  const mediaQueryList = window.matchMedia(COLOR_SCHEME_QUERY);
  const onChange = (event: MediaQueryListEvent): void => {
    applyThemeClass(event.matches);
  };

  if (typeof mediaQueryList.addEventListener === 'function') {
    mediaQueryList.addEventListener('change', onChange);
    removeSystemListener = () => mediaQueryList.removeEventListener('change', onChange);
    return;
  }

  mediaQueryList.addListener(onChange);
  removeSystemListener = () => mediaQueryList.removeListener(onChange);
}

function applyMode(mode: ThemeMode): void {
  detachSystemListener();

  if (mode === 'dark') {
    applyThemeClass(true);
    return;
  }

  if (mode === 'light') {
    applyThemeClass(false);
    return;
  }

  applyThemeClass(getSystemPrefersDark());
  attachSystemListener();
}

function emitThemeChange(mode: ThemeMode): void {
  if (!isBrowser()) {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<ThemeMode>(THEME_CHANGE_EVENT, {
      detail: mode,
    }),
  );
}

export function getThemeStorageKey(): string {
  return THEME_STORAGE_KEY;
}

export function getThemeMode(): ThemeMode {
  if (!isBrowser()) {
    return 'system';
  }

  try {
    const storedValue = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemeMode(storedValue)) {
      return storedValue;
    }
  } catch {
    return 'system';
  }

  return 'system';
}

export function setThemeMode(mode: ThemeMode): ThemeMode {
  const nextMode: ThemeMode = isThemeMode(mode) ? mode : 'system';

  if (isBrowser()) {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextMode);
    } catch {
      // Ignore storage write failures and still apply theme in memory.
    }
  }

  applyMode(nextMode);
  emitThemeChange(nextMode);

  return nextMode;
}

export function initTheme(): ThemeMode {
  const mode = getThemeMode();
  applyMode(mode);
  return mode;
}

export function subscribeThemeMode(listener: (mode: ThemeMode) => void): () => void {
  if (!isBrowser()) {
    return () => {};
  }

  const onStorage = (event: StorageEvent): void => {
    if (event.key !== THEME_STORAGE_KEY) {
      return;
    }

    const mode = getThemeMode();
    applyMode(mode);
    listener(mode);
  };

  const onCustomEvent = (event: Event): void => {
    const customEvent = event as CustomEvent<ThemeMode>;
    const mode = isThemeMode(customEvent.detail) ? customEvent.detail : getThemeMode();
    listener(mode);
  };

  window.addEventListener('storage', onStorage);
  window.addEventListener(THEME_CHANGE_EVENT, onCustomEvent as EventListener);

  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(THEME_CHANGE_EVENT, onCustomEvent as EventListener);
  };
}

