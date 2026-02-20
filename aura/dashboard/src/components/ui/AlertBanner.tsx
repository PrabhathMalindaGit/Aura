import type { HTMLAttributes } from 'react';
import { cn } from '../../utils/cn';

type AlertBannerVariant = 'info' | 'warning' | 'error' | 'success';

export interface AlertBannerProps extends HTMLAttributes<HTMLDivElement> {
  variant?: AlertBannerVariant;
  title: string;
}

export function AlertBanner({
  className,
  variant = 'info',
  title,
  children,
  ...props
}: AlertBannerProps): JSX.Element {
  return (
    <div className={cn('alert-banner', `alert-banner--${variant}`, className)} role="status" {...props}>
      <strong className="alert-banner__title">{title}</strong>
      {children ? <p className="alert-banner__text">{children}</p> : null}
    </div>
  );
}
