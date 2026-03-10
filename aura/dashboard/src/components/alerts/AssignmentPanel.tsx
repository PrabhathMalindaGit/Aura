import type { RefObject } from 'react';
import { Button } from '../ui/Button';

interface AssignmentPanelProps {
  assignedTo?: string;
  currentClinicianId: string;
  backendReady?: boolean;
  busy?: boolean;
  actionButtonRef?: RefObject<HTMLButtonElement>;
  onAssignToMe: () => void;
  onTakeOver: () => void;
}

export function AssignmentPanel({
  assignedTo,
  currentClinicianId,
  backendReady = true,
  busy = false,
  actionButtonRef,
  onAssignToMe,
  onTakeOver,
}: AssignmentPanelProps): JSX.Element {
  const assignedToCurrentUser = assignedTo === currentClinicianId;
  const assignedToOther = Boolean(assignedTo && !assignedToCurrentUser);

  return (
    <section className="drawer-section" aria-label="Assignment">
      <h3>Assignment</h3>
      <p className="muted-text">
        {assignedTo
          ? assignedToCurrentUser
            ? 'Assigned to you.'
            : `Assigned to ${assignedTo}.`
          : 'No clinician currently assigned.'}
      </p>

      <div className="drawer-inline-actions">
        {assignedToCurrentUser ? (
          <Button variant="ghost" disabled>
            Assigned to me
          </Button>
        ) : assignedToOther ? (
          <Button ref={actionButtonRef} variant="secondary" onClick={onTakeOver} disabled={busy}>
            Take over
          </Button>
        ) : (
          <Button ref={actionButtonRef} variant="secondary" onClick={onAssignToMe} disabled={busy}>
            Assign to me
          </Button>
        )}
        <span className="muted-text">
          {backendReady
            ? 'Assignment updates save to the live alert record.'
            : 'Assignment controls are visible here, but this surface is not using the live alert assignment API.'}
        </span>
      </div>
    </section>
  );
}
