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
import { formatRiskLabel } from '../../utils/risk';
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

  const acknowledgeDisabled =
    !effectiveAlert || effectiveAlert.status !== 'open' || mutationPending || assignmentBlocked;
  const resolveDisabled =
    !effectiveAlert || effectiveAlert.status === 'resolved' || mutationPending || assignmentBlocked;
  const patientNavigationId = effectiveAlert?.patientId.trim() ? effectiveAlert.patientId.trim() : null;

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
        footer={
          effectiveAlert ? (
            <div className="drawer-footer-actions safe-bottom">
              <Button variant="ghost" onClick={onClose} aria-label="Close alert drawer">
                Close
              </Button>
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
          ) : null
        }
      >
        {effectiveAlert ? (
          <div className="drawer-stack">
            <section className="drawer-meta" aria-label="Alert header context">
              <h3>Alert</h3>
              <div className="drawer-meta__badges">
                <span className="drawer-meta__patient">Patient {effectiveAlert.patientId}</span>
                <Badge variant={statusBadgeVariant(effectiveAlert.status)} icon>
                  {alertStatusLabel(effectiveAlert.status)}
                </Badge>
                <Badge variant={seen ? 'success' : 'new'} icon>
                  {seen ? 'Seen' : 'Unseen'}
                </Badge>
                <AssignmentChip alert={effectiveAlert} clinicianId={clinicianId} />
              </div>
              <p id={DRAWER_DESCRIPTION_ID} className="muted-text">
                {shortReferenceLabel(effectiveAlert._id) ?? effectiveAlert._id}. Source{' '}
                {alertSourceLabel(effectiveAlert.source.type)}.
              </p>
              {patientNavigationId ? (
                <div className="drawer-meta__actions">
                  <Button
                    className="alerts-drawer__open-patient"
                    variant="secondary"
                    size="sm"
                    onClick={() => onOpenPatient(patientNavigationId)}
                  >
                    Open patient
                  </Button>
                </div>
              ) : null}
            </section>

            {assignmentBlocked ? (
              <AlertBanner variant="warning" title="Action blocked by assignment">
                Assigned to {effectiveAlert.assignedToName ?? effectiveAlert.assignedTo}. Take over to enable
                acknowledge and resolve.
              </AlertBanner>
            ) : null}

            {alertContextQuery.error ? (
              <AlertBanner variant="warning" title="Could not load extended context">
                {toUserMessage(asAppError(alertContextQuery.error))}
              </AlertBanner>
            ) : null}

            {uiNotice ? <AlertBanner variant="info" title="Action note">{uiNotice}</AlertBanner> : null}

            <section className="drawer-section" aria-label="Assignment details">
              <h3>Assignment</h3>
              <p className="muted-text">
                {effectiveAlert.assignedTo
                  ? `Assigned to ${effectiveAlert.assignedToName ?? effectiveAlert.assignedTo}${
                      effectiveAlert.assignedAt
                        ? ` at ${formatExactTime(effectiveAlert.assignedAt)}`
                        : ''
                    }.`
                  : 'No clinician currently assigned.'}
              </p>
              <div className="drawer-inline-actions">
                <AssignmentActions
                  alert={effectiveAlert}
                  clinicianId={clinicianId}
                  busy={assignmentPending}
                  allowUnassign
                  onAssignToMe={onAssignToMe}
                  onTakeOver={onTakeOver}
                  onUnassign={onUnassign}
                />
                <span className="muted-text">Assignment changes save to the live alert record.</span>
              </div>
            </section>

            <section className="drawer-section" aria-label="Alert summary">
              <h3>Summary</h3>
              <dl className="summary-grid">
                <div>
                  <dt>Risk</dt>
                  <dd>{formatRiskLabel(effectiveAlert.riskFinal ?? effectiveAlert.risk)}</dd>
                </div>
                <div>
                  <dt>Auto risk</dt>
                  <dd>{formatRiskLabel(effectiveAlert.riskAuto ?? effectiveAlert.risk)}</dd>
                </div>
                <div>
                  <dt>Reason</dt>
                  <dd>
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
                  </dd>
                </div>
                <div>
                  <dt>Created</dt>
                  <dd title={formatExactTime(effectiveAlert.createdAt)}>{formatRelativeTime(effectiveAlert.createdAt)}</dd>
                </div>
                <div>
                  <dt>Source</dt>
                  <dd>
                    {alertSourceLabel(effectiveAlert.source.type)}
                    {effectiveAlert.source.sourceId
                      ? ` (${shortReferenceLabel(effectiveAlert.source.sourceId, 'Source ref')})`
                      : ''}
                  </dd>
                </div>
                <div>
                  <dt>Alert ID</dt>
                  <dd>{effectiveAlert._id}</dd>
                </div>
              </dl>
            </section>

            <TriggeringEventPanel
              event={alertContextQuery.data?.triggeringEvent}
              loading={alertContextQuery.isFetching}
              onFetchDetails={() => {
                void alertContextQuery.refetch();
              }}
              fetchDisabled={alertContextQuery.isFetching}
            />

            <AlertTimeline events={timeline} loading={alertContextQuery.isFetching && timeline.length === 0} />

            <RiskOverrideForm
              alert={effectiveAlert}
              saving={overridePending}
              onSave={(payload) => onSaveRiskOverride(effectiveAlert, payload)}
              onClear={() => onClearRiskOverride(effectiveAlert)}
            />

            <NotificationPanel
              alert={effectiveAlert}
              busy={retryNotificationMutation.isPending}
              onRetry={handleRetryNotification}
            />
          </div>
        ) : open ? (
          <div className="drawer-stack" aria-label="Alert detail loading">
            <Skeleton height={104} />
            <Skeleton height={180} />
            <Skeleton height={180} />
          </div>
        ) : null}
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
