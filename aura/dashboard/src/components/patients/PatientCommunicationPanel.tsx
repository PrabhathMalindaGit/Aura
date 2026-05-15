import { Fragment } from 'react';
import { ClinicianDisclosure } from '../clinician/ClinicianDisclosure';
import { ClinicianSummaryStrip } from '../clinician/ClinicianSummaryStrip';
import {
  ClinicianTruthChips,
  type ClinicianTruthChip,
} from '../clinician/ClinicianTruthChips';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { ClinicianAvatar } from '../ui/ClinicianAvatar';
import { EmptyState } from '../ui/EmptyState';
import { Skeleton } from '../ui/Skeleton';
import { useClinicianIdentity } from '../../hooks/useClinicianIdentity';
import type { ClinicianCommunicationTemplate } from '../../services/clinicianProfile';
import type { CommunicationTimelineEvent } from '../../services/communicationWorkspace';
import { getClinicianInitials } from '../../services/clinicianIdentity';
import type { DashboardCommunicationOverviewItem } from '../../types/models';
import { formatDashboardDateTime, formatDashboardRelativeTime } from '../../utils/dashboard';
import { sanitizeDashboardPreviewText } from '../../utils/syntheticRunTags';

interface PatientCommunicationPanelProps {
  items: DashboardCommunicationOverviewItem[];
  timeline?: CommunicationTimelineEvent[];
  isLoading?: boolean;
  error?: string | null;
  freshnessLabel?: string | null;
  onRetry: () => void;
  onOpenCommunication: () => void;
  onOpenAlerts: () => void;
  showQuickReply?: boolean;
  quickReplyBlockedBySafety?: boolean;
  quickReplyValue?: string;
  onQuickReplyChange?: (value: string) => void;
  onSendQuickReply?: () => void;
  replyTemplates?: ClinicianCommunicationTemplate[];
  selectedTemplateId?: string;
  onSelectedTemplateChange?: (value: string) => void;
  onInsertTemplate?: () => void;
  hasSignature?: boolean;
  onInsertSignature?: () => void;
}

function formatCommunicationDay(timestamp: string): string {
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return timestamp.slice(0, 10) || 'Recent activity';
  }

  return parsed.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function buildFallbackTimeline(items: DashboardCommunicationOverviewItem[]): CommunicationTimelineEvent[] {
  return [...items]
    .sort((left, right) => Date.parse(left.messageCreatedAt) - Date.parse(right.messageCreatedAt))
    .map((item) => ({
      id: item.id,
      kind: 'patient-message',
      patientId: item.patientId,
      occurredAt: item.messageCreatedAt,
      senderLabel: item.patientName || 'Patient',
      preview:
        sanitizeDashboardPreviewText(item.messagePreview) ||
        'Recent patient communication is waiting for review.',
      flaggedBySafety: item.flaggedBySafety,
      followUpRequested: item.followUpRequested,
      reviewedAfterLatestInbound: item.reviewedAfterLatestInbound,
      localOnly: false,
    }));
}

function buildTimelineTruthChips(event: CommunicationTimelineEvent): ClinicianTruthChip[] {
  const chips: ClinicianTruthChip[] = [];

  if (event.flaggedBySafety) {
    chips.push({ label: 'Safety flagged', variant: 'danger', truth: 'server' });
  }

  if (event.followUpRequested) {
    chips.push({ label: 'Linked follow-up', variant: 'neutral', truth: 'server' });
  }

  if (event.reviewedAfterLatestInbound) {
    chips.push({ label: 'Reviewed', variant: 'info', truth: 'server' });
  }

  if (event.localOnly) {
    chips.push({ label: 'Local draft', variant: 'neutral', truth: 'local' });
  }

  return chips;
}

