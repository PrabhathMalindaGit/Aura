import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { Skeleton } from '../ui/Skeleton';
import {
  type PatientActionKey,
  type PatientPriorityItem,
  type PatientRecommendedAction,
} from '../../utils/patientDetail';
import { formatDashboardRelativeTime } from '../../utils/dashboard';

interface PatientDecisionSurfaceProps {
  priorities: PatientPriorityItem[];
  recommendedActions: PatientRecommendedAction[];
  isLoading?: boolean;
  priorityError?: string | null;
  recommendedActionsError?: string | null;
  onRetry: () => void;
  onAction: (key: PatientActionKey) => void;
}

function toneVariant(
  tone: PatientPriorityItem['tone'] | PatientRecommendedAction['tone'],
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

function priorityToneLabel(tone: PatientPriorityItem['tone']): string {
  if (tone === 'danger') {
    return 'Urgent';
  }
  if (tone === 'warning') {
    return 'Needs review';
  }
  if (tone === 'success') {
    return 'On track';
  }
  return 'Monitor';
}

function actionToneLabel(tone: PatientRecommendedAction['tone']): string {
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

export function PatientDecisionSurface({
  priorities,
  recommendedActions,
  isLoading = false,
  priorityError,
  recommendedActionsError,
  onRetry,
  onAction,
}: PatientDecisionSurfaceProps): JSX.Element {
  const errors = [priorityError, recommendedActionsError].filter(
    (message): message is string => Boolean(message),
  );

  if (isLoading) {
    return (
      <div className="patient-decision-surface" aria-label="Patient decision surface loading placeholder">
        <div className="patient-decision-surface__toolbar">
          <div className="patient-decision-surface__facts">
            <span className="patient-decision-surface__fact">Loading current review</span>
          </div>
        </div>
        <div className="patient-decision-surface__columns">
          <div className="patient-detail-skeleton-grid">
            <Skeleton height={72} />
            <Skeleton height={88} />
          </div>
          <div className="patient-detail-skeleton-grid">
            <Skeleton height={72} />
            <Skeleton height={72} />
          </div>
        </div>
      </div>
    );
  }

  if (errors.length > 0) {
    return (
      <div className="patient-detail-inline-state patient-decision-surface__state" role="status">
        <div className="stack stack--1">
          {errors.map((message) => (
            <p key={message} className="muted-text">
              {message}
            </p>
          ))}
        </div>
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }

  if (priorities.length === 0 && recommendedActions.length === 0) {
    return (
      <EmptyState
        title="No immediate priorities detected"
        description="No alert, response-needed message, overdue task, or urgent appointment issue is active right now."
        tone="success"
      />
    );
  }

  return (
    <div className="patient-decision-surface" data-testid="patient-decision-surface">
      <div className="patient-decision-surface__toolbar">
        <div className="patient-decision-surface__facts" aria-label="Decision surface summary">
          <span className="patient-decision-surface__fact">
            {priorities.length} {priorities.length === 1 ? 'priority' : 'priorities'} in view
          </span>
          <span className="patient-decision-surface__fact">
            {recommendedActions.length} {recommendedActions.length === 1 ? 'next action' : 'next actions'}
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={onRetry}>
          Refresh
        </Button>
      </div>

      <div className="patient-decision-surface__columns">
        <section
          className="patient-decision-surface__lane patient-decision-surface__lane--lead"
          aria-label="Current priorities"
          data-testid="patient-current-priorities"
        >
          <div className="patient-decision-surface__lane-header">
            <div>
              <h3 className="patient-decision-surface__lane-title">Current priorities</h3>
              <p className="patient-decision-surface__lane-note">Lead issue first, then move directly into follow-through.</p>
            </div>
          </div>

          {priorities.length === 0 ? (
            <p className="muted-text">No immediate priorities detected</p>
          ) : (
            <div className="patient-priority-list">
              {priorities.map((item) => (
                <article key={item.id} className={`patient-priority-item patient-priority-item--${item.tone}`}>
                  <div className="patient-priority-item__copy">
                    <div className="patient-priority-item__meta">
                      <Badge variant={toneVariant(item.tone)}>{priorityToneLabel(item.tone)}</Badge>
                      {item.timestamp ? (
                        <span className="muted-text">{formatDashboardRelativeTime(item.timestamp)}</span>
                      ) : null}
                    </div>
                    <strong className="patient-priority-item__title">{item.title}</strong>
                    <p className="patient-priority-item__reason">{item.reason}</p>
                  </div>
                  {item.actionKey && item.actionLabel ? (
                    <Button
                      className="patient-priority-item__action"
                      variant="secondary"
                      size="sm"
                      onClick={() => onAction(item.actionKey!)}
                    >
                      {item.actionLabel}
                    </Button>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>

        <section
          className="patient-decision-surface__lane patient-decision-surface__lane--secondary"
          aria-label="Recommended actions"
          data-testid="patient-recommended-actions"
        >
          <div className="patient-decision-surface__lane-header">
            <div>
              <h3 className="patient-decision-surface__lane-title">Recommended actions</h3>
              <p className="patient-decision-surface__lane-note">Secondary next steps that support the active review.</p>
            </div>
          </div>

          {recommendedActions.length === 0 ? (
            <p className="muted-text">No action recommendations right now</p>
          ) : (
            <div className="patient-recommended-actions">
              {recommendedActions.map((item) => (
                <article
                  key={item.id}
                  className={`patient-recommended-action patient-recommended-action--${item.tone}`}
                >
                  <div className="patient-recommended-action__copy">
                    <div className="patient-recommended-action__meta">
                      <Badge variant={toneVariant(item.tone)}>{actionToneLabel(item.tone)}</Badge>
                    </div>
                    <strong className="patient-recommended-action__title">{item.title}</strong>
                    <p className="patient-recommended-action__description">{item.description}</p>
                  </div>
                  <Button
                    className="patient-recommended-action__action"
                    variant="secondary"
                    size="sm"
                    onClick={() => onAction(item.actionKey)}
                  >
                    {item.actionLabel}
                  </Button>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
