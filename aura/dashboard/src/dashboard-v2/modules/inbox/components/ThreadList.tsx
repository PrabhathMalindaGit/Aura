import { Check } from 'lucide-react';
import type { InboxQueueRowVm } from '../../../adapters/communication';
import { DashboardV2ClinicianPatientAnchor } from '../../../patterns/ClinicianPatientAnchor';
import { DashboardV2ClinicianQueueRow } from '../../../patterns/ClinicianQueueRow';
import { DashboardV2ClinicianQuietState } from '../../../patterns/ClinicianQuietState';
import { DashboardV2Badge } from '../../../primitives/Badge';
import { DashboardV2Button } from '../../../primitives/Button';
import { DashboardV2Text } from '../../../primitives/Text';

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
      <DashboardV2ClinicianQuietState
        className="v2-inbox-queue-pane__state"
        eyebrow="Queue status"
        title={statusTitle}
        description={statusDescription}
        action={
          onRetry ? (
            <DashboardV2Button tone="secondary" size="sm" onPress={onRetry}>
              Retry
            </DashboardV2Button>
          ) : undefined
        }
      />
    );
  }

  if (rows.length === 0) {
    return (
      <DashboardV2ClinicianQuietState
        className="v2-inbox-queue-pane__state"
        eyebrow="Message queue"
        title={emptyTitle ?? 'No threads in this view'}
        description={emptyDescription}
        action={
          onEmptyAction && emptyActionLabel ? (
            <DashboardV2Button tone="secondary" size="sm" onPress={onEmptyAction}>
              {emptyActionLabel}
            </DashboardV2Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <ul className="v2-inbox-thread-list" role="list" aria-label="Communication threads">
      {rows.map((row) => {
        const selected = selectedKey === row.key;

        return (
          <li key={row.key} className="v2-inbox-thread-list__item">
            <DashboardV2ClinicianQueueRow
              className={`v2-inbox-thread-row v2-inbox-thread-row--${row.responseTone}${
                selected ? ' v2-inbox-thread-row--selected' : ''
              }`}
              tone={
                row.responseTone === 'critical'
                  ? 'critical'
                  : row.responseTone === 'warning'
                    ? 'warning'
                    : row.responseTone === 'success'
                      ? 'success'
                      : 'neutral'
              }
              selected={selected}
              onPress={() => onSelect(row.key)}
              testId={`v2-inbox-row-${row.patientId ?? row.key}`}
            >
              <div className="v2-inbox-thread-row__topline">
                <div className="v2-inbox-thread-row__identity">
                  <DashboardV2ClinicianPatientAnchor
                    patientLabel={row.patientName}
                    tone={
                      row.responseTone === 'critical'
                        ? 'critical'
                        : row.responseTone === 'warning'
                          ? 'warning'
                          : row.responseTone === 'success'
                            ? 'success'
                            : 'neutral'
                    }
                  />
                  <strong className="v2-inbox-thread-row__name">{row.patientName}</strong>
                  <DashboardV2Badge tone={row.responseTone === 'critical' ? 'safety' : row.responseTone === 'warning' ? 'delayed' : row.responseTone === 'success' ? 'clear' : 'private'}>
                    {row.responseLabel}
                  </DashboardV2Badge>
                </div>
                <span
                  className="v2-inbox-thread-row__time"
                  title={row.freshnessTitle}
                >
                  {row.freshnessLabel}
                </span>
                {selected ? (
                  <span className="v2-inbox-thread-row__selected-indicator">
                    <Check size={14} aria-hidden="true" />
                    Selected
                  </span>
                ) : null}
              </div>

              <DashboardV2Text tone="strong">{row.preview}</DashboardV2Text>
              <DashboardV2Text tone="muted">{row.metaLine}</DashboardV2Text>

              {row.supportingBadges.length > 0 ? (
                <div className="v2-inbox-thread-row__supporting">
                  {row.supportingBadges.map((badge) => (
                    <DashboardV2Badge
                      key={`${row.key}-${badge.label}`}
                      tone={
                        badge.tone === 'critical'
                          ? 'safety'
                          : badge.tone === 'warning'
                            ? 'delayed'
                            : badge.tone === 'info'
                              ? 'info'
                              : badge.tone === 'success'
                                ? 'clear'
                                : 'private'
                      }
                    >
                      {badge.label}
                    </DashboardV2Badge>
                  ))}
                </div>
              ) : null}
            </DashboardV2ClinicianQueueRow>
          </li>
        );
      })}
    </ul>
  );
}
