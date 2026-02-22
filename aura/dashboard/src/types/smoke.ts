export type SmokeCheckKey = 'health' | 'alerts' | 'context' | 'patients' | 'trends';

export type SmokeStatus = 'PASS' | 'FAIL' | 'EMPTY' | 'NOT_READY';

export type SmokeFailureKind = 'Timeout' | 'Network' | 'HTTP' | 'Parse' | 'Unknown';

export interface SmokeCheckResult {
  key: SmokeCheckKey;
  name: string;
  endpoint: string;
  status: SmokeStatus;
  httpCode?: number;
  latencyMs: number | null;
  message: string;
  developerHint?: string;
  curlCommand: string;
}
