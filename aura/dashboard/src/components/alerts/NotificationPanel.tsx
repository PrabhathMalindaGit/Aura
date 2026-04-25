import { useMemo, useState } from 'react';
import type { AlertItem } from '../../types/models';
import { formatExactTime } from '../../utils/time';
import { truncateText } from '../../utils/text';
import {
  notificationChannelLabel,
  resolveNotificationStatus,
  shouldShowNotificationRetry,
  toSafeNotificationError,
} from '../../utils/notification';
import { Button } from '../ui/Button';
import { NotificationStatusBadge } from './NotificationStatusBadge';

interface NotificationPanelProps {
  alert: AlertItem;
  compact?: boolean;
  retryEnabled?: boolean;
  busy?: boolean;
  onRetry?: () => void;
}

function renderTimestamp(value: string | undefined): JSX.Element | string {
  if (!value) {
    return '—';
  }

  return (
    <time dateTime={value} title={value}>
      {formatExactTime(value)}
    </time>
  );
}

export function NotificationPanel({
  alert,
  compact = false,
  retryEnabled = true,
  busy = false,
  onRetry,
}: NotificationPanelProps): JSX.Element {
  const [showFullError, setShowFullError] = useState(false);

  const status = resolveNotificationStatus(alert.notificationStatus);
  const retryVisible = shouldShowNotificationRetry(status) && Boolean(onRetry);
  const retryDisabled = !retryEnabled || busy;

  const safeError = useMemo(
    () => toSafeNotificationError(alert.notificationError, 320),
    [alert.notificationError],
  );
  const truncatedError = useMemo(
    () => (safeError ? truncateText(safeError, 140) : undefined),
    [safeError],
  );

  const awaitingConfirmation =
    status === 'unknown' &&
    !alert.notificationSentAt &&
    !alert.notificationFailedAt;
  const gridClassName = compact
    ? 'notification-panel__grid notification-panel__grid--compact'
    : 'notification-panel__grid';

  return (
    <section className="drawer-section" aria-label="Notification status">
      <h3>Notification</h3>

      <dl className={gridClassName}>
        <div>
          <dt>Channel</dt>
          <dd>{notificationChannelLabel(alert.notificationChannel)}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>
            <NotificationStatusBadge status={status} />
          </dd>
        </div>
        <div>
          <dt>Attempted</dt>
          <dd>{renderTimestamp(alert.notificationAttemptedAt)}</dd>
        </div>
        {compact ? null : (
          <>
            <div>
              <dt>Sent</dt>
              <dd>{renderTimestamp(alert.notificationSentAt)}</dd>
            </div>
            <div>
              <dt>Failed</dt>
              <dd>{renderTimestamp(alert.notificationFailedAt)}</dd>
            </div>
            <div>
              <dt>Target</dt>
              <dd>{alert.notificationTarget ?? '—'}</dd>
            </div>
            <div>
              <dt>Message ID</dt>
              <dd>{alert.notificationMessageId ?? '—'}</dd>
            </div>
            <div>
              <dt>Retry count</dt>
              <dd>{typeof alert.notificationRetryCount === 'number' ? String(alert.notificationRetryCount) : '—'}</dd>
            </div>
          </>
        )}
      </dl>

      {awaitingConfirmation ? (
        <p className="muted-text">
          Delivery is still waiting for confirmation from the notification workflow.
        </p>
      ) : null}

      {safeError ? (
        <div className="notification-panel__error">
          <strong>Last error</strong>
          <p>{showFullError || !truncatedError?.truncated ? safeError : truncatedError.text}</p>
          {truncatedError?.truncated ? (
            <Button
              variant="ghost"
              className="notification-panel__toggle"
              onClick={() => setShowFullError((current) => !current)}
              aria-expanded={showFullError}
            >
              {showFullError ? 'Show less' : 'Show more'}
            </Button>
          ) : null}
        </div>
      ) : null}

      {retryVisible ? (
        <div className="drawer-inline-actions">
          <Button
            variant="secondary"
            onClick={() => onRetry?.()}
            disabled={retryDisabled}
          >
            Retry notification
          </Button>
        </div>
      ) : null}
    </section>
  );
}
