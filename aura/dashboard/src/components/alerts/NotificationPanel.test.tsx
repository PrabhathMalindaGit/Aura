/* @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AlertItem } from '../../types/models';
import { NotificationPanel } from './NotificationPanel';

const baseAlert: AlertItem = {
  _id: 'alt-notif-1',
  patientId: 'patient-7',
  risk: 'high',
  reason: 'Escalating pain',
  source: { type: 'checkin', sourceId: 'check-7' },
  status: 'open',
  createdAt: '2026-02-20T10:00:00.000Z',
  updatedAt: '2026-02-20T10:05:00.000Z',
};

afterEach(() => {
  cleanup();
});

describe('NotificationPanel', () => {
  it('renders failed notification details with expandable safe error text', async () => {
    const user = userEvent.setup();
    const longError =
      'Telegram delivery timeout while contacting remote gateway with temporary interruption and retry suggestion that should be truncated in compact mode.';

    render(
      <NotificationPanel
        alert={{
          ...baseAlert,
          notificationChannel: 'telegram',
          notificationStatus: 'failed',
          notificationAttemptedAt: '2026-02-20T10:01:00.000Z',
          notificationFailedAt: '2026-02-20T10:01:10.000Z',
          notificationError: longError,
          notificationRetryCount: 2,
          notificationTarget: 'Clinician Group',
        }}
      />,
    );

    expect(screen.getByText('Notification')).toBeInTheDocument();
    expect(screen.getByText('Delivery failed')).toBeInTheDocument();
    expect(screen.getByText('Telegram')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry notification' })).toBeDisabled();

    const showMore = screen.getByRole('button', { name: 'Show more' });
    expect(showMore).toBeInTheDocument();

    await user.click(showMore);
    expect(screen.getByText(longError)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show less' })).toBeInTheDocument();
  });

  it('shows unknown tracking helper and no retry action for unknown', () => {
    render(<NotificationPanel alert={{ ...baseAlert, notificationStatus: 'unknown' }} onRetry={vi.fn()} />);

    expect(screen.getByText('Delivery status unknown')).toBeInTheDocument();
    expect(screen.getByText('Notification delivery not yet tracked. Add notificationStatus to backend alerts.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry notification' })).not.toBeInTheDocument();
  });
});
