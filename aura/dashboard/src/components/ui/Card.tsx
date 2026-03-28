import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../utils/cn';

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode;
  action?: ReactNode;
  surface?: 'base' | 'emphasized' | 'critical';
}

export function Card({
  className,
  title,
  action,
  children,
  surface = 'base',
  ...props
}: CardProps): JSX.Element {
  const hasHeader = Boolean(title || action);

  return (
    <section
      className={cn('card', className)}
      data-has-action={action ? 'true' : undefined}
      data-has-header={hasHeader ? 'true' : undefined}
      data-surface={surface}
      {...props}
    >
      {hasHeader ? (
        <header className={cn('card__header', action && 'card__header--with-action')}>
          {title ? <h2 className="card__title">{title}</h2> : null}
          {action ? <div className="card__action">{action}</div> : null}
        </header>
      ) : null}
      <div className="card__body">{children}</div>
    </section>
  );
}
