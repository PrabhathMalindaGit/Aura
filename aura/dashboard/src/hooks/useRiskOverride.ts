import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AlertItem } from '../types/models';
import { asAppError, toUserMessage } from '../utils/errors';
import { isRiskChanged } from '../utils/risk';
import {
  applyRiskOverrideToAlert,
  applyRiskOverrides,
  clearRiskOverride,
  getRiskOverrideMap,
  getRiskOverrideStorageKey,
  pruneRiskOverrideMap,
  replaceRiskOverrideMap,
  setRiskOverride,
  type RiskOverrideMap,
} from '../services/overrideStore';
import { clearAlertRiskOverride, overrideAlertRisk } from '../services/clinicianApi';

const OVERRIDE_PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000;

interface UseRiskOverrideArgs {
  clinicianId: string;
  clinicianName: string;
}

interface OverrideMutationResult {
  ok: boolean;
  message?: string;
}

export interface UseRiskOverrideResult {
  overrideMap: RiskOverrideMap;
  overrideError: string | null;
  overrideBusy: boolean;
  applyAlertOverrides: (alerts: AlertItem[]) => AlertItem[];
  applyAlertOverride: (alert: AlertItem) => AlertItem;
  saveOverride: (
    alert: AlertItem,
    payload: { riskFinal: string; overrideReason?: string },
  ) => Promise<OverrideMutationResult>;
  clearOverride: (alert: AlertItem) => Promise<OverrideMutationResult>;
  clearOverrideError: () => void;
}

function toSnapshot(map: RiskOverrideMap): RiskOverrideMap {
  return { ...map };
}

export function useRiskOverride({
  clinicianId,
  clinicianName,
}: UseRiskOverrideArgs): UseRiskOverrideResult {
  const [overrideMap, setOverrideMap] = useState<RiskOverrideMap>(() => getRiskOverrideMap());
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const [overrideBusy, setOverrideBusy] = useState(false);

  useEffect(() => {
    setOverrideMap(pruneRiskOverrideMap());

    if (typeof window === 'undefined') {
      return;
    }

    const storageKey = getRiskOverrideStorageKey();
    const onStorage = (event: StorageEvent): void => {
      if (event.key === storageKey) {
        setOverrideMap(getRiskOverrideMap());
      }
    };

    const pruneInterval = window.setInterval(() => {
      setOverrideMap(pruneRiskOverrideMap());
    }, OVERRIDE_PRUNE_INTERVAL_MS);

    window.addEventListener('storage', onStorage);
    return () => {
      window.clearInterval(pruneInterval);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const applyAlertOverrides = useCallback(
    (alerts: AlertItem[]): AlertItem[] => applyRiskOverrides(alerts, overrideMap),
    [overrideMap],
  );

  const applyAlertOverride = useCallback(
    (alert: AlertItem): AlertItem => applyRiskOverrideToAlert(alert, overrideMap),
    [overrideMap],
  );

  const saveOverride = useCallback(
    async (
      alert: AlertItem,
      payload: { riskFinal: string; overrideReason?: string },
    ): Promise<OverrideMutationResult> => {
      const previous = toSnapshot(overrideMap);
      const autoRisk = alert.riskAuto ?? alert.risk;
      const reason = payload.overrideReason?.trim() ?? '';
      const changed = isRiskChanged(autoRisk, payload.riskFinal);

      const optimistic = changed || reason
        ? setRiskOverride(alert._id, {
            riskAuto: autoRisk,
            riskFinal: payload.riskFinal,
            overrideReason: reason || 'Confirmed auto risk.',
            overriddenAtISO: new Date().toISOString(),
            overriddenBy: clinicianId,
            overriddenByName: clinicianName,
          })
        : clearRiskOverride(alert._id);

      setOverrideError(null);
      setOverrideBusy(true);
      setOverrideMap(optimistic);

      try {
        const saved = await overrideAlertRisk(alert._id, {
          riskAuto: autoRisk,
          riskFinal: payload.riskFinal,
          overrideReason: reason || undefined,
          overriddenBy: clinicianId,
          overriddenByName: clinicianName,
        });

        if (!saved) {
          setOverrideMap(clearRiskOverride(alert._id));
          setOverrideBusy(false);
          return { ok: true };
        }

        setOverrideMap(setRiskOverride(alert._id, saved));
        setOverrideBusy(false);
        return { ok: true };
      } catch (error) {
        setOverrideMap(replaceRiskOverrideMap(previous));
        const message = toUserMessage(asAppError(error));
        setOverrideError(message);
        setOverrideBusy(false);
        return { ok: false, message };
      }
    },
    [clinicianId, clinicianName, overrideMap],
  );

  const clearOverride = useCallback(
    async (alert: AlertItem): Promise<OverrideMutationResult> => {
      const previous = toSnapshot(overrideMap);
      const optimistic = clearRiskOverride(alert._id);

      setOverrideError(null);
      setOverrideBusy(true);
      setOverrideMap(optimistic);

      try {
        await clearAlertRiskOverride(alert._id);
        setOverrideMap(clearRiskOverride(alert._id));
        setOverrideBusy(false);
        return { ok: true };
      } catch (error) {
        setOverrideMap(replaceRiskOverrideMap(previous));
        const message = toUserMessage(asAppError(error));
        setOverrideError(message);
        setOverrideBusy(false);
        return { ok: false, message };
      }
    },
    [overrideMap],
  );

  const result = useMemo<UseRiskOverrideResult>(
    () => ({
      overrideMap,
      overrideError,
      overrideBusy,
      applyAlertOverrides,
      applyAlertOverride,
      saveOverride,
      clearOverride,
      clearOverrideError: () => setOverrideError(null),
    }),
    [
      applyAlertOverride,
      applyAlertOverrides,
      clearOverride,
      overrideBusy,
      overrideError,
      overrideMap,
      saveOverride,
    ],
  );

  return result;
}
