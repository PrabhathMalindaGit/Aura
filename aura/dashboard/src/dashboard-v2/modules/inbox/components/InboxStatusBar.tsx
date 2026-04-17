import { RefreshCcw } from 'lucide-react';
import { DashboardV2Button } from '../../../primitives/Button';
import { DashboardV2Surface } from '../../../primitives/Surface';
import { DashboardV2Heading, DashboardV2Text } from '../../../primitives/Text';

interface InboxStatusBarProps {
  currentViewLabel: string;
  currentViewCount: number;
  totalThreads: number;
  updatedAtLabel: string;
  guidanceLine: string;
  isRefreshing: boolean;
  onRefresh: () => void;
}

export function InboxStatusBar({
  currentViewLabel,
  currentViewCount,
  totalThreads,
  updatedAtLabel,
  guidanceLine,
  isRefreshing,
  onRefresh,
}: InboxStatusBarProps): JSX.Element {
  return (
    <DashboardV2Surface className="v2-inbox-status-bar" tone="elevated">
      <div className="v2-inbox-status-bar__copy">
        <DashboardV2Text tone="label">Communication triage</DashboardV2Text>
        <DashboardV2Heading as="h2">Inbox</DashboardV2Heading>
        <DashboardV2Text tone="muted">{guidanceLine}</DashboardV2Text>
      </div>

      <div className="v2-inbox-status-bar__facts" aria-label="Inbox status facts">
        <span className="v2-inbox-status-bar__pill">{currentViewLabel}</span>
        <span className="v2-inbox-status-bar__pill">
          {currentViewCount} in current view
        </span>
        <span className="v2-inbox-status-bar__pill">{totalThreads} total threads</span>
        <span className="v2-inbox-status-bar__pill">Updated {updatedAtLabel}</span>
      </div>

      <div className="v2-inbox-status-bar__actions">
        <DashboardV2Button
          tone="secondary"
          size="sm"
          onPress={onRefresh}
          leadingIcon={<RefreshCcw size={16} />}
        >
          {isRefreshing ? 'Refreshing...' : 'Refresh'}
        </DashboardV2Button>
      </div>
    </DashboardV2Surface>
  );
}
