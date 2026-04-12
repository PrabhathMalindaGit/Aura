import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { AlertItem, TimelineEvent } from '../../types/models';
import {
  clinicianQueryKeys,
  deriveAlertTimeline,
  retryNotification,
  useAlertContext,
} from '../../services/clinicianApi';
import { formatExactTime, formatRelativeTime } from '../../utils/time';
import { AlertBanner } from '../ui/AlertBanner';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Drawer } from '../ui/Drawer';
import { Skeleton } from '../ui/Skeleton';
import { AlertTimeline } from './AlertTimeline';
import { AssignmentActions } from './AssignmentActions';
import { AssignmentChip } from './AssignmentChip';
import { NotificationPanel } from './NotificationPanel';
import { RiskOverrideForm } from './RiskOverrideForm';
import { TriggeringEventPanel } from './TriggeringEventPanel';
import { asAppError, toUserMessage } from '../../utils/errors';
import { formatRiskLabel, getEffectiveRisk, riskBadgeVariant } from '../../utils/risk';
import { alertSourceLabel, alertStatusLabel, shortReferenceLabel } from '../../utils/notification';
import { truncateText } from '../../utils/text';

interface AlertDetailDrawerProps {
  open: boolean;
  alert: AlertItem | null;
  mutationPending: boolean;
  assignmentPending: boolean;
  overridePending: boolean;
  clinicianId: string;
  seen: boolean;
  returnFocusRef?: RefObject<HTMLElement | null>;
  onOpenPatient: (patientId: string) => void;
  onClose: () => void;
  onAssignToMe: (alert: AlertItem) => void | Promise<void>;
  onTakeOver: (alert: AlertItem) => void | Promise<void>;
  onUnassign: (alert: AlertItem) => void | Promise<void>;
  onSaveRiskOverride: (
    alert: AlertItem,
    payload: { riskFinal: string; overrideReason?: string },
  ) => void | Promise<void>;
  onClearRiskOverride: (alert: AlertItem) => void | Promise<void>;
  onAcknowledge: (alert: AlertItem) => void;
  onResolve: (alert: AlertItem) => void;
  presentation?: 'drawer' | 'inline';
}

const DRAWER_TITLE_ID = 'alert-drawer-title';
const DRAWER_DESCRIPTION_ID = 'alert-drawer-description';

function asReasonText(reason: string | string[]): string {
  return Array.isArray(reason) ? reason.join(', ') : reason;
}

function statusBadgeVariant(
  status: AlertItem['status'],
): 'status-open' | 'status-ack' | 'status-resolved' {
  if (status === 'acknowledged') {
    return 'status-ack';
  }

  if (status === 'resolved') {
    return 'status-resolved';
  }

  return 'status-open';
}

function mergeTimeline(primary: TimelineEvent[] | undefined, fallback: TimelineEvent[]): TimelineEvent[] {
  const map = new Map<string, TimelineEvent>();

  (primary ?? []).forEach((event) => {
    const key = `${event.type}-${event.at}-${event.label}`;
    map.set(key, event);
  });

  fallback.forEach((event) => {
    const key = `${event.type}-${event.at}-${event.label}`;
    if (!map.has(key)) {
      map.set(key, event);
    }
  });

  return Array.from(map.values()).sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
}

