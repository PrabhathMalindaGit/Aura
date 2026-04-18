import { RefreshCcw } from 'lucide-react';
import type { InsightsStatusBarVm, InsightsView } from '../../../adapters/insights';
import { DashboardV2Button } from '../../../primitives/Button';
import { DashboardV2Surface } from '../../../primitives/Surface';
import { DashboardV2Heading, DashboardV2Text } from '../../../primitives/Text';

interface InsightsStatusBarProps {
  statusBar: InsightsStatusBarVm;
  activeView: InsightsView;
  isRefreshing: boolean;
  onRefresh: () => void;
  onViewChange: (view: InsightsView) => void;
}

export function InsightsStatusBar({
  statusBar,
  activeView,
  isRefreshing,
  onRefresh,
  onViewChange,
}: InsightsStatusBarProps): JSX.Element {
  return (
    <DashboardV2Surface className="v2-insights-status-bar" tone="elevated">
      <div className="v2-insights-status-bar__copy">
        <DashboardV2Text tone="label">Follow-up review</DashboardV2Text>
        <DashboardV2Heading as="h1">{statusBar.title}</DashboardV2Heading>
        <DashboardV2Text tone="muted">{statusBar.guidanceLine}</DashboardV2Text>
      </div>

      <div className="v2-insights-status-bar__views" aria-label="Insight lifecycle views">
        {statusBar.statusOptions.map((option) => (
          <DashboardV2Button
            key={option.id}
            tone={option.id === activeView ? 'primary' : 'ghost'}
            size="sm"
            onPress={() => onViewChange(option.id)}
          >
            {`${option.label} (${option.count})`}
          </DashboardV2Button>
        ))}
      </div>

      <div className="v2-insights-status-bar__facts">
        <span className="v2-insights-status-bar__pill">{statusBar.viewLabel}</span>
        {statusBar.facts.map((fact) => (
          <span key={fact.key} className="v2-insights-status-bar__pill">
            {fact.label} {fact.value}
          </span>
        ))}
      </div>

      <div className="v2-insights-status-bar__actions">
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
