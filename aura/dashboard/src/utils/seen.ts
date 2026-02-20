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
  // TODO(server): once alerts include seenAt/seenBy and PATCH /clinician/alerts/:id/seen exists,
  // replace local seenMap fallback with server-backed values (or hybrid optimistic sync).
  if (alert.status !== 'open') {
    return true;
  }

  return hasSeenMetadata(alert) || Boolean(seenMap[alert._id]);
}

export function isAlertUnseenForUi(alert: AlertItem, seenMap: SeenAlertMap): boolean {
  return alert.status === 'open' && !isAlertSeenForUi(alert, seenMap);
}
