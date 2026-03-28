import { useMemo } from 'react';
import { useMediaQuery } from './useMediaQuery';

const MOBILE_QUERY = '(max-width: 899px)';
const TABLET_QUERY = '(min-width: 900px) and (max-width: 1199px)';
const DESKTOP_QUERY = '(min-width: 1200px)';
const SHELL_VIEWPORT_BP_MD_TOKEN = '--shell-viewport-bp-md';
const SHELL_VIEWPORT_BP_LG_TOKEN = '--shell-viewport-bp-lg';
const SHELL_VIEWPORT_BP_MD_FALLBACK = 1052;
const SHELL_VIEWPORT_BP_LG_FALLBACK = 1546;
const FRACTIONAL_PIXEL_EPSILON = 0.02;

export interface BreakpointState {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}

interface ShellViewportThresholds {
  tabletMin: number;
  desktopMin: number;
}

function readPixelToken(token: string, fallback: number): number {
  if (typeof window === 'undefined') {
    return fallback;
  }

  const rawValue = window.getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  const parsedValue = Number.parseFloat(rawValue);

  return Number.isFinite(parsedValue) ? parsedValue : fallback;
}

export function getShellViewportThresholds(): ShellViewportThresholds {
  return {
    tabletMin: readPixelToken(SHELL_VIEWPORT_BP_MD_TOKEN, SHELL_VIEWPORT_BP_MD_FALLBACK),
    desktopMin: readPixelToken(SHELL_VIEWPORT_BP_LG_TOKEN, SHELL_VIEWPORT_BP_LG_FALLBACK),
  };
}

function buildShellMediaQueries(thresholds: ShellViewportThresholds): {
  tablet: string;
  desktop: string;
} {
  const tabletMax = Math.max(thresholds.tabletMin, thresholds.desktopMin - FRACTIONAL_PIXEL_EPSILON);

  return {
    tablet: `(min-width: ${thresholds.tabletMin}px) and (max-width: ${tabletMax}px)`,
    desktop: `(min-width: ${thresholds.desktopMin}px)`,
  };
}

export function useBreakpoint(): BreakpointState {
  const isMobile = useMediaQuery(MOBILE_QUERY);
  const isTablet = useMediaQuery(TABLET_QUERY);
  const isDesktop = useMediaQuery(DESKTOP_QUERY);

  return {
    isMobile,
    isTablet,
    isDesktop,
  };
}

export function useShellBreakpoint(): BreakpointState {
  const queries = useMemo(() => buildShellMediaQueries(getShellViewportThresholds()), []);
  const isDesktop = useMediaQuery(queries.desktop);
  const matchesTabletRange = useMediaQuery(queries.tablet);
  const isTablet = !isDesktop && matchesTabletRange;
  const isMobile = !isDesktop && !matchesTabletRange;

  return {
    isMobile,
    isTablet,
    isDesktop,
  };
}
