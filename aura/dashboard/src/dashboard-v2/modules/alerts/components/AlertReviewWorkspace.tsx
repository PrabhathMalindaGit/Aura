import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import type { AlertContextResult, AlertItem, TimelineEvent, TriggeringEvent } from '../../../../types/models';
import {
  clinicianQueryKeys,
  retryNotification,
} from '../../../../services/clinicianApi';
import type { AlertGovernanceVm, AlertReviewHeaderVm, AlertReviewSummaryVm } from '../../../adapters/alerts';
import { DashboardV2Badge } from '../../../primitives/Badge';
import { DashboardV2Button } from '../../../primitives/Button';
import { DashboardV2Surface } from '../../../primitives/Surface';
import { DashboardV2Heading, DashboardV2Text } from '../../../primitives/Text';
import { AlertTimeline } from '../../../../components/alerts/AlertTimeline';
import { NotificationPanel } from '../../../../components/alerts/NotificationPanel';
import { RiskOverrideForm } from '../../../../components/alerts/RiskOverrideForm';
import { asAppError, toUserMessage } from '../../../../utils/errors';
import { formatRiskLabel, getEffectiveRisk } from '../../../../utils/risk';
import { formatExactTime, formatRelativeTime } from '../../../../utils/time';
import { notificationStatusLabel } from '../../../../utils/notification';
import { AlertReviewHeader } from './AlertReviewHeader';

interface AlertsWorkspaceNotice {
  key: string;
  tone: 'warning' | 'info' | 'critical';
  title: string;
  message: string;
}

interface AlertReviewWorkspaceProps {
  alert: AlertItem | null;
  header: AlertReviewHeaderVm | null;
  summary: AlertReviewSummaryVm | null;
  context: AlertContextResult | undefined;
  contextLoading: boolean;
  contextError: string | null;
  governance: AlertGovernanceVm | null;
  notices: AlertsWorkspaceNotice[];
  clinicianId: string;
  mutationPending: boolean;
  assignmentPending: boolean;
  overridePending: boolean;
  loading: boolean;
  statusTitle?: string;
  statusDescription?: string;
  onRetry?: () => void;
  onAcknowledge: () => Promise<void> | void;
  onResolve: () => Promise<void> | void;
  onAssignToMe: () => Promise<void> | void;
  onTakeOver: () => Promise<void> | void;
  onUnassign: () => Promise<void> | void;
  onSaveRiskOverride: (payload: { riskFinal: string; overrideReason?: string }) => Promise<void> | void;
  onClearRiskOverride: () => Promise<void> | void;
  onOpenPatient: () => void;
  onOpenGovernance: () => void;
  showGovernanceAction: boolean;
  showBackToQueue: boolean;
  onBackToQueue: () => void;
  showQueueSheetAction: boolean;
  onOpenQueueSheet: () => void;
  onRefetchContext: () => void;
}

function mapFactTone(tone?: 'neutral' | 'info' | 'success' | 'warning' | 'critical' | 'unknown') {
  if (tone === 'critical') {
    return 'critical';
  }

  if (tone === 'warning') {
    return 'warning';
  }

  if (tone === 'success') {
    return 'success';
  }

  if (tone === 'info') {
    return 'info';
  }

  return 'neutral';
}

function renderIdleState(
  title: string,
  description: string,
  action?: JSX.Element,
): JSX.Element {
  return (
    <DashboardV2Surface className="v2-alert-review-workspace__idle" tone="muted">
      <DashboardV2Heading as="h2">{title}</DashboardV2Heading>
      <DashboardV2Text tone="muted">{description}</DashboardV2Text>
      {action}
    </DashboardV2Surface>
  );
}

function formatOptionalNumber(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '—';
}

function formatCheckinDate(value: string | undefined): JSX.Element | string {
  if (!value) {
    return 'Unknown';
  }

  return (
    <time dateTime={value} title={formatExactTime(value)}>
      {formatRelativeTime(value)}
    </time>
  );
}

