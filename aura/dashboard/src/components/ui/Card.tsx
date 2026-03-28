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
  return (
    <section className={cn('card', className)} data-surface={surface} {...props}>
      {title || action ? (
        <header className="card__header">
          <h2 className="card__title">{title}</h2>
          <div className="card__action">{action}</div>
        </header>
      ) : null}
      <div className="card__body">{children}</div>
    </section>
  );
}
