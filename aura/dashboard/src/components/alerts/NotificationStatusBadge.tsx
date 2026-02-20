import type { HTMLAttributes } from 'react';
import type { AlertItem } from '../../types/models';
import { Badge } from '../ui/Badge';
import {
  notificationStatusBadgeVariant,
  notificationStatusLabel,
  resolveNotificationStatus,
} from '../../utils/notification';

interface NotificationStatusBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  status: AlertItem['notificationStatus'];
}

export function NotificationStatusBadge({ status, ...props }: NotificationStatusBadgeProps): JSX.Element {
  const normalized = resolveNotificationStatus(status);
  const label = notificationStatusLabel(normalized);

  return (
    <Badge
      variant={notificationStatusBadgeVariant(normalized)}
      icon={normalized === 'sent' || normalized === 'failed'}
      aria-label={label}
      {...props}
    >
      {label}
    </Badge>
  );
}
