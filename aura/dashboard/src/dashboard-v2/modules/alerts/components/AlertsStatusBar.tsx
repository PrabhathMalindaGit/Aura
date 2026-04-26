import {
  CheckCircle2,
  Eye,
  Filter,
  Inbox,
  RefreshCcw,
  ShieldCheck,
} from 'lucide-react';
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
  const activeOption = statusBar.statusOptions.find((option) => option.id === activeStatus);
  const visibleFact = statusBar.facts.find((fact) => fact.key === 'visible');
  const metricItems = [
    {
      key: 'open',
      label: 'Open',
      value: String(statusBar.statusOptions.find((option) => option.id === 'open')?.count ?? 0),
      meta: 'Alerts',
      icon: Inbox,
      active: activeStatus === 'open',
      status: 'open' as AlertStatus,
    },
    {
      key: 'acknowledged',
      label: 'Acknowledged',
      value: String(statusBar.statusOptions.find((option) => option.id === 'acknowledged')?.count ?? 0),
      meta: 'Alerts',
      icon: CheckCircle2,
      active: activeStatus === 'acknowledged',
      status: 'acknowledged' as AlertStatus,
    },
    {
      key: 'resolved',
      label: 'Resolved',
      value: String(statusBar.statusOptions.find((option) => option.id === 'resolved')?.count ?? 0),
      meta: 'Alerts',
      icon: ShieldCheck,
      active: activeStatus === 'resolved',
      status: 'resolved' as AlertStatus,
    },
    {
      key: 'queue',
      label: statusBar.viewLabel,
      value: String(activeOption?.count ?? 0),
      meta: activeOption?.count === 1 ? 'Alert' : 'Alerts',
      icon: Inbox,
      active: false,
    },
    {
      key: 'visible',
      label: 'Visible alerts',
      value: visibleFact?.value ?? '0',
      meta: 'Alerts',
      icon: Eye,
      active: false,
    },
    {
      key: 'filters',
      label: 'Active filters',
      value: String(filterCount),
      meta: filterCount === 1 ? 'Active' : 'Active',
      icon: Filter,
      active: false,
    },
  ];

  return (
    <DashboardV2Surface className="v2-alerts-status-bar" tone="elevated">
      <div className="v2-alerts-status-bar__copy">
        <DashboardV2Text tone="label">Governance-first review</DashboardV2Text>
        <DashboardV2Heading as="h1">{statusBar.title}</DashboardV2Heading>
        <DashboardV2Text tone="muted">{statusBar.guidanceLine}</DashboardV2Text>
      </div>

      <div className="v2-alerts-status-bar__metrics" aria-label="Alert governance metrics" aria-live="polite">
        {metricItems.map((item) => (
          <button
            key={item.key}
            type="button"
            className={[
              'v2-alerts-status-bar__metric',
              item.active ? 'v2-alerts-status-bar__metric--active' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => {
              if (item.status) {
                onStatusChange(item.status);
              }
            }}
            aria-pressed={item.active || undefined}
            disabled={!item.status}
          >
            <item.icon size={18} aria-hidden="true" />
            <span>
              <span className="v2-alerts-status-bar__metric-label">{item.label}</span>
              <strong>{item.value}</strong>
              <span className="v2-alerts-status-bar__metric-meta">{item.meta}</span>
            </span>
          </button>
        ))}
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
