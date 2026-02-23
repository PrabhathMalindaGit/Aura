const REASON_LABELS: Record<string, string> = {
  PAIN_GE_THRESHOLD: "High pain level",
  CRISIS_LANGUAGE: "Safety concern in message",
  CHEST_PAIN: "Concerning symptom reported",
  SELF_HARM: "Self-harm concern",
};

export function reasonLabel(code: string): string {
  const normalized = code.trim();
  if (!normalized) {
    return code;
  }

  return REASON_LABELS[normalized] ?? normalized;
}

export function formatReasons(codes?: string[]): string[] {
  if (!codes || codes.length === 0) {
    return [];
  }

  return codes.map((code) => reasonLabel(code));
}
