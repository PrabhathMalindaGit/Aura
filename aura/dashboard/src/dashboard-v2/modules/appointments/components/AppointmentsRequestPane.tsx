import type { RefObject } from 'react';
import type {
  AppointmentRequestRowVm,
  AppointmentReviewHeaderVm,
  AppointmentsGovernanceVm,
} from '../../../adapters/appointments';
import type { AppointmentRequestItem } from '../../../../types/models';
import { DashboardV2Surface } from '../../../primitives/Surface';
import { DashboardV2Heading, DashboardV2Text } from '../../../primitives/Text';
import { AppointmentRequestRow } from './AppointmentRequestRow';

interface RequestReviewOutcomeState {
  status: 'approved' | 'rejected';
  patientLabel: string;
}

export interface AppointmentRequestRailContext {
  header: AppointmentReviewHeaderVm | null;
  request: AppointmentRequestItem | null;
  governance: AppointmentsGovernanceVm | null;
  reviewOutcome: RequestReviewOutcomeState | null;
  reviewErrorMessage: string | null;
  mutationPending: boolean;
  onApprove: () => void;
  onReject: () => void;
  onOpenPatient: () => void;
}

interface AppointmentsRequestPaneProps {
  rows: AppointmentRequestRowVm[];
  selectedRequestId: string | null;
  loading: boolean;
  emptyTitle: string;
  emptyDescription: string;
  isVeryNarrow: boolean;
  requestRef?: RefObject<HTMLDivElement | null>;
  onRequestScroll?: (scrollTop: number) => void;
  onSelectRequest: (requestId: string) => void;
  selectedContext: AppointmentRequestRailContext;
}

export function AppointmentsRequestPane({
  rows,
  selectedRequestId,
  loading,
  emptyTitle,
  emptyDescription,
  isVeryNarrow,
  requestRef,
  onRequestScroll,
  onSelectRequest,
  selectedContext,
}: AppointmentsRequestPaneProps): JSX.Element {
  return (
    <DashboardV2Surface className="v2-appointments-request-pane" tone="base">
      <div className="v2-appointments-request-pane__header">
        <div>
          <DashboardV2Text tone="label">Review requests</DashboardV2Text>
          <DashboardV2Heading as="h2">Request lane {rows.length > 0 ? rows.length : ''}</DashboardV2Heading>
          <DashboardV2Text tone="muted">
            Compact scheduling requests for the next review decision.
          </DashboardV2Text>
        </div>
      </div>

      {selectedContext.reviewOutcome ? (
        <DashboardV2Surface className="v2-appointments-request-pane__notice" tone="muted">
          <DashboardV2Text tone="strong">
            {selectedContext.reviewOutcome.status === 'approved' ? 'Request approved' : 'Request rejected'}
          </DashboardV2Text>
          <DashboardV2Text tone="muted">
            {selectedContext.reviewOutcome.patientLabel}{' '}
            {selectedContext.reviewOutcome.status === 'approved'
              ? 'moved out of pending review.'
              : 'stayed out of the pending review queue.'}
          </DashboardV2Text>
        </DashboardV2Surface>
      ) : null}

      {selectedContext.reviewErrorMessage ? (
        <DashboardV2Surface className="v2-appointments-request-pane__notice" tone="muted">
          <DashboardV2Text tone="strong">Could not update request</DashboardV2Text>
          <DashboardV2Text tone="muted">{selectedContext.reviewErrorMessage}</DashboardV2Text>
        </DashboardV2Surface>
      ) : null}

      <div
        ref={requestRef}
        className="v2-appointments-request-pane__body"
        onScroll={(event) => onRequestScroll?.(event.currentTarget.scrollTop)}
        data-testid="v2-appointments-request-pane"
      >
        {loading ? (
          <div className="v2-appointments-request-pane__skeleton" aria-label="Appointment requests loading">
            <div className="v2-appointments-skeleton v2-appointments-skeleton--row" />
            <div className="v2-appointments-skeleton v2-appointments-skeleton--row" />
            <div className="v2-appointments-skeleton v2-appointments-skeleton--row" />
          </div>
        ) : rows.length === 0 ? (
          <DashboardV2Surface className="v2-appointments-request-pane__empty" tone="muted">
            <DashboardV2Heading as="h3">{emptyTitle}</DashboardV2Heading>
            <DashboardV2Text tone="muted">{emptyDescription}</DashboardV2Text>
          </DashboardV2Surface>
        ) : (
          <div className="v2-appointments-request-pane__list" role="list" aria-label="Appointment requests">
            {rows.map((row) => (
              <AppointmentRequestRow
                key={row.key}
                row={row}
                selected={row.requestId === selectedRequestId}
                isVeryNarrow={isVeryNarrow}
                onSelect={() => onSelectRequest(row.requestId)}
                selectedContext={row.requestId === selectedRequestId ? selectedContext : null}
              />
            ))}
          </div>
        )}
      </div>
    </DashboardV2Surface>
  );
}
