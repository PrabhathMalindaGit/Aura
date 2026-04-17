import { AlertTriangle } from 'lucide-react';
import type { InboxQueueRowVm } from '../../../adapters/communication';
import { DashboardV2Badge } from '../../../primitives/Badge';
import { DashboardV2Button } from '../../../primitives/Button';
import { DashboardV2Surface } from '../../../primitives/Surface';
import { DashboardV2Heading, DashboardV2Text } from '../../../primitives/Text';

interface ThreadListProps {
  rows: InboxQueueRowVm[];
  selectedKey: string | null;
  loading: boolean;
  statusTitle?: string;
  statusDescription?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
  onRetry?: () => void;
  onSelect: (key: string) => void;
}

export function ThreadList({
  rows,
  selectedKey,
  loading,
  statusTitle,
  statusDescription,
  emptyTitle,
  emptyDescription,
  emptyActionLabel,
  onEmptyAction,
  onRetry,
  onSelect,
}: ThreadListProps): JSX.Element {
  if (loading) {
    return (
      <div className="v2-inbox-queue-pane__skeleton" aria-label="Inbox queue loading placeholder">
        <div className="v2-inbox-skeleton v2-inbox-skeleton--thread" />
        <div className="v2-inbox-skeleton v2-inbox-skeleton--thread" />
        <div className="v2-inbox-skeleton v2-inbox-skeleton--thread" />
      </div>
    );
  }

  if (statusTitle) {
    return (
      <DashboardV2Surface className="v2-inbox-queue-pane__state" tone="muted">
        <AlertTriangle size={18} />
        <DashboardV2Heading as="h3">{statusTitle}</DashboardV2Heading>
        {statusDescription ? <DashboardV2Text tone="muted">{statusDescription}</DashboardV2Text> : null}
        {onRetry ? (
          <DashboardV2Button tone="secondary" size="sm" onPress={onRetry}>
            Retry
          </DashboardV2Button>
        ) : null}
      </DashboardV2Surface>
    );
  }

  if (rows.length === 0) {
    return (
      <DashboardV2Surface className="v2-inbox-queue-pane__state" tone="muted">
        <DashboardV2Heading as="h3">{emptyTitle ?? 'No threads in this view'}</DashboardV2Heading>
        {emptyDescription ? <DashboardV2Text tone="muted">{emptyDescription}</DashboardV2Text> : null}
        {onEmptyAction && emptyActionLabel ? (
          <DashboardV2Button tone="secondary" size="sm" onPress={onEmptyAction}>
            {emptyActionLabel}
          </DashboardV2Button>
        ) : null}
      </DashboardV2Surface>
    );
  }

  return (
    <ul className="v2-inbox-thread-list" role="list" aria-label="Communication threads">
      {rows.map((row) => (
        <li key={row.key} className="v2-inbox-thread-list__item">
          <button
            type="button"
            className={`v2-inbox-thread-row v2-inbox-thread-row--${row.responseTone}${
              selectedKey === row.key ? ' v2-inbox-thread-row--selected' : ''
            }`}
            aria-pressed={selectedKey === row.key}
            data-testid={`v2-inbox-row-${row.patientId ?? row.key}`}
            onClick={() => onSelect(row.key)}
          >
            <div className="v2-inbox-thread-row__topline">
              <div className="v2-inbox-thread-row__identity">
                <strong className="v2-inbox-thread-row__name">{row.patientName}</strong>
                <DashboardV2Badge tone={row.responseTone}>{row.responseLabel}</DashboardV2Badge>
              </div>
              <span
                className="v2-inbox-thread-row__time"
                title={row.freshnessTitle}
              >
                {row.freshnessLabel}
              </span>
            </div>

            <DashboardV2Text tone="strong">{row.preview}</DashboardV2Text>
            <DashboardV2Text tone="muted">{row.metaLine}</DashboardV2Text>

            {row.supportingBadges.length > 0 ? (
              <div className="v2-inbox-thread-row__supporting">
                {row.supportingBadges.map((badge) => (
                  <DashboardV2Badge key={`${row.key}-${badge.label}`} tone={badge.tone}>
                    {badge.label}
                  </DashboardV2Badge>
                ))}
              </div>
            ) : null}
          </button>
        </li>
      ))}
    </ul>
  );
}
