import { useMediaQuery } from './useMediaQuery';

export const PREFERS_REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export function usePrefersReducedMotion(): boolean {
  return useMediaQuery(PREFERS_REDUCED_MOTION_QUERY);
}
