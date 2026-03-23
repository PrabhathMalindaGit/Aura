import type { AlertItem } from '../types/models';
import type { SeenAlertMap } from '../services/seenStore';

export function hasSeenMetadata(alert: AlertItem): boolean {
  if (alert.seenAt) {
    return true;
  }

  if (Array.isArray(alert.seenBy) && alert.seenBy.length > 0) {
    return true;
  }

  return false;
}

export function isAlertSeenForUi(alert: AlertItem, seenMap: SeenAlertMap): boolean {
  if (alert.status !== 'open') {
    return true;
  }

  // Server seen metadata is the primary truth; the local map only bridges optimistic/same-tab UI state.
  return hasSeenMetadata(alert) || Boolean(seenMap[alert._id]);
}

export function isAlertUnseenForUi(alert: AlertItem, seenMap: SeenAlertMap): boolean {
  return alert.status === 'open' && !isAlertSeenForUi(alert, seenMap);
}
