function formatMeta(meta?: Record<string, unknown>): string {
  if (!meta) {
    return "";
  }

  return ` ${JSON.stringify(meta)}`;
}

export const logger = {
  info(message: string, meta?: Record<string, unknown>): void {
    console.log(`[INFO] ${message}${formatMeta(meta)}`);
  },

  warn(message: string, meta?: Record<string, unknown>): void {
    console.warn(`[WARN] ${message}${formatMeta(meta)}`);
  },

  error(message: string, meta?: Record<string, unknown>): void {
    console.error(`[ERROR] ${message}${formatMeta(meta)}`);
  },
};
