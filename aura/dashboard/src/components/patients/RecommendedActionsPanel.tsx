import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { Skeleton } from '../ui/Skeleton';
import {
  type PatientActionKey,
  type PatientRecommendedAction,
} from '../../utils/patientDetail';

interface RecommendedActionsPanelProps {
  items: PatientRecommendedAction[];
  isLoading?: boolean;
  error?: string | null;
  onRetry: () => void;
  onAction: (key: PatientActionKey) => void;
}

function toneVariant(
  tone: PatientRecommendedAction['tone'],
): 'danger' | 'warning' | 'success' | 'neutral' {
  if (tone === 'danger') {
    return 'danger';
  }
  if (tone === 'warning') {
    return 'warning';
  }
  if (tone === 'success') {
    return 'success';
  }
  return 'neutral';
}

function toneLabel(tone: PatientRecommendedAction['tone']): string {
  if (tone === 'danger') {
    return 'Do now';
  }
  if (tone === 'warning') {
    return 'Next up';
  }
  if (tone === 'success') {
    return 'Supportive';
  }
  return 'Monitor';
}

export function RecommendedActionsPanel({
  items,
  isLoading = false,
  error,
  onRetry,
  onAction,
}: RecommendedActionsPanelProps): JSX.Element {
  return (
    <Card
      id="patient-recommended-actions"
      className="patient-detail-panel patient-detail-panel--attention"
      title="Recommended actions"
      action={
        <Button variant="ghost" size="sm" onClick={onRetry}>
          Refresh
        </Button>
      }
      data-testid="patient-recommended-actions"
    >
      {isLoading ? (
        <div className="patient-detail-skeleton-grid" aria-label="Recommended actions loading placeholder">
          <Skeleton height={56} />
          <Skeleton height={56} />
        </div>
      ) : error ? (
        <div className="patient-detail-inline-state" role="status">
          <p className="muted-text">{error}</p>
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Retry
          </Button>
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="No action recommendations right now"
          description="Current patient context does not suggest a specific follow-up step."
          tone="success"
        />
      ) : (
        <div className="patient-recommended-actions">
          {items.map((item) => (
            <article key={item.id} className={`patient-recommended-action patient-recommended-action--${item.tone}`}>
              <div className="patient-recommended-action__copy">
                <Badge variant={toneVariant(item.tone)}>{toneLabel(item.tone)}</Badge>
                <strong>{item.title}</strong>
                <p className="patient-recommended-action__description">{item.description}</p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => onAction(item.actionKey)}>
                {item.actionLabel}
              </Button>
            </article>
          ))}
        </div>
      )}
    </Card>
  );
}
