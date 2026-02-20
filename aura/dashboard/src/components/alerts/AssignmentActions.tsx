import { useRef, useState } from 'react';
import type { AlertItem } from '../../types/models';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';

interface AssignmentActionsProps {
  alert: AlertItem;
  clinicianId: string;
  busy?: boolean;
  allowUnassign?: boolean;
  fullWidth?: boolean;
  onAssignToMe: (alert: AlertItem) => void | Promise<void>;
  onTakeOver: (alert: AlertItem) => void | Promise<void>;
  onUnassign?: (alert: AlertItem) => void | Promise<void>;
}

function assigneeLabel(alert: AlertItem): string {
  return alert.assignedToName?.trim() || alert.assignedTo || 'another clinician';
}

export function AssignmentActions({
  alert,
  clinicianId,
  busy = false,
  allowUnassign = false,
  fullWidth = false,
  onAssignToMe,
  onTakeOver,
  onUnassign,
}: AssignmentActionsProps): JSX.Element {
  const [showTakeoverConfirm, setShowTakeoverConfirm] = useState(false);
  const takeoverTriggerRef = useRef<HTMLButtonElement | null>(null);

  const assignedToCurrentUser = Boolean(alert.assignedTo && alert.assignedTo === clinicianId);
  const assignedToOther = Boolean(alert.assignedTo && alert.assignedTo !== clinicianId);

  return (
    <>
      {assignedToCurrentUser ? (
        allowUnassign ? (
          <Button
            variant="ghost"
            onClick={() => {
              void onUnassign?.(alert);
            }}
            disabled={busy}
            fullWidth={fullWidth}
          >
            Unassign
          </Button>
        ) : (
          <Button variant="ghost" disabled aria-label="Assigned to me">
            Assigned to me
          </Button>
        )
      ) : assignedToOther ? (
        <Button
          ref={takeoverTriggerRef}
          variant="secondary"
          onClick={() => setShowTakeoverConfirm(true)}
          disabled={busy}
          fullWidth={fullWidth}
        >
          Take over
        </Button>
      ) : (
        <Button
          variant="secondary"
          onClick={() => {
            void onAssignToMe(alert);
          }}
          disabled={busy}
          fullWidth={fullWidth}
        >
          Assign to me
        </Button>
      )}

      <ConfirmDialog
        open={showTakeoverConfirm}
        title="Take over this alert?"
        description={`This alert is assigned to ${assigneeLabel(alert)}. Taking over will transfer responsibility.`}
        confirmLabel="Take over"
        confirmVariant="primary"
        returnFocusRef={takeoverTriggerRef}
        onCancel={() => setShowTakeoverConfirm(false)}
        onConfirm={() => {
          setShowTakeoverConfirm(false);
          void onTakeOver(alert);
        }}
      />
    </>
  );
}
