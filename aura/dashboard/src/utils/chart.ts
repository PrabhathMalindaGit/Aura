export interface ChartAnimationConfig {
  isAnimationActive: boolean;
  animationDuration: number;
}

export function getChartAnimationConfig(prefersReducedMotion: boolean): ChartAnimationConfig {
  if (prefersReducedMotion) {
    return {
      isAnimationActive: false,
      animationDuration: 0,
    };
  }

  return {
    isAnimationActive: true,
    animationDuration: 720,
  };
}

export function mapMedicationToNumeric(value: boolean | null): number | null {
  if (value === null) {
    return null;
  }

  return value ? 1 : 0;
}

export function isJsdomRuntime(): boolean {
  return typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent);
}