function buildCompactTimeline(events: TimelineEvent[] | undefined): TimelineEvent[] | undefined {
  if (!events?.length) {
    return events;
  }

  const toTimestamp = (value: string) => {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  };

  return [...events]
    .sort((left, right) => toTimestamp(right.at) - toTimestamp(left.at))
    .slice(0, 6);
}

function renderEvidenceSnapshot(
  event: TriggeringEvent | undefined,
  loading: boolean,
  onFetchDetails: () => void,
  fetchDisabled: boolean,
): JSX.Element {
  if (loading) {
    return (
      <div className="v2-alert-review-workspace__compact-empty">
        <DashboardV2Text tone="muted">Loading evidence snapshot...</DashboardV2Text>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="v2-alert-review-workspace__compact-empty">
        <DashboardV2Text tone="muted">Triggering event not available yet.</DashboardV2Text>
        <DashboardV2Button tone="secondary" size="sm" onPress={onFetchDetails} isDisabled={fetchDisabled}>
          Fetch details
        </DashboardV2Button>
      </div>
    );
  }

  if (event.type === 'chat') {
    return (
      <div className="v2-alert-review-workspace__evidence-note">
        <DashboardV2Text tone="label">Triggering message</DashboardV2Text>
        <DashboardV2Text tone="strong">{event.text || 'No triggering message recorded'}</DashboardV2Text>
        <DashboardV2Text tone="muted">{formatCheckinDate(event.createdAt)}</DashboardV2Text>
      </div>
    );
  }

  const adherence = event.adherence ?? {};
  const facts = [
    { label: 'Date', value: formatCheckinDate(event.date) },
    { label: 'Pain', value: formatOptionalNumber(event.pain) },
    { label: 'Mood', value: formatOptionalNumber(event.mood) },
    { label: 'Exercises', value: formatOptionalNumber(adherence.exercises) },
    {
      label: 'Medication',
      value: adherence.medication === undefined ? '—' : adherence.medication ? 'Taken' : 'Missed',
    },
  ];

  return (
    <dl className="v2-alert-review-workspace__compact-facts">
      {facts.map((fact) => (
        <div key={fact.label}>
          <dt>{fact.label}</dt>
          <dd>{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function AlertReviewWorkspace({
  alert,
  header,
  summary,
  context,
  contextLoading,
  contextError,
  governance,
  notices,
  clinicianId,
  mutationPending,
  assignmentPending,
  overridePending,
  loading,
  statusTitle,
  statusDescription,
  onRetry,
  onAcknowledge,
  onResolve,
  onAssignToMe,
  onTakeOver,
  onUnassign,
  onSaveRiskOverride,
  onClearRiskOverride,
  onOpenPatient,
  onOpenGovernance,
  showGovernanceAction,
  showBackToQueue,
  onBackToQueue,
  showQueueSheetAction,
  onOpenQueueSheet,
  onRefetchContext,
}: AlertReviewWorkspaceProps): JSX.Element {
  const queryClient = useQueryClient();
  const [notificationNotice, setNotificationNotice] = useState<AlertsWorkspaceNotice | null>(null);

  const retryNotificationMutation = useMutation({
    mutationFn: async (activeAlert: AlertItem) =>
      retryNotification(activeAlert._id, {
        requestedBy: clinicianId,
      }),
    onSuccess: async (result, activeAlert) => {
      setNotificationNotice({
        key: 'notification-retry',
        tone: 'info',
        title: 'Notification update',
        message:
          result.status === 'queued'
            ? 'Notification retry queued.'
            : 'Notification retry requested.',
      });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: clinicianQueryKeys.alerts('open') }),
        queryClient.invalidateQueries({ queryKey: clinicianQueryKeys.alerts('acknowledged') }),
        queryClient.invalidateQueries({ queryKey: clinicianQueryKeys.alerts('resolved') }),
        queryClient.invalidateQueries({
          queryKey: clinicianQueryKeys.alertContext(activeAlert._id),
        }),
      ]);
    },
    onError: (error) => {
      setNotificationNotice({
        key: 'notification-error',
        tone: 'critical',
        title: 'Notification retry failed',
        message: toUserMessage(asAppError(error)),
      });
    },
  });

  const workspaceNotices = useMemo(
    () => [
      ...notices,
      ...(contextError
        ? [
            {
              key: 'context-error',
              tone: 'warning' as const,
              title: 'Alert context unavailable',
              message: contextError,
            },
          ]
        : []),
      ...(notificationNotice ? [notificationNotice] : []),
    ],
    [contextError, notices, notificationNotice],
  );

  if (loading) {
    return (
      <DashboardV2Surface className="v2-alert-review-workspace" tone="elevated">
        <div className="v2-alert-review-workspace__skeleton">
          <div className="v2-alerts-skeleton v2-alerts-skeleton--header" />
          <div className="v2-alerts-skeleton v2-alerts-skeleton--panel" />
          <div className="v2-alerts-skeleton v2-alerts-skeleton--panel" />
        </div>
      </DashboardV2Surface>
    );
  }

  if (statusTitle) {
    return renderIdleState(
      statusTitle,
      statusDescription ?? 'Reconnect and retry to continue alert review.',
      onRetry ? (
        <DashboardV2Button tone="secondary" size="sm" onPress={onRetry}>
          Retry
        </DashboardV2Button>
      ) : undefined,
    );
  }

  if (!alert || !header || !summary) {
    return renderIdleState(
      'Select an alert to begin review',
      'Choose an alert from the queue to inspect basis, patient context, review state, and governance metadata without losing your place.',
    );
  }

  const effectiveRisk = formatRiskLabel(getEffectiveRisk(alert));
  const latestAuditLabel = governance?.latestAudit ?? 'Unknown';
  const compactTimeline = buildCompactTimeline(context?.timeline);
  const whyCopy =
    summary.basisItems[0] ??
    `Recorded basis is ${summary.summary}. Review current risk, evidence, and workflow state before making the next decision.`;

  return (
    <div
      className="v2-alert-review-workspace"
      id="v2-alert-review-workspace"
      data-testid="v2-alert-review-workspace"
    >
      <AlertReviewHeader
        alert={alert}
        header={header}
        clinicianId={clinicianId}
        mutationPending={mutationPending}
        assignmentPending={assignmentPending}
        onOpenPatient={onOpenPatient}
        onAcknowledge={onAcknowledge}
        onResolve={onResolve}
        onAssignToMe={onAssignToMe}
        onTakeOver={onTakeOver}
        onUnassign={onUnassign}
        showGovernanceAction={showGovernanceAction}
        onOpenGovernance={onOpenGovernance}
        showBackToQueue={showBackToQueue}
        onBackToQueue={onBackToQueue}
        showQueueSheetAction={showQueueSheetAction}
        onOpenQueueSheet={onOpenQueueSheet}
      />

      {workspaceNotices.length > 0 ? (
        <div className="v2-alert-review-workspace__notices">
          {workspaceNotices.map((notice) => (
            <DashboardV2Surface
              key={notice.key}
              className={`v2-alert-review-workspace__notice v2-alert-review-workspace__notice--${notice.tone}`}
              tone={notice.tone === 'critical' ? 'critical' : 'muted'}
            >
              <AlertTriangle size={16} />
              <div>
                <DashboardV2Text tone="strong">{notice.title}</DashboardV2Text>
                <DashboardV2Text tone="muted">{notice.message}</DashboardV2Text>
              </div>
            </DashboardV2Surface>
          ))}
        </div>
      ) : null}

      <div className="v2-alert-review-workspace__body">
        <DashboardV2Surface
          className="v2-alert-review-workspace__section v2-alert-review-workspace__section--why"
          tone="elevated"
        >
          <DashboardV2Text tone="label">Why this alert needs review</DashboardV2Text>
          <DashboardV2Heading as="h3">{summary.summary}</DashboardV2Heading>
          <DashboardV2Text tone="muted">{whyCopy}</DashboardV2Text>
          <div className="v2-alert-review-workspace__facts" role="list" aria-label="Alert review facts">
            {summary.supportingFacts.map((fact) => (
              <article key={fact.label} className="v2-alert-review-workspace__fact" role="listitem">
                <DashboardV2Text tone="label">{fact.label}</DashboardV2Text>
                <div className="v2-alert-review-workspace__fact-value">
                  <DashboardV2Text tone="strong">{fact.value}</DashboardV2Text>
                  {fact.tone ? (
                    <DashboardV2Badge tone={mapFactTone(fact.tone)}>{fact.value}</DashboardV2Badge>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
          {summary.basisItems.length > 0 ? (
            <ul className="v2-alert-review-workspace__basis-list">
              {summary.basisItems.map((item) => (
                <li key={item}>
                  <DashboardV2Text tone="muted">{item}</DashboardV2Text>
                </li>
              ))}
            </ul>
          ) : null}
        </DashboardV2Surface>

        <div className="v2-alert-review-workspace__review-grid">
          <DashboardV2Surface
            className="v2-alert-review-workspace__section v2-alert-review-workspace__section--evidence"
            tone="elevated"
          >
            <div className="v2-alert-review-workspace__section-header">
              <div>
                <DashboardV2Text tone="label">Evidence snapshot</DashboardV2Text>
                <DashboardV2Heading as="h3">What changed</DashboardV2Heading>
              </div>
              <div className="v2-alert-review-workspace__section-badges">
                <DashboardV2Badge tone="warning">{effectiveRisk}</DashboardV2Badge>
                <DashboardV2Badge tone="neutral">{latestAuditLabel}</DashboardV2Badge>
              </div>
            </div>
            {renderEvidenceSnapshot(
              context?.triggeringEvent,
              contextLoading,
              onRefetchContext,
              contextLoading,
            )}
          </DashboardV2Surface>

          <DashboardV2Surface
            className="v2-alert-review-workspace__section v2-alert-review-workspace__section--workflow"
            tone="elevated"
          >
            <div className="v2-alert-review-workspace__section-header">
              <div>
                <DashboardV2Text tone="label">Workflow state</DashboardV2Text>
                <DashboardV2Heading as="h3">Notification review</DashboardV2Heading>
              </div>
              <DashboardV2Badge tone="info">
                {notificationStatusLabel(alert.notificationStatus)}
              </DashboardV2Badge>
            </div>
            <NotificationPanel
              alert={alert}
              compact
              retryEnabled={!retryNotificationMutation.isPending}
              busy={retryNotificationMutation.isPending}
              onRetry={() => retryNotificationMutation.mutate(alert)}
            />
          </DashboardV2Surface>
        </div>

        <div className="v2-alert-review-workspace__decision-grid">
          <DashboardV2Surface
            className="v2-alert-review-workspace__section v2-alert-review-workspace__section--decision"
            tone="elevated"
          >
            <DashboardV2Text tone="label">Risk decision</DashboardV2Text>
            <DashboardV2Heading as="h3">Confirm final risk</DashboardV2Heading>
            <RiskOverrideForm
              alert={alert}
              compact
              saving={overridePending}
              onSave={onSaveRiskOverride}
              onClear={onClearRiskOverride}
            />
          </DashboardV2Surface>

          <DashboardV2Surface
            className="v2-alert-review-workspace__section v2-alert-review-workspace__section--trail"
            tone="elevated"
          >
            <DashboardV2Text tone="label">History and audit</DashboardV2Text>
            <DashboardV2Heading as="h3">Latest governance trail</DashboardV2Heading>
            <AlertTimeline
              events={compactTimeline}
              loading={contextLoading}
            />
          </DashboardV2Surface>
        </div>
      </div>
    </div>
  );
}
