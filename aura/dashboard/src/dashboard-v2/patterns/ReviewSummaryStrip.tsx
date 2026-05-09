import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../utils/cn';
import { DashboardV2Button } from '../primitives/Button';
import { DashboardV2Surface } from '../primitives/Surface';
import { DashboardV2Heading, DashboardV2Text } from '../primitives/Text';

export interface ReviewSummaryMetric {
  key: string;
  label: string;
  value: string;
  meta: string;
  icon: LucideIcon;
  active?: boolean;
  ariaLabel?: string;
  onPress?: () => void;
}

export interface ReviewSummaryAction {
  key: string;
  label: string;
  tone?: 'primary' | 'secondary' | 'ghost' | 'quiet';
  leadingIcon?: ReactNode;
  onPress: () => void;
}

interface ReviewSummaryStripProps {
  kicker: string;
  title: string;
  summary: string;
  metrics: ReviewSummaryMetric[];
  actions: ReviewSummaryAction[];
  metricLabel: string;
  className?: string;
}

export function ReviewSummaryStrip({
  kicker,
  title,
  summary,
  metrics,
  actions,
  metricLabel,
  className,
}: ReviewSummaryStripProps): JSX.Element {
  return (
    <DashboardV2Surface className={cn('v2-review-summary-strip', className)} tone="elevated">
      <div className="v2-review-summary-strip__copy">
        <DashboardV2Text tone="label">{kicker}</DashboardV2Text>
        <DashboardV2Heading as="h2">{title}</DashboardV2Heading>
        <DashboardV2Text tone="muted">{summary}</DashboardV2Text>
      </div>

      <div className="v2-review-summary-strip__metrics" aria-label={metricLabel} aria-live="polite">
        {metrics.map((item) => {
          const metricBody = (
            <>
              <item.icon size={18} aria-hidden="true" />
              <span>
                <span className="v2-review-summary-strip__metric-label">{item.label}</span>
                <strong>{item.value}</strong>
                <span className="v2-review-summary-strip__metric-meta">{item.meta}</span>
              </span>
            </>
          );

          if (item.onPress) {
            return (
              <button
                key={item.key}
                type="button"
                className={cn(
                  'v2-review-summary-strip__metric',
                  item.active && 'v2-review-summary-strip__metric--active',
                )}
                onClick={item.onPress}
                aria-label={item.ariaLabel}
                aria-pressed={item.active || undefined}
              >
                {metricBody}
              </button>
            );
          }

          return (
            <div
              key={item.key}
              className={cn(
                'v2-review-summary-strip__metric',
                'v2-review-summary-strip__metric--static',
                item.active && 'v2-review-summary-strip__metric--active',
              )}
            >
              {metricBody}
            </div>
          );
        })}
      </div>

      <div className="v2-review-summary-strip__actions">
        {actions.map((action) => (
          <DashboardV2Button
            key={action.key}
            tone={action.tone ?? 'secondary'}
            size="sm"
            onPress={action.onPress}
            leadingIcon={action.leadingIcon}
          >
            {action.label}
          </DashboardV2Button>
        ))}
      </div>
    </DashboardV2Surface>
  );
}
