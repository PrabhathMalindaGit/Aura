import { RefreshCcw } from 'lucide-react';
import { DashboardV2Button } from '../../../primitives/Button';
import { DashboardV2Surface } from '../../../primitives/Surface';
import { DashboardV2Heading, DashboardV2Text } from '../../../primitives/Text';

interface QueueStatusBarProps {
  queueViewLabel: string;
  guidanceLine: string;
  total: number;
  updatedAtLabel: string;
  activeFilterCount: number;
  isRefreshing: boolean;
  onRefresh: () => void;
  onClearView: () => void;
}

export function QueueStatusBar({
  queueViewLabel,
  guidanceLine,
  total,
  updatedAtLabel,
  activeFilterCount,
  isRefreshing,
  onRefresh,
  onClearView,
}: QueueStatusBarProps): JSX.Element {
  return (
    <DashboardV2Surface className="triage-status-bar" tone="muted">
      <div className="triage-status-bar__main">
        <div className="triage-status-bar__copy">
          <DashboardV2Text tone="label">Active review</DashboardV2Text>
          <DashboardV2Heading as="h1">Triage queue</DashboardV2Heading>
          <DashboardV2Text tone="muted">
            {guidanceLine}
          </DashboardV2Text>
        </div>

        <div className="triage-status-bar__actions">
          <DashboardV2Button
            tone="secondary"
            size="sm"
            onPress={onRefresh}
            leadingIcon={<RefreshCcw size={16} />}
          >
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </DashboardV2Button>
          <DashboardV2Button tone="ghost" size="sm" onPress={onClearView}>
            Clear view
          </DashboardV2Button>
        </div>
      </div>

      <div className="triage-status-bar__facts" aria-live="polite">
        <span className="triage-status-bar__pill">{queueViewLabel}</span>
        <span className="triage-status-bar__pill">{total} in view</span>
        <span className="triage-status-bar__pill">Updated {updatedAtLabel}</span>
        <span className="triage-status-bar__pill">
          {activeFilterCount > 0 ? `${activeFilterCount} filter${activeFilterCount === 1 ? '' : 's'} active` : 'No filters active'}
        </span>
      </div>
    </DashboardV2Surface>
  );
}
