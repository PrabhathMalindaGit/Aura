import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

interface EmptyStateProps {
  title: string;
  description: string;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
  action?: ReactNode;
}

export function EmptyState({
  title,
  description,
  tone = 'neutral',
  action,
}: EmptyStateProps): JSX.Element {
  return (
    <section className={cn('empty-state', `empty-state--${tone}`)} aria-live="polite">
      <div className="empty-state__title-row">
        <span className="empty-state__icon" aria-hidden="true">
          {tone === 'success' ? '✓' : '•'}
        </span>
        <h3 className="empty-state__title">{title}</h3>
      </div>
      <p className="empty-state__description">{description}</p>
      {action ? <div className="empty-state__action">{action}</div> : null}
    </section>
  );
}
