export const BREAKPOINTS = {
  sm: 600,
  md: 900,
  lg: 1200,
} as const;

export const MEDIA_QUERIES = {
  smDown: `(max-width: ${BREAKPOINTS.sm}px)`,
  mdDown: `(max-width: ${BREAKPOINTS.md}px)`,
  lgDown: `(max-width: ${BREAKPOINTS.lg}px)`,
} as const;
