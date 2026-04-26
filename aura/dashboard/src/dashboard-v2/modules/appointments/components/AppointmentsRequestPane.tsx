import type { RefObject } from 'react';
import type { AppointmentRequestRowVm } from '../../../adapters/appointments';
import { DashboardV2Surface } from '../../../primitives/Surface';
import { DashboardV2Heading, DashboardV2Text } from '../../../primitives/Text';
import { AppointmentRequestRow } from './AppointmentRequestRow';

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
              />
            ))}
          </div>
        )}
      </div>
    </DashboardV2Surface>
  );
}
