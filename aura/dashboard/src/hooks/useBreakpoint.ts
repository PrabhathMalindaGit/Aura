import { useMediaQuery } from './useMediaQuery';

const MOBILE_QUERY = '(max-width: 899px)';
const TABLET_QUERY = '(min-width: 900px) and (max-width: 1199px)';
const DESKTOP_QUERY = '(min-width: 1200px)';

export interface BreakpointState {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
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

