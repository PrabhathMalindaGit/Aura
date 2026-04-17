export const DASHBOARD_V2_MOTION_DURATION = {
  fast: 120,
  base: 180,
  slow: 260,
} as const;

export function getDashboardV2MotionDuration(
  prefersReducedMotion: boolean,
  duration: keyof typeof DASHBOARD_V2_MOTION_DURATION = 'base',
): number {
  return prefersReducedMotion ? 0 : DASHBOARD_V2_MOTION_DURATION[duration];
}
