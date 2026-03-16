import { describe, expect, it } from 'vitest';
import {
  notificationStatusBadgeVariant,
  notificationStatusLabel,
  resolveNotificationStatus,
  shouldShowNotificationRetry,
} from './notification';

describe('notification helpers', () => {
  it('maps status labels and badge variants correctly', () => {
    expect(notificationStatusLabel('sent')).toBe('Delivered');
    expect(notificationStatusLabel('failed')).toBe('Delivery failed');
    expect(notificationStatusLabel('skipped')).toBe('Delivery skipped');
    expect(notificationStatusLabel('unknown')).toBe('Delivery status unknown');

    expect(notificationStatusBadgeVariant('sent')).toBe('success');
    expect(notificationStatusBadgeVariant('failed')).toBe('danger');
    expect(notificationStatusBadgeVariant('skipped')).toBe('warning');
    expect(notificationStatusBadgeVariant('unknown')).toBe('default');
  });

  it('keeps unknown truthful and never marks it as success', () => {
    expect(resolveNotificationStatus(undefined)).toBe('unknown');
    expect(resolveNotificationStatus('unknown')).toBe('unknown');
    expect(notificationStatusLabel(undefined)).toBe('Delivery status unknown');
    expect(notificationStatusBadgeVariant(undefined)).toBe('default');
    expect(shouldShowNotificationRetry(undefined)).toBe(false);
    expect(notificationStatusLabel(undefined)).not.toBe('Delivered');
  });
});
