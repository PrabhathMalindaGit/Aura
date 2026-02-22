import { useCallback, useEffect, useState } from 'react';

export type SidebarMode = 'expanded' | 'icon';

export const SIDEBAR_MODE_STORAGE_KEY = 'aura_sidebar_mode';

interface UseSidebarModeOptions {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}

interface UseSidebarModeResult {
  mode: SidebarMode;
  setMode: (mode: SidebarMode) => void;
  toggleMode: () => void;
}

function readStoredMode(): SidebarMode | null {
  try {
    const raw = window.localStorage.getItem(SIDEBAR_MODE_STORAGE_KEY);
    if (raw === 'expanded' || raw === 'icon') {
      return raw;
    }
  } catch {
    return null;
  }

  return null;
}

function writeStoredMode(mode: SidebarMode): void {
  try {
    window.localStorage.setItem(SIDEBAR_MODE_STORAGE_KEY, mode);
  } catch {
    // Ignore storage failures; mode still updates in memory.
  }
}

function getDefaultMode(isDesktop: boolean, isTablet: boolean): SidebarMode {
  if (isDesktop) {
    return 'expanded';
  }

  if (isTablet) {
    return 'icon';
  }

  return 'expanded';
}

export function useSidebarMode({
  isMobile,
  isTablet,
  isDesktop,
}: UseSidebarModeOptions): UseSidebarModeResult {
  const [mode, setModeState] = useState<SidebarMode>(() => getDefaultMode(isDesktop, isTablet));

  useEffect(() => {
    if (isMobile) {
      return;
    }

    const storedMode = readStoredMode();
    if (storedMode) {
      setModeState(storedMode);
      return;
    }

    setModeState(getDefaultMode(isDesktop, isTablet));
  }, [isDesktop, isMobile, isTablet]);

  const setMode = useCallback((nextMode: SidebarMode) => {
    setModeState(nextMode);
    writeStoredMode(nextMode);
  }, []);

  const toggleMode = useCallback(() => {
    setMode(mode === 'expanded' ? 'icon' : 'expanded');
  }, [mode, setMode]);

  return {
    mode,
    setMode,
    toggleMode,
  };
}