export function AlertDetailDrawer({
  open,
  alert,
  mutationPending,
  assignmentPending,
  overridePending,
  clinicianId,
  seen,
  returnFocusRef,
  onOpenPatient,
  onClose,
  onAssignToMe,
  onTakeOver,
  onUnassign,
  onSaveRiskOverride,
  onClearRiskOverride,
  onAcknowledge,
  onResolve,
  presentation = 'drawer',
}: AlertDetailDrawerProps): JSX.Element {
  const [uiNotice, setUiNotice] = useState<string | null>(null);
  const [showResolveConfirm, setShowResolveConfirm] = useState(false);
  const [showFullReason, setShowFullReason] = useState(false);

  const resolveActionRef = useRef<HTMLButtonElement | null>(null);
  const queryClient = useQueryClient();

  const alertContextQuery = useAlertContext(alert?._id, open && Boolean(alert?._id));
  const retryNotificationMutation = useMutation({
    mutationFn: async (activeAlert: AlertItem) =>
      retryNotification(activeAlert._id, {
        requestedBy: clinicianId,
      }),
    onSuccess: async (result, activeAlert) => {
      setUiNotice(
        result.status === 'queued'
          ? 'Notification retry queued.'
          : 'Notification retry requested.',
      );

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
      setUiNotice(toUserMessage(asAppError(error)));
    },
  });

  useEffect(() => {
    setUiNotice(null);
    setShowResolveConfirm(false);
    setShowFullReason(false);
  }, [alert?._id]);

  const baseAlert = useMemo(() => {
    if (!alert) {
      return null;
    }

    const contextAlert = alertContextQuery.data?.alert;
    if (!contextAlert) {
      return alert;
    }

    return {
      ...contextAlert,
      assignedTo: alert.assignedTo ?? contextAlert.assignedTo,
      assignedToName: alert.assignedToName ?? contextAlert.assignedToName,
      assignedAt: alert.assignedAt ?? contextAlert.assignedAt,
      assignmentSource: alert.assignmentSource ?? contextAlert.assignmentSource,
      assignmentNote: alert.assignmentNote ?? contextAlert.assignmentNote,
      riskAuto: alert.riskAuto ?? contextAlert.riskAuto,
      reasonsAuto: alert.reasonsAuto ?? contextAlert.reasonsAuto,
      riskFinal: alert.riskFinal ?? contextAlert.riskFinal,
      overrideReason: alert.overrideReason ?? contextAlert.overrideReason,
      overriddenAt: alert.overriddenAt ?? contextAlert.overriddenAt,
      overriddenBy: alert.overriddenBy ?? contextAlert.overriddenBy,
      overriddenByName: alert.overriddenByName ?? contextAlert.overriddenByName,
    };
  }, [alert, alertContextQuery.data?.alert]);
  const effectiveAlert = baseAlert;

  const derivedTimeline = useMemo(() => {
    if (!effectiveAlert) {
      return [];
    }

    return deriveAlertTimeline(effectiveAlert);
  }, [effectiveAlert]);

  const timeline = useMemo(
    () => mergeTimeline(alertContextQuery.data?.timeline, derivedTimeline),
    [alertContextQuery.data?.timeline, derivedTimeline],
  );
  const reasonSummary = useMemo(() => {
    const text = effectiveAlert ? asReasonText(effectiveAlert.reason) : '';
    if (showFullReason) {
      return {
        text,
        truncated: false,
      };
    }

    return truncateText(text, 180);
  }, [effectiveAlert, showFullReason]);

  const assignmentBlocked = Boolean(
    effectiveAlert?.assignedTo && effectiveAlert.assignedTo !== clinicianId,
  );
  const agedOpen =
    effectiveAlert?.status === 'open' &&
    Date.parse(effectiveAlert.createdAt) <= Date.now() - 24 * 60 * 60 * 1000;

  const acknowledgeDisabled =
    !effectiveAlert || effectiveAlert.status !== 'open' || mutationPending || assignmentBlocked;
  const resolveDisabled =
    !effectiveAlert || effectiveAlert.status === 'resolved' || mutationPending || assignmentBlocked;
  const patientNavigationId = effectiveAlert?.patientId.trim() ? effectiveAlert.patientId.trim() : null;
  const effectiveRisk = effectiveAlert ? getEffectiveRisk(effectiveAlert) : null;

  function handleAcknowledge(): void {
    if (!effectiveAlert || acknowledgeDisabled) {
      return;
    }

    setUiNotice(null);
    onAcknowledge(effectiveAlert);
  }

  function handleResolve(): void {
    if (!effectiveAlert || resolveDisabled) {
      return;
    }

    setUiNotice(null);

    if (effectiveAlert.status === 'open') {
      setShowResolveConfirm(true);
      return;
    }

    onResolve(effectiveAlert);
  }

  function handleResolveConfirmed(): void {
    if (!effectiveAlert) {
      return;
    }

    setShowResolveConfirm(false);
    onResolve(effectiveAlert);
  }

  function handleRetryNotification(): void {
    if (!effectiveAlert || retryNotificationMutation.isPending) {
      return;
    }

    setUiNotice(null);
    retryNotificationMutation.mutate(effectiveAlert);
  }

  const footerActions = effectiveAlert ? (
    <div className="drawer-footer-actions safe-bottom">
      {presentation === 'drawer' ? (
        <Button variant="ghost" onClick={onClose} aria-label="Close alert drawer">
          Close
        </Button>
      ) : null}
      <Button
        ref={resolveActionRef}
        className="alerts-drawer__resolve"
        variant="secondary"
        disabled={resolveDisabled}
        onClick={handleResolve}
        aria-label="Resolve alert"
        data-testid="alert-resolve"
      >
        Resolve
      </Button>
      <Button
        variant="primary"
        disabled={acknowledgeDisabled}
        onClick={handleAcknowledge}
        aria-label="Acknowledge alert"
        data-testid="alert-acknowledge"
      >
        Acknowledge
      </Button>
    </div>
  ) : null;

  const detailContent = effectiveAlert ? (
    <div className="drawer-stack alerts-detail-stack">
      <section className="alerts-detail-brief" aria-label="Alert patient context">
        <div className="alerts-detail-brief__header">
          <div className="alerts-detail-brief__copy">
            <p className="alerts-detail-brief__eyebrow">Patient context</p>
            <h3 className="alerts-detail-brief__title">Patient {effectiveAlert.patientId}</h3>
            <p id={DRAWER_DESCRIPTION_ID} className="alerts-detail-brief__reason">
              {reasonSummary.text}
              {!showFullReason && reasonSummary.truncated ? (
                <>
                  {' '}
                  <button
                    type="button"
                    className="timeline__toggle"
                    onClick={() => setShowFullReason(true)}
                    aria-label="Show full alert reason"
                  >
                    Show more
                  </button>
                </>
              ) : null}
              {showFullReason && reasonSummary.text.length > 180 ? (
                <>
                  {' '}
                  <button
                    type="button"
                    className="timeline__toggle"
                    onClick={() => setShowFullReason(false)}
                    aria-label="Show shorter alert reason"
                  >
                    Show less
                  </button>
                </>
              ) : null}
            </p>
          </div>
          <div className="alerts-detail-brief__state">
            <Badge variant={statusBadgeVariant(effectiveAlert.status)} icon>
              {alertStatusLabel(effectiveAlert.status)}
            </Badge>
            {effectiveRisk ? (
              <Badge variant={riskBadgeVariant(effectiveRisk)}>
                {formatRiskLabel(effectiveRisk)}
              </Badge>
            ) : null}
            <Badge variant={seen ? 'success' : 'new'} icon>
              {seen ? 'Seen' : 'Unseen'}
            </Badge>
            <AssignmentChip alert={effectiveAlert} clinicianId={clinicianId} />
          </div>
        </div>

        <div className="alerts-detail-brief__meta">
          <div className="alerts-detail-brief__meta-item">
            <span className="alerts-detail-brief__meta-label">Owner</span>
            <span className="alerts-detail-brief__meta-value">
              {effectiveAlert.assignedTo
                ? effectiveAlert.assignedToName ?? effectiveAlert.assignedTo
                : 'Needs owner'}
            </span>
          </div>
          <div className="alerts-detail-brief__meta-item">
            <span className="alerts-detail-brief__meta-label">Created</span>
            <span className="alerts-detail-brief__meta-value" title={formatExactTime(effectiveAlert.createdAt)}>
              {formatRelativeTime(effectiveAlert.createdAt)}
            </span>
          </div>
          <div className="alerts-detail-brief__meta-item">
            <span className="alerts-detail-brief__meta-label">Source</span>
            <span className="alerts-detail-brief__meta-value">
              {alertSourceLabel(effectiveAlert.source.type)}
            </span>
          </div>
          <div className="alerts-detail-brief__meta-item">
            <span className="alerts-detail-brief__meta-label">Reference</span>
            <span className="alerts-detail-brief__meta-value">
              {shortReferenceLabel(effectiveAlert._id) ?? effectiveAlert._id}
            </span>
          </div>
        </div>

        <div className="alerts-detail-brief__actions">
          {patientNavigationId ? (
            <Button
              className="alerts-drawer__open-patient"
              variant="secondary"
              size="sm"
              onClick={() => onOpenPatient(patientNavigationId)}
            >
              Open patient
            </Button>
          ) : null}
          <AssignmentActions
            alert={effectiveAlert}
            clinicianId={clinicianId}
            busy={assignmentPending}
            allowUnassign
            size="sm"
            onAssignToMe={onAssignToMe}
            onTakeOver={onTakeOver}
            onUnassign={onUnassign}
          />
        </div>
      </section>

      {assignmentBlocked ? (
        <AlertBanner variant="warning" title="Action blocked by assignment">
          Assigned to {effectiveAlert.assignedToName ?? effectiveAlert.assignedTo}. Take over to enable
          acknowledge and resolve.
        </AlertBanner>
      ) : null}

      {agedOpen ? (
        <AlertBanner variant="warning" title="Open alert is aging">
          This alert has been open for more than 24 hours. Keep ownership and resolution context visible while you triage.
        </AlertBanner>
      ) : null}

      {effectiveAlert.notificationStatus === 'failed' ? (
        <AlertBanner variant="warning" title="Notification delivery failed">
          Outreach delivery failed for this alert. Review notification attempts before closing the safety workflow.
        </AlertBanner>
      ) : null}

      {alertContextQuery.error ? (
        <AlertBanner variant="warning" title="Could not load extended context">
          {toUserMessage(asAppError(alertContextQuery.error))}
        </AlertBanner>
      ) : null}

      {uiNotice ? <AlertBanner variant="info" title="Action note">{uiNotice}</AlertBanner> : null}

      <TriggeringEventPanel
        event={alertContextQuery.data?.triggeringEvent}
        loading={alertContextQuery.isFetching}
        onFetchDetails={() => {
          void alertContextQuery.refetch();
        }}
        fetchDisabled={alertContextQuery.isFetching}
      />

      <NotificationPanel
        alert={effectiveAlert}
        busy={retryNotificationMutation.isPending}
        onRetry={handleRetryNotification}
      />

      <AlertTimeline events={timeline} loading={alertContextQuery.isFetching && timeline.length === 0} />

      <RiskOverrideForm
        alert={effectiveAlert}
        saving={overridePending}
        onSave={(payload) => onSaveRiskOverride(effectiveAlert, payload)}
        onClear={() => onClearRiskOverride(effectiveAlert)}
      />
    </div>
  ) : open ? (
    <div className="drawer-stack" aria-label="Alert detail loading">
      <Skeleton height={104} />
      <Skeleton height={180} />
      <Skeleton height={180} />
    </div>
  ) : null;

  if (presentation === 'inline') {
    return (
      <>
        {open ? (
          <section
            className="alerts-detail-panel"
            role="dialog"
            aria-modal="false"
            aria-labelledby={DRAWER_TITLE_ID}
            aria-describedby={DRAWER_DESCRIPTION_ID}
            data-testid="alert-drawer"
          >
            <header className="alerts-detail-panel__header">
              <div className="alerts-detail-panel__heading">
                <p className="alerts-detail-panel__eyebrow">Persistent detail</p>
                <h2 id={DRAWER_TITLE_ID}>Alert</h2>
                <p className="alerts-detail-panel__subtitle">
                  Keep patient context, ownership, and next actions beside the queue.
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close alert drawer">
                Close
              </Button>
            </header>
            <div className="alerts-detail-panel__body">{detailContent}</div>
            {footerActions ? <footer className="alerts-detail-panel__footer">{footerActions}</footer> : null}
          </section>
        ) : null}

        <ConfirmDialog
          open={showResolveConfirm}
          title="Resolve alert now?"
          description="This alert is still open. Resolve only if clinical follow-up is complete."
          confirmLabel="Resolve"
          confirmVariant="danger"
          returnFocusRef={resolveActionRef}
          onCancel={() => setShowResolveConfirm(false)}
          onConfirm={handleResolveConfirmed}
        />
      </>
    );
  }

  return (
    <>
      <Drawer
        open={open}
        title="Alert"
        labelledBy={DRAWER_TITLE_ID}
        describedBy={DRAWER_DESCRIPTION_ID}
        mobileFullscreen
        dataTestId="alert-drawer"
        onClose={onClose}
        returnFocusRef={returnFocusRef}
        footer={footerActions}
      >
        {detailContent}
      </Drawer>

      <ConfirmDialog
        open={showResolveConfirm}
        title="Resolve alert now?"
        description="This alert is still open. Resolve only if clinical follow-up is complete."
        confirmLabel="Resolve"
        confirmVariant="danger"
        returnFocusRef={resolveActionRef}
        onCancel={() => setShowResolveConfirm(false)}
        onConfirm={handleResolveConfirmed}
      />
    </>
  );
}
