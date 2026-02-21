import type { AlertItem } from '../types/models';
import type { SeenAlertMap } from '../services/seenStore';
import { resolveNotificationStatus } from './notification';
import { isAlertUnseenForUi } from './seen';

const HOURS_24_MS = 24 * 60 * 60 * 1000;

export interface AlertKpiSummary {
  openCount: number;
  unseenCount: number;
  assignedToMeCount: number;
  notifFailedCount: number;
  overdueCount: number;
  createdLast24hCount: number;
}

export function computeAlertKpis(
  openAlerts: AlertItem[],
  seenAlertMap: SeenAlertMap,
  clinicianId: string,
  nowMs: number = Date.now(),
): AlertKpiSummary {
  const summary: AlertKpiSummary = {
    openCount: 0,
    unseenCount: 0,
    assignedToMeCount: 0,
    notifFailedCount: 0,
    overdueCount: 0,
    createdLast24hCount: 0,
  };

  openAlerts.forEach((alert) => {
    if (alert.status !== 'open') {
      return;
    }

    summary.openCount += 1;

    if (isAlertUnseenForUi(alert, seenAlertMap)) {
      summary.unseenCount += 1;
    }

    if (alert.assignedTo === clinicianId) {
      summary.assignedToMeCount += 1;
    }

    if (resolveNotificationStatus(alert.notificationStatus) === 'failed') {
      summary.notifFailedCount += 1;
    }

    const createdMs = Date.parse(alert.createdAt);
    if (Number.isFinite(createdMs)) {
      if (nowMs - createdMs <= HOURS_24_MS) {
        summary.createdLast24hCount += 1;
      }

      if (nowMs - createdMs > HOURS_24_MS) {
        summary.overdueCount += 1;
      }
    }
  });

  return summary;
}
