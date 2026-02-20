import type { AlertItem, RiskLevel } from '../types/models';

const KNOWN_RISK_LEVELS: RiskLevel[] = ['low', 'medium', 'high'];

export type RiskBadgeVariant = 'default' | 'success' | 'warning' | 'danger';

export function normalizeRisk(value: string | undefined | null): string {
  if (!value) {
    return '';
  }

  return value.trim().toLowerCase();
}

export function isKnownRiskLevel(value: string | undefined | null): value is RiskLevel {
  return KNOWN_RISK_LEVELS.includes(normalizeRisk(value) as RiskLevel);
}

export function toRiskOptions(
  autoRisk: string | undefined,
  currentFinalRisk?: string,
): Array<RiskLevel | string> {
  const options = new Set<string>(KNOWN_RISK_LEVELS);

  if (autoRisk) {
    options.add(normalizeRisk(autoRisk));
  }

  if (currentFinalRisk) {
    options.add(normalizeRisk(currentFinalRisk));
  }

  return Array.from(options).filter(Boolean);
}

export function formatRiskLabel(value: string | undefined | null): string {
  const normalized = normalizeRisk(value);
  if (!normalized) {
    return 'Unknown';
  }

  if (normalized === 'low') {
    return 'Low';
  }

  if (normalized === 'medium') {
    return 'Medium';
  }

  if (normalized === 'high') {
    return 'High';
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export function riskBadgeVariant(value: string | undefined | null): RiskBadgeVariant {
  const normalized = normalizeRisk(value);

  if (normalized === 'low') {
    return 'success';
  }

  if (normalized === 'medium') {
    return 'warning';
  }

  if (normalized === 'high') {
    return 'danger';
  }

  return 'default';
}

export function getAutoRisk(alert: AlertItem): string {
  return alert.riskAuto ?? alert.risk;
}

export function getEffectiveRisk(alert: AlertItem): string {
  return alert.riskFinal ?? getAutoRisk(alert);
}

export function isRiskChanged(autoRisk: string | undefined, finalRisk: string | undefined): boolean {
  if (!finalRisk) {
    return false;
  }

  return normalizeRisk(finalRisk) !== normalizeRisk(autoRisk);
}

export function isOverrideReasonRequired(autoRisk: string | undefined, finalRisk: string | undefined): boolean {
  return isRiskChanged(autoRisk, finalRisk);
}

export function hasRiskOverride(alert: AlertItem): boolean {
  return isRiskChanged(getAutoRisk(alert), alert.riskFinal);
}
