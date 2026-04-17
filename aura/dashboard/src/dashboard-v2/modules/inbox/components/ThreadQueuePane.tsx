import type { CommunicationThreadView } from '../../../../services/communicationWorkspace';
import type { InboxQueueRowVm } from '../../../adapters/communication';
import { DashboardV2Heading, DashboardV2Text } from '../../../primitives/Text';
import { DashboardV2Surface } from '../../../primitives/Surface';
import { ThreadFilterBar } from './ThreadFilterBar';
import { ThreadList } from './ThreadList';

interface ThreadQueuePaneProps {
  currentView: CommunicationThreadView;
  counts: Record<CommunicationThreadView, number>;
  isVeryNarrow: boolean;
  loading: boolean;
  rows: InboxQueueRowVm[];
  selectedKey: string | null;
  statusTitle?: string;
  statusDescription?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
  onRetry?: () => void;
  onViewChange: (value: CommunicationThreadView) => void;
  onSelect: (key: string) => void;
  queueRef?: React.RefObject<HTMLDivElement | null>;
  onQueueScroll?: (value: number) => void;
}

export function ThreadQueuePane({
  currentView,
  counts,
  isVeryNarrow,
  loading,
  rows,
  selectedKey,
  statusTitle,
  statusDescription,
  emptyTitle,
  emptyDescription,
  emptyActionLabel,
  onEmptyAction,
  onRetry,
  onViewChange,
  onSelect,
  queueRef,
  onQueueScroll,
}: ThreadQueuePaneProps): JSX.Element {
  return (
    <DashboardV2Surface className="v2-inbox-queue-pane" tone="base" data-testid="v2-inbox-queue">
      <header className="v2-inbox-queue-pane__header">
        <div className="v2-inbox-queue-pane__copy">
          <DashboardV2Text tone="label">Scan the queue</DashboardV2Text>
          <DashboardV2Heading as="h2">Message queue</DashboardV2Heading>
          <DashboardV2Text tone="muted">
            Select the next patient thread that needs clinician follow-through.
          </DashboardV2Text>
        </div>
      </header>

      <ThreadFilterBar
        currentView={currentView}
        counts={counts}
        isVeryNarrow={isVeryNarrow}
        onViewChange={onViewChange}
      />

      <div
        ref={queueRef}
        className="v2-inbox-queue-pane__body"
        onScroll={(event) => onQueueScroll?.(event.currentTarget.scrollTop)}
      >
        <ThreadList
          rows={rows}
          selectedKey={selectedKey}
          loading={loading}
          statusTitle={statusTitle}
          statusDescription={statusDescription}
          emptyTitle={emptyTitle}
          emptyDescription={emptyDescription}
          emptyActionLabel={emptyActionLabel}
          onEmptyAction={onEmptyAction}
          onRetry={onRetry}
          onSelect={onSelect}
        />
      </div>
    </DashboardV2Surface>
  );
}
