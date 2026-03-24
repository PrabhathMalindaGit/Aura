import { useCallback, useEffect, useMemo, useState } from "react";

import type { LastErrorRecord } from "@/src/state/lastError";
import { useNetwork } from "@/src/state/network";
import { getPendingPhotoUploads } from "@/src/state/pendingPhotoUploads";
import { getPendingPromSubmissions } from "@/src/state/pendingPromSubmissions";
import { getPending } from "@/src/state/pendingSessions";
import { getPendingWearablesSync } from "@/src/state/pendingWearablesSync";
import { useSyncSummary } from "@/src/sync/selectors";

const SERVER_DOWN_WINDOW_MS = 5 * 60 * 1000;
const REFRESH_INTERVAL_MS = 30 * 1000;

export type TrustStatusKind =
  | "offline"
  | "serverDown"
  | "syncing"
  | "attention"
  | "ok";

export type TrustStatus = {
  kind: TrustStatusKind;
  pendingCount: number;
  failedCount: number;
};

type UseTrustStatusOptions = {
  patientId?: string;
  pendingCountOverride?: number;
  errorRecords?: Array<LastErrorRecord | null | undefined>;
  includePendingSync?: boolean;
  serverDownWindowMs?: number;
};

type LegacyPendingSummary = {
  pendingCount: number;
};

async function loadLegacyPendingSummary(
  patientId: string
): Promise<LegacyPendingSummary> {
  const [pendingSessions, pendingProms, pendingPhotos, pendingWearables] =
    await Promise.all([
      getPending(patientId),
      getPendingPromSubmissions(patientId),
      getPendingPhotoUploads(patientId),
      getPendingWearablesSync(patientId),
    ]);

  return {
    pendingCount:
      pendingSessions.length +
      pendingProms.length +
      pendingPhotos.length +
      pendingWearables.length,
  };
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

function useLegacyPendingSummary(
  patientId: string,
  enabled: boolean
): LegacyPendingSummary {
  const [summary, setSummary] = useState<LegacyPendingSummary>({
    pendingCount: 0,
  });

  const reload = useCallback(async () => {
    const trimmedPatientId = patientId.trim();
    if (!enabled || !trimmedPatientId) {
      setSummary((previous) =>
        previous.pendingCount === 0 ? previous : { pendingCount: 0 }
      );
      return;
    }

    try {
      const next = await loadLegacyPendingSummary(trimmedPatientId);
      setSummary((previous) =>
        previous.pendingCount === next.pendingCount ? previous : next
      );
    } catch {
      setSummary((previous) =>
        previous.pendingCount === 0 ? previous : { pendingCount: 0 }
      );
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

  return summary;
}

export function usePendingSyncSummary(
  patientId: string,
  enabled = true
): { pendingCount: number; failedCount: number; outstandingCount: number } {
  const shared = useSyncSummary(enabled ? patientId : "");
  const legacy = useLegacyPendingSummary(patientId, enabled);

  return useMemo(
    () => ({
      pendingCount: shared.totalPendingCount + legacy.pendingCount,
      failedCount: shared.totalFailedCount,
      outstandingCount: shared.totalOutstandingCount + legacy.pendingCount,
    }),
    [
      legacy.pendingCount,
      shared.totalFailedCount,
      shared.totalOutstandingCount,
      shared.totalPendingCount,
    ]
  );
}

export function useTrustStatus({
  patientId = "",
  pendingCountOverride,
  errorRecords = [],
  includePendingSync = true,
  serverDownWindowMs = SERVER_DOWN_WINDOW_MS,
}: UseTrustStatusOptions): TrustStatus {
  const network = useNetwork();
  const [now, setNow] = useState(() => Date.now());
  const shouldTrackServerWindow = useMemo(
    () => hasRecentServerFailure(errorRecords, Date.now(), serverDownWindowMs),
    [errorRecords, serverDownWindowMs]
  );
  const pendingSummary = usePendingSyncSummary(patientId, includePendingSync);

  useEffect(() => {
    if (!network.isOnline || !shouldTrackServerWindow) {
      return;
    }
    const timer = setInterval(() => {
      setNow(Date.now());
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [network.isOnline, shouldTrackServerWindow]);

  const pendingCount =
    includePendingSync &&
    typeof pendingCountOverride === "number" &&
    Number.isFinite(pendingCountOverride)
      ? Math.max(0, Math.trunc(pendingCountOverride))
      : includePendingSync
        ? pendingSummary.outstandingCount
        : 0;

  const failedCount = includePendingSync ? pendingSummary.failedCount : 0;

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
        failedCount,
      } satisfies TrustStatus;
    }

    if (serverDown) {
      return {
        kind: "serverDown",
        pendingCount,
        failedCount,
      } satisfies TrustStatus;
    }

    if (failedCount > 0) {
      return {
        kind: "attention",
        pendingCount,
        failedCount,
      } satisfies TrustStatus;
    }

    if (pendingCount > 0) {
      return {
        kind: "syncing",
        pendingCount,
        failedCount: 0,
      } satisfies TrustStatus;
    }

    return {
      kind: "ok",
      pendingCount: 0,
      failedCount: 0,
    } satisfies TrustStatus;
  }, [failedCount, network.isOffline, pendingCount, serverDown]);
}
