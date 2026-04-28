import {
  CheckCircle2,
  Eye,
  Inbox,
  RefreshCcw,
  ShieldX,
  Sparkles,
} from 'lucide-react';
import type { InsightsStatusBarVm, InsightsView } from '../../../adapters/insights';
import { ReviewSummaryStrip, type ReviewSummaryMetric } from '../../../patterns/ReviewSummaryStrip';

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
  const countForView = (view: InsightsView) =>
    statusBar.statusOptions.find((option) => option.id === view)?.count ?? 0;
  const activeOption = statusBar.statusOptions.find((option) => option.id === activeView);
  const individualPendingFact = statusBar.facts.find((fact) => fact.key === 'individual-pending');
  const visibleFact = statusBar.facts.find((fact) => fact.key === 'visible');
  const metricItems: ReviewSummaryMetric[] = [
    {
      key: 'pending',
      label: 'Pending',
      value: String(countForView('pending')),
      meta: countForView('pending') === 1 ? 'Suggestion' : 'Suggestions',
      icon: Inbox,
      active: activeView === 'pending',
      ariaLabel: `Pending (${countForView('pending')})`,
      onPress: () => onViewChange('pending'),
    },
    {
      key: 'approved',
      label: 'Approved',
      value: String(countForView('approved')),
      meta: countForView('approved') === 1 ? 'Suggestion' : 'Suggestions',
      icon: CheckCircle2,
      active: activeView === 'approved',
      ariaLabel: `Approved (${countForView('approved')})`,
      onPress: () => onViewChange('approved'),
    },
    {
      key: 'rejected',
      label: 'Rejected',
      value: String(countForView('rejected')),
      meta: countForView('rejected') === 1 ? 'Suggestion' : 'Suggestions',
      icon: ShieldX,
      active: activeView === 'rejected',
      ariaLabel: `Rejected (${countForView('rejected')})`,
      onPress: () => onViewChange('rejected'),
    },
    {
      key: 'pending-follow-up',
      label: 'Pending follow-up',
      value: individualPendingFact?.value ?? '0',
      meta: 'Needs review',
      icon: Sparkles,
    },
    {
      key: 'visible',
      label: 'Visible suggestions',
      value: visibleFact?.value ?? String(activeOption?.count ?? 0),
      meta: 'Suggestions',
      icon: Eye,
    },
  ];

  return (
    <ReviewSummaryStrip
      className="v2-insights-status-bar"
      kicker="Follow-up review"
      title={statusBar.title}
      summary={statusBar.guidanceLine}
      metrics={metricItems}
      metricLabel="Insight lifecycle metrics"
      actions={[
        {
          key: 'refresh',
          label: isRefreshing ? 'Refreshing...' : 'Refresh',
          tone: 'secondary',
          leadingIcon: <RefreshCcw size={16} />,
          onPress: onRefresh,
        },
      ]}
    />
  );
}
