import type { HTMLAttributes } from 'react';
import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

type AlertBannerVariant = 'info' | 'warning' | 'error' | 'success';

export interface AlertBannerProps extends HTMLAttributes<HTMLDivElement> {
  variant?: AlertBannerVariant;
  title: string;
  action?: ReactNode;
}

export function AlertBanner({
  className,
  variant = 'info',
  title,
  action,
  children,
  ...props
}: AlertBannerProps): JSX.Element {
  const role = variant === 'error' ? 'alert' : 'status';

  return (
    <div className={cn('alert-banner', `alert-banner--${variant}`, className)} role={role} {...props}>
      <div className="alert-banner__content">
        <strong className="alert-banner__title">{title}</strong>
        {children ? <p className="alert-banner__text">{children}</p> : null}
      </div>
      {action ? <div className="alert-banner__actions">{action}</div> : null}
    </div>
  );
}
