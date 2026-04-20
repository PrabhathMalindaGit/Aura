import { RefreshCcw } from 'lucide-react';
import type { WorklistFilters as WorklistFiltersState } from '../../../../utils/worklist';
import type { TriageQueueRowVm } from '../../../adapters/worklist';
import { DashboardV2ClinicianQuietState } from '../../../patterns/ClinicianQuietState';
import { DashboardV2Button } from '../../../primitives/Button';
import { DashboardV2Surface } from '../../../primitives/Surface';
import { DashboardV2Heading, DashboardV2Text } from '../../../primitives/Text';
import { QueueFilters } from './QueueFilters';
import { QueueList } from './QueueList';

interface QueuePaneProps {
  filters: WorklistFiltersState;
  activeFilterCount: number;
  disabled?: boolean;
  isCompactLayout: boolean;
  isVeryNarrow: boolean;
  rows: TriageQueueRowVm[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  onSearchChange: (value: string) => void;
  onToggleFilter: (
    key:
      | 'highRiskOnly'
      | 'hasOpenAlerts'
      | 'needsResponse'
      | 'missedCheckins'
      | 'needsPromReview'
      | 'assignedToMe',
  ) => void;
  onStatusChange: (value: WorklistFiltersState['status']) => void;
  onSortChange: (value: WorklistFiltersState['sort']) => void;
  onReset: () => void;
  loading: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
  statusTitle?: string;
  statusDescription?: string;
  onRetry?: () => void;
  queueRef?: React.RefObject<HTMLDivElement | null>;
  onQueueScroll?: (scrollTop: number) => void;
}

export function QueuePane({
  filters,
  activeFilterCount,
  disabled = false,
  isCompactLayout,
  isVeryNarrow,
  rows,
  selectedKey,
  onSelect,
  onSearchChange,
  onToggleFilter,
  onStatusChange,
  onSortChange,
  onReset,
  loading,
  emptyTitle,
  emptyDescription,
  emptyActionLabel,
  onEmptyAction,
  statusTitle,
  statusDescription,
  onRetry,
  queueRef,
  onQueueScroll,
}: QueuePaneProps): JSX.Element {
  const visibleCountLabel = rows.length === 1 ? '1 active case' : `${rows.length} active cases`;

  return (
    <DashboardV2Surface className="triage-queue-pane" tone="muted">
      <div className="triage-queue-pane__header">
        <div className="triage-queue-pane__title">
          <DashboardV2Heading as="h2">Patients in review</DashboardV2Heading>
          <DashboardV2Text tone="muted">
            {loading ? 'Refreshing queue' : visibleCountLabel}
          </DashboardV2Text>
        </div>
      </div>

      <div className="triage-queue-pane__filters">
        <QueueFilters
          filters={filters}
          activeFilterCount={activeFilterCount}
          disabled={disabled}
          isCompactLayout={isCompactLayout}
          isVeryNarrow={isVeryNarrow}
          onSearchChange={onSearchChange}
          onToggleFilter={onToggleFilter}
          onStatusChange={onStatusChange}
          onSortChange={onSortChange}
          onReset={onReset}
        />
      </div>

      <div
        ref={queueRef}
        className="triage-queue-pane__body"
        onScroll={(event) => onQueueScroll?.(event.currentTarget.scrollTop)}
      >
        {loading ? (
          <div className="triage-queue-pane__skeleton" aria-label="Queue loading placeholder">
            <div className="triage-skeleton triage-skeleton--row" />
            <div className="triage-skeleton triage-skeleton--row" />
            <div className="triage-skeleton triage-skeleton--row" />
          </div>
        ) : statusTitle ? (
          <DashboardV2ClinicianQuietState
            className="triage-queue-pane__empty"
            eyebrow="Queue status"
            title={statusTitle}
            description={statusDescription}
            action={
              onRetry ? (
                <DashboardV2Button
                  tone="secondary"
                  size="sm"
                  onPress={onRetry}
                  leadingIcon={<RefreshCcw size={16} />}
                >
                  Retry
                </DashboardV2Button>
              ) : undefined
            }
          />
        ) : rows.length === 0 ? (
          <DashboardV2ClinicianQuietState
            className="triage-queue-pane__empty"
            eyebrow="Review lane"
            title={emptyTitle ?? 'No patients in this view'}
            description={emptyDescription}
            action={
              onEmptyAction && emptyActionLabel ? (
                <DashboardV2Button tone="secondary" size="sm" onPress={onEmptyAction}>
                  {emptyActionLabel}
                </DashboardV2Button>
              ) : undefined
            }
          />
        ) : (
          <QueueList rows={rows} selectedKey={selectedKey} onSelect={onSelect} />
        )}
      </div>
    </DashboardV2Surface>
  );
}
