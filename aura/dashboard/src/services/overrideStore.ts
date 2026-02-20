import type { AlertItem } from '../types/models';

export interface RiskOverrideRecord {
  riskAuto: string;
  riskFinal: string;
  overrideReason: string;
  overriddenAtISO: string;
  overriddenBy: string;
  overriddenByName?: string;
}

export type RiskOverrideMap = Record<string, RiskOverrideRecord>;

const RISK_OVERRIDE_STORAGE_KEY = 'aura_risk_overrides_v1';
const MAX_OVERRIDE_ENTRIES = 2000;
const MAX_OVERRIDE_AGE_DAYS = 180;
const MAX_OVERRIDE_AGE_MS = MAX_OVERRIDE_AGE_DAYS * 24 * 60 * 60 * 1000;

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function isValidOverrideRecord(value: unknown): value is RiskOverrideRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Partial<RiskOverrideRecord>;
  return (
    typeof candidate.riskAuto === 'string' &&
    typeof candidate.riskFinal === 'string' &&
    typeof candidate.overrideReason === 'string' &&
    candidate.overrideReason.trim().length > 0 &&
    typeof candidate.overriddenAtISO === 'string' &&
    Number.isFinite(Date.parse(candidate.overriddenAtISO)) &&
    typeof candidate.overriddenBy === 'string' &&
    candidate.overriddenBy.trim().length > 0 &&
    (candidate.overriddenByName === undefined || typeof candidate.overriddenByName === 'string')
  );
}

function parseOverrideMap(raw: string | null): RiskOverrideMap {
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, RiskOverrideRecord] =>
          typeof entry[0] === 'string' && isValidOverrideRecord(entry[1]),
      ),
    );
  } catch {
    return {};
  }
}

function readOverrideMap(): RiskOverrideMap {
  if (!isBrowser()) {
    return {};
  }

  return parseOverrideMap(window.localStorage.getItem(RISK_OVERRIDE_STORAGE_KEY));
}

function writeOverrideMap(map: RiskOverrideMap): void {
  if (!isBrowser()) {
    return;
  }

  try {
    window.localStorage.setItem(RISK_OVERRIDE_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore write failures so risk review UI remains available.
  }
}

function pruneMap(map: RiskOverrideMap, nowMs: number = Date.now()): RiskOverrideMap {
  const cutoff = nowMs - MAX_OVERRIDE_AGE_MS;
  const recentEntries = Object.entries(map)
    .filter((entry) => Date.parse(entry[1].overriddenAtISO) >= cutoff)
    .sort((left, right) => Date.parse(right[1].overriddenAtISO) - Date.parse(left[1].overriddenAtISO))
    .slice(0, MAX_OVERRIDE_ENTRIES);

  return Object.fromEntries(recentEntries);
}

export function getRiskOverrideStorageKey(): string {
  return RISK_OVERRIDE_STORAGE_KEY;
}

export function pruneRiskOverrideMap(): RiskOverrideMap {
  const current = readOverrideMap();
  const pruned = pruneMap(current);
  writeOverrideMap(pruned);
  return pruned;
}

export function getRiskOverrideMap(): RiskOverrideMap {
  return pruneRiskOverrideMap();
}

export function replaceRiskOverrideMap(nextMap: RiskOverrideMap): RiskOverrideMap {
  const pruned = pruneMap(nextMap);
  writeOverrideMap(pruned);
  return pruned;
}

export function getRiskOverride(alertId: string): RiskOverrideRecord | undefined {
  if (!alertId) {
    return undefined;
  }

  return getRiskOverrideMap()[alertId];
}

export function setRiskOverride(alertId: string, override: RiskOverrideRecord): RiskOverrideMap {
  if (!alertId || !isValidOverrideRecord(override)) {
    return getRiskOverrideMap();
  }

  const next = readOverrideMap();
  next[alertId] = override;
  return replaceRiskOverrideMap(next);
}

export function clearRiskOverride(alertId: string): RiskOverrideMap {
  if (!alertId) {
    return getRiskOverrideMap();
  }

  const next = readOverrideMap();
  delete next[alertId];
  return replaceRiskOverrideMap(next);
}

export function applyRiskOverrideToAlert(alert: AlertItem, map: RiskOverrideMap): AlertItem {
  const override = map[alert._id];
  if (!override) {
    return alert;
  }

  return {
    ...alert,
    riskAuto: override.riskAuto,
    riskFinal: override.riskFinal,
    overrideReason: override.overrideReason,
    overriddenAt: override.overriddenAtISO,
    overriddenBy: override.overriddenBy,
    overriddenByName: override.overriddenByName,
  };
}

export function applyRiskOverrides(alerts: AlertItem[], map: RiskOverrideMap): AlertItem[] {
  return alerts.map((alert) => applyRiskOverrideToAlert(alert, map));
}

export function clearRiskOverrideStoreForTests(): void {
  if (!isBrowser()) {
    return;
  }

  try {
    window.localStorage.removeItem(RISK_OVERRIDE_STORAGE_KEY);
  } catch {
    // Ignore test helper cleanup failures.
  }
}
