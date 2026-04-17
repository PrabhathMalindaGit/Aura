import { RefreshCcw } from 'lucide-react';
import type {
  AlertStatus,
} from '../../../../types/models';
import type { AlertsStatusBarVm } from '../../../adapters/alerts';
import { DashboardV2Button } from '../../../primitives/Button';
import { DashboardV2Surface } from '../../../primitives/Surface';
import { DashboardV2Heading, DashboardV2Text } from '../../../primitives/Text';

interface AlertsStatusBarProps {
  statusBar: AlertsStatusBarVm;
  activeStatus: AlertStatus;
  filterCount: number;
  isRefreshing: boolean;
  onRefresh: () => void;
  onStatusChange: (status: AlertStatus) => void;
  onClearView: () => void;
}

export function AlertsStatusBar({
  statusBar,
  activeStatus,
  filterCount,
  isRefreshing,
  onRefresh,
  onStatusChange,
  onClearView,
}: AlertsStatusBarProps): JSX.Element {
  return (
    <DashboardV2Surface className="v2-alerts-status-bar" tone="elevated">
      <div className="v2-alerts-status-bar__copy">
        <DashboardV2Text tone="label">Governance-first review</DashboardV2Text>
        <DashboardV2Heading as="h1">{statusBar.title}</DashboardV2Heading>
        <DashboardV2Text tone="muted">{statusBar.guidanceLine}</DashboardV2Text>
      </div>

      <div className="v2-alerts-status-bar__views" aria-label="Alert status views">
        {statusBar.statusOptions.map((option) => (
          <DashboardV2Button
            key={option.id}
            tone={option.id === activeStatus ? 'primary' : 'ghost'}
            size="sm"
            onPress={() => onStatusChange(option.id)}
          >
            {`${option.label} (${option.count})`}
          </DashboardV2Button>
        ))}
      </div>

      <div className="v2-alerts-status-bar__facts" aria-live="polite">
        <span className="v2-alerts-status-bar__pill">{statusBar.viewLabel}</span>
        {statusBar.facts.map((fact) => (
          <span key={fact.key} className="v2-alerts-status-bar__pill">
            {fact.label} {fact.value}
          </span>
        ))}
        <span className="v2-alerts-status-bar__pill">
          {filterCount > 0
            ? `${filterCount} filter${filterCount === 1 ? '' : 's'} active`
            : 'No filters active'}
        </span>
      </div>

      <div className="v2-alerts-status-bar__actions">
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
    </DashboardV2Surface>
  );
}
