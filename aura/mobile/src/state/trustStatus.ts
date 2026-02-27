import { useCallback, useEffect, useMemo, useState } from "react";

import type { LastErrorRecord } from "@/src/state/lastError";
import { useNetwork } from "@/src/state/network";
import { getPendingHydration } from "@/src/state/pendingHydration";
import { getPendingMedicationLogs } from "@/src/state/pendingMedicationLogs";
import { getPendingNutrition } from "@/src/state/pendingNutrition";
import { getPendingPhotoUploads } from "@/src/state/pendingPhotoUploads";
import { getPendingPromSubmissions } from "@/src/state/pendingPromSubmissions";
import { getPending } from "@/src/state/pendingSessions";
import { getPendingWearablesSync } from "@/src/state/pendingWearablesSync";

const SERVER_DOWN_WINDOW_MS = 5 * 60 * 1000;
const REFRESH_INTERVAL_MS = 30 * 1000;

export type TrustStatusKind = "offline" | "serverDown" | "syncing" | "ok";

export type TrustStatus = {
  kind: TrustStatusKind;
  pendingCount: number;
};

type UseTrustStatusOptions = {
  patientId?: string;
  pendingCountOverride?: number;
  errorRecords?: Array<LastErrorRecord | null | undefined>;
  includePendingSync?: boolean;
  serverDownWindowMs?: number;
};

async function loadPendingSyncCount(patientId: string): Promise<number> {
  const [
    pendingSessions,
    pendingProms,
    pendingHydration,
    pendingNutrition,
    pendingMedication,
    pendingPhotos,
    pendingWearables,
  ] = await Promise.all([
    getPending(patientId),
    getPendingPromSubmissions(patientId),
    getPendingHydration(patientId),
    getPendingNutrition(patientId),
    getPendingMedicationLogs(patientId),
    getPendingPhotoUploads(patientId),
    getPendingWearablesSync(patientId),
  ]);

  return (
    pendingSessions.length +
    pendingProms.length +
    pendingHydration.length +
    pendingNutrition.length +
    pendingMedication.length +
    pendingPhotos.length +
    pendingWearables.length
  );
}

function hasRecentServerFailure(
  records: Array<LastErrorRecord | null | undefined>,
  now: number,
  windowMs: number
): boolean {
  return records.some((record) => {
    if (!record) {
      return false;
    }
    if (record.kind !== "network" && record.kind !== "server") {
      return false;
    }
    const age = now - record.at;
    return age >= 0 && age <= windowMs;
  });
}

export function usePendingSyncCount(
  patientId: string,
  enabled = true
): { pendingCount: number; reload: () => Promise<void> } {
  const [pendingCount, setPendingCount] = useState(0);

  const reload = useCallback(async () => {
    const trimmedPatientId = patientId.trim();
    if (!enabled || !trimmedPatientId) {
      setPendingCount((prev) => (prev === 0 ? prev : 0));
      return;
    }
    try {
      const total = await loadPendingSyncCount(trimmedPatientId);
      setPendingCount((prev) => (prev === total ? prev : total));
    } catch {
      setPendingCount((prev) => (prev === 0 ? prev : 0));
    }
  }, [enabled, patientId]);

  useEffect(() => {
    void reload();
    if (!enabled || !patientId.trim()) {
      return;
    }
    const timer = setInterval(() => {
      void reload();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [enabled, patientId, reload]);

  return { pendingCount, reload };
}

export function useTrustStatus({
  patientId = "",
  pendingCountOverride,
  errorRecords = [],
  includePendingSync = true,
  serverDownWindowMs = SERVER_DOWN_WINDOW_MS,
}: UseTrustStatusOptions): TrustStatus {
  const network = useNetwork();
  const shouldTrackServerWindow = useMemo(
    () => hasRecentServerFailure(errorRecords, Date.now(), serverDownWindowMs),
    [errorRecords, serverDownWindowMs]
  );
  const [now, setNow] = useState(() => Date.now());
  const shouldLoadPending =
    includePendingSync && typeof pendingCountOverride !== "number";
  const { pendingCount: pendingFromStore } = usePendingSyncCount(
    patientId,
    shouldLoadPending
  );

  useEffect(() => {
    if (!network.isOnline || !shouldTrackServerWindow) {
      return;
    }
    const timer = setInterval(() => {
      setNow(Date.now());
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [network.isOnline, shouldTrackServerWindow]);

  const pendingValue =
    typeof pendingCountOverride === "number" &&
    Number.isFinite(pendingCountOverride)
      ? pendingCountOverride
      : pendingFromStore;
  const pendingCount = Math.max(0, Math.trunc(pendingValue));

  const serverDown = useMemo(
    () =>
      network.isOnline &&
      hasRecentServerFailure(errorRecords, now, serverDownWindowMs),
    [errorRecords, network.isOnline, now, serverDownWindowMs]
  );

  return useMemo(() => {
    if (network.isOffline) {
      return {
        kind: "offline",
        pendingCount,
      };
    }

    if (serverDown) {
      return {
        kind: "serverDown",
        pendingCount,
      };
    }

    if (pendingCount > 0) {
      return {
        kind: "syncing",
        pendingCount,
      };
    }

    return {
      kind: "ok",
      pendingCount: 0,
    };
  }, [network.isOffline, pendingCount, serverDown]);
}
