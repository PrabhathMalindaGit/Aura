import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

interface EmptyStateProps {
  title: string;
  description: string;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
  action?: ReactNode;
  image?: string;
}

export function EmptyState({
  title,
  description,
  tone = 'neutral',
  action,
  image,
}: EmptyStateProps): JSX.Element {
  return (
    <section className={cn('empty-state', `empty-state--${tone}`)} aria-live="polite" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 'var(--space-3)', padding: 'var(--space-4)' }}>
      {image && <img src={image} alt="" style={{ width: '120px', height: '120px', objectFit: 'contain', marginBottom: 'var(--space-2)' }} />}
      <div className="empty-state__title-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)' }}>
        {!image && (
          <span className="empty-state__icon" aria-hidden="true">
            {tone === 'success' ? '✓' : '•'}
          </span>
        )}
        <h3 className="empty-state__title" style={{ margin: 0, fontSize: 'var(--text-lg)', fontWeight: 'var(--font-semibold)' }}>{title}</h3>
      </div>
      <p className="empty-state__description" style={{ color: 'var(--muted-foreground)', maxWidth: '40ch', margin: '0 auto' }}>{description}</p>
      {action ? <div className="empty-state__action" style={{ marginTop: 'var(--space-2)' }}>{action}</div> : null}
    </section>
  );
}
