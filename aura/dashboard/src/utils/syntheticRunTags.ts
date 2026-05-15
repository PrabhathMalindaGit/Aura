const KNOWN_SYNTHETIC_RUN_TAG_PATTERN =
  /\[(?:aura-n8n-provider-send-all|aura-n8n-workflow-suite|AURA_LATENCY_BENCH|AURA_N8N_TELEGRAM_RUNTIME):[A-Za-z0-9][A-Za-z0-9._-]{0,127}\]\s*/gi;

const KNOWN_SYNTHETIC_EVIDENCE_TOKEN_PATTERN =
  /\bAURA_N8N_WORKFLOW_SUITE_SYNTHETIC\b/g;

const AURA_LATENCY_BENCHMARK_MARKER = /\bAURA_LATENCY_BENCH:/i;

export function sanitizeDashboardPreviewText(
  value: string | null | undefined,
): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .replace(KNOWN_SYNTHETIC_RUN_TAG_PATTERN, '')
    .replace(KNOWN_SYNTHETIC_EVIDENCE_TOKEN_PATTERN, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function containsAuraLatencyBenchmarkMarker(
  value: string | null | undefined,
): boolean {
  return typeof value === 'string' && AURA_LATENCY_BENCHMARK_MARKER.test(value);
}