export function PatientCommunicationPanel({
  items,
  timeline = [],
  isLoading = false,
  error,
  freshnessLabel,
  onRetry,
  onOpenCommunication,
  onOpenAlerts,
  showQuickReply = false,
  quickReplyBlockedBySafety = false,
  quickReplyValue = '',
  onQuickReplyChange,
  onSendQuickReply,
  replyTemplates = [],
  selectedTemplateId = '',
  onSelectedTemplateChange,
  onInsertTemplate,
  hasSignature = false,
  onInsertSignature,
}: PatientCommunicationPanelProps): JSX.Element {
  const clinicianIdentity = useClinicianIdentity();
  const timelineEvents = timeline.length > 0 ? timeline : buildFallbackTimeline(items);
  const showQuickReplyHelpers = replyTemplates.length > 0 || hasSignature;
  const delayedCount = items.filter(
    (item) => item.responseDelayed || item.responseState === 'delayed',
  ).length;
  const reviewedCount = items.filter(
    (item) =>
      item.reviewedAfterLatestInbound === true &&
      item.resolutionKind !== 'no_follow_up_needed' &&
      !(item.responseDelayed || item.responseState === 'delayed'),
  ).length;
  const openAlertCount = items.reduce(
    (total, item) => total + (item.openAlertCount ?? 0),
    0,
  );
  const summaryItems = [
    {
      label: 'Needs response',
      value: String(items.length),
      note: items.length > 0 ? 'Current queue for this patient' : 'No response-needed threads',
      tone: items.length > 0 ? 'warning' : 'neutral',
    },
    {
      label: 'Delayed',
      value: String(delayedCount),
      note: delayedCount > 0 ? 'Past response target' : 'No delayed threads',
      tone: delayedCount > 0 ? 'danger' : 'neutral',
    },
    {
      label: 'Reviewed',
      value: String(reviewedCount),
      note: reviewedCount > 0 ? 'Durable review recorded' : 'No reviewed threads waiting',
      tone: reviewedCount > 0 ? 'success' : 'neutral',
    },
    {
      label: 'Open alerts',
      value: String(openAlertCount),
      note: openAlertCount > 0 ? 'Keep safety context visible' : 'No linked safety alerts',
      tone: openAlertCount > 0 ? 'danger' : 'neutral',
    },
  ] as const;

  return (
    <Card
      id="patient-communication-panel"
      className="patient-detail-panel patient-detail-panel--operational patient-detail-panel--operations-primary patient-detail-panel--workflow-communication"
      title="Communication follow-through"
      action={
        <div className="patient-detail-panel__header-tools">
          {freshnessLabel ? <span className="patient-detail-panel__freshness">{freshnessLabel}</span> : null}
          <div className="patient-detail-actions">
            <Button variant="ghost" size="sm" onClick={onRetry}>
              Refresh
            </Button>
            <Button variant="secondary" size="sm" onClick={onOpenCommunication}>
              Open communication
            </Button>
          </div>
        </div>
      }
      data-testid="patient-communication-panel"
    >
      {isLoading ? (
        <div className="patient-detail-skeleton-grid" aria-label="Patient communication loading placeholder">
          <Skeleton height={44} />
          <Skeleton height={68} />
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
          title="No recent communication needing follow-up"
          description="Response-needed threads will appear here."
          tone="success"
          action={
            <Button variant="secondary" size="sm" onClick={onOpenCommunication}>
              Open communication
            </Button>
          }
        />
      ) : (
        <div className="patient-communication-list">
          <ClinicianSummaryStrip items={summaryItems} />
          <div
            className="patient-communication-timeline"
            role="list"
            aria-label="Patient communication timeline"
          >
            {timelineEvents.map((event, index) => {
              const previousEvent = timelineEvents[index - 1];
              const currentDayKey = event.occurredAt.slice(0, 10);
              const previousDayKey = previousEvent?.occurredAt.slice(0, 10);
              const showDayGroup = index === 0 || currentDayKey !== previousDayKey;

              return (
                <Fragment key={event.id}>
                  {showDayGroup ? (
                    <div className="patient-communication-timeline__day" role="separator">
                      <span>{formatCommunicationDay(event.occurredAt)}</span>
                    </div>
                  ) : null}
                  <article
                    className={`patient-communication-timeline__event patient-communication-timeline__event--${
                      event.kind === 'clinician-reply' ? 'clinician' : 'patient'
                    }`}
                    role="listitem"
                  >
                    <div className="patient-communication-timeline__meta">
                      <div className="patient-communication-timeline__meta-copy">
                        {event.kind === 'clinician-reply' ? (
                          <div className="patient-communication-timeline__author">
                            <ClinicianAvatar
                              identity={{
                                displayName: event.senderLabel,
                                initials: getClinicianInitials(event.senderLabel),
                                photo: null,
                              }}
                              decorative
                              size="sm"
                            />
                            <div className="patient-communication-timeline__author-copy">
                              <span className="patient-communication-timeline__sender">{event.senderLabel}</span>
                              {event.senderSecondaryLabel ? (
                                <span className="patient-communication-timeline__secondary">
                                  {event.senderSecondaryLabel}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        ) : (
                          <span className="patient-communication-timeline__sender">
                            {event.senderLabel || 'Patient'}
                          </span>
                        )}
                        <span className="muted-text" title={formatDashboardDateTime(event.occurredAt)}>
                          {formatDashboardRelativeTime(event.occurredAt)}
                        </span>
                      </div>
                      <div className="patient-communication-timeline__badges">
                        <Badge variant={event.kind === 'clinician-reply' ? 'success' : 'neutral'}>
                          {event.kind === 'clinician-reply'
                            ? event.localOnly
                              ? 'Local clinician reply'
                              : 'Clinician reply'
                            : 'Patient message'}
                        </Badge>
                        <ClinicianTruthChips chips={buildTimelineTruthChips(event)} />
                      </div>
                    </div>
                    <p className="patient-communication-timeline__body">
                      {sanitizeDashboardPreviewText(event.preview) ||
                        'Recent patient communication is waiting for review.'}
                    </p>
                  </article>
                </Fragment>
              );
            })}
          </div>

          {quickReplyBlockedBySafety ? (
            <div className="patient-communication-inline-state" role="status">
              <p className="patient-communication-inline-state__title">Safety-sensitive communication stays on handoff review.</p>
              <p className="patient-communication-inline-state__copy">
                Continue in Communication or Alerts to review the full context before responding.
              </p>
              <div className="patient-communication-inline-state__actions">
                <Button variant="secondary" size="sm" onClick={onOpenCommunication}>
                  Open communication
                </Button>
                <Button variant="ghost" size="sm" onClick={onOpenAlerts}>
                  Open alerts
                </Button>
              </div>
            </div>
          ) : null}

          {showQuickReply && onQuickReplyChange && onSendQuickReply ? (
            <ClinicianDisclosure
              title="Local quick reply"
              note="Keeps browser-local drafting available without competing with shared care-team coordination."
              defaultOpen
            >
              <div className="patient-communication-quick-reply">
              {showQuickReplyHelpers ? (
                <>
                  <div
                    className="communication-authoring-tools communication-authoring-tools--compact"
                    role="group"
                    aria-label="Quick reply helpers"
                  >
                    <label
                      className="form-field communication-authoring-tools__picker"
                      htmlFor="patient-quick-reply-template-picker"
                    >
                      <span>Quick reply template</span>
                      <select
                        id="patient-quick-reply-template-picker"
                        value={selectedTemplateId}
                        onChange={(event) => onSelectedTemplateChange?.(event.target.value)}
                        aria-label="Quick reply template"
                        disabled={replyTemplates.length === 0}
                      >
                        {replyTemplates.length === 0 ? (
                          <option value="">No saved templates in Settings</option>
                        ) : null}
                        {replyTemplates.map((template) => (
                          <option key={template.id} value={template.id}>
                            {template.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="communication-authoring-tools__actions">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={onInsertTemplate}
                        disabled={
                          replyTemplates.length === 0 || !selectedTemplateId || !onInsertTemplate
                        }
                      >
                        Insert template
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={onInsertSignature}
                        disabled={!hasSignature || !onInsertSignature}
                      >
                        Insert signature
                      </Button>
                    </div>
                  </div>
                  <p className="communication-authoring-tools__note" aria-live="polite">
                    Applies only in this browser during this review pass.
                  </p>
                </>
              ) : null}
              <div className="patient-communication-quick-reply__identity" aria-label="Local clinician identity">
                <span className="patient-communication-quick-reply__identity-label">Reply as</span>
                <div className="patient-communication-quick-reply__identity-card">
                  <ClinicianAvatar identity={clinicianIdentity} decorative size="sm" />
                  <div className="patient-communication-quick-reply__identity-copy">
                    <strong>{clinicianIdentity.displayName}</strong>
                    {clinicianIdentity.secondaryLine ? <span>{clinicianIdentity.secondaryLine}</span> : null}
                  </div>
                </div>
              </div>
              <label className="form-field patient-communication-quick-reply__field">
                <span>Quick reply</span>
                <textarea
                  rows={3}
                  value={quickReplyValue}
                  onChange={(event) => onQuickReplyChange(event.target.value)}
                  placeholder="Add a short clinician follow-up for this patient."
                />
              </label>
              <div className="patient-communication-quick-reply__footer">
                <div className="stack stack--2">
                  <ClinicianTruthChips
                    chips={[{ label: 'Local draft', variant: 'neutral', truth: 'local' }]}
                  />
                  <p className="patient-communication-quick-reply__footer-copy">
                    Local draft only. It does not sync or mark the thread reviewed.
                  </p>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={onSendQuickReply}
                  disabled={quickReplyValue.trim().length === 0}
                >
                  Save local reply
                </Button>
              </div>
              </div>
            </ClinicianDisclosure>
          ) : null}
        </div>
      )}
    </Card>
  );
}
