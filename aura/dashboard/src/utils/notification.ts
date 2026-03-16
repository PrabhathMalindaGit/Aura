import type { AlertItem } from '../types/models';
import { truncateText } from './text';

export type NotificationStatus = NonNullable<AlertItem['notificationStatus']>;

export const NOTIFICATION_RETRY_ENABLED = false;

const KNOWN_NOTIFICATION_STATUSES: NotificationStatus[] = ['sent', 'failed', 'skipped', 'unknown'];

export function resolveNotificationStatus(status: AlertItem['notificationStatus']): NotificationStatus {
  if (status && KNOWN_NOTIFICATION_STATUSES.includes(status)) {
    return status;
  }

  return 'unknown';
}

export function notificationStatusLabel(status: AlertItem['notificationStatus']): string {
  const normalized = resolveNotificationStatus(status);

  if (normalized === 'sent') {
    return 'Delivered';
  }

  if (normalized === 'failed') {
    return 'Delivery failed';
  }

  if (normalized === 'skipped') {
    return 'Delivery skipped';
  }

  return 'Delivery status unknown';
}

export function notificationStatusBadgeVariant(
  status: AlertItem['notificationStatus'],
): 'default' | 'success' | 'warning' | 'danger' {
  const normalized = resolveNotificationStatus(status);

  if (normalized === 'sent') {
    return 'success';
  }

  if (normalized === 'failed') {
    return 'danger';
  }

  if (normalized === 'skipped') {
    return 'warning';
  }

  return 'default';
}

export function shouldShowNotificationRetry(status: AlertItem['notificationStatus']): boolean {
  return resolveNotificationStatus(status) === 'failed';
}

export function notificationChannelLabel(channel: AlertItem['notificationChannel']): string {
  if (!channel || channel === 'none') {
    return '—';
  }

  if (channel === 'sms') {
    return 'SMS';
  }

  return channel[0].toUpperCase() + channel.slice(1);
}

export function alertSourceLabel(sourceType: AlertItem['source']['type']): string {
  if (sourceType === 'checkin') {
    return 'Check-in';
  }

  if (sourceType === 'chat') {
    return 'Chat';
  }

  return sourceType;
}

export function alertStatusLabel(status: AlertItem['status']): string {
  if (status === 'acknowledged') {
    return 'Acknowledged';
  }

  if (status === 'resolved') {
    return 'Resolved';
  }

  return 'Open';
}

export function shortReferenceLabel(value: string | undefined, prefix: string = 'Ref'): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  const shortValue = trimmed.length > 8 ? trimmed.slice(0, 8) : trimmed;
  return `${prefix} ${shortValue}`;
}

export function toSafeNotificationError(value: string | undefined, maxLength: number = 200): string | undefined {
  const trimmed = value?.replace(/\s+/g, ' ').trim();
  if (!trimmed) {
    return undefined;
  }

  return truncateText(trimmed, maxLength).text;
}
