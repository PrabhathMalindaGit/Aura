import {
  Ban,
  CalendarCheck2,
  CalendarClock,
  CheckCircle2,
  Eye,
  RefreshCcw,
  ShieldX,
} from 'lucide-react';
import type { AppointmentRequestFilter, AppointmentsStatusBarVm } from '../../../adapters/appointments';
import { ReviewSummaryStrip, type ReviewSummaryMetric } from '../../../patterns/ReviewSummaryStrip';

interface AppointmentsStatusBarProps {
  statusBar: AppointmentsStatusBarVm;
  activeRequestStatus: AppointmentRequestFilter;
  isRefreshing: boolean;
  onRefresh: () => void;
  onRequestStatusChange: (status: AppointmentRequestFilter) => void;
}

export function AppointmentsStatusBar({
  statusBar,
  activeRequestStatus,
  isRefreshing,
  onRefresh,
  onRequestStatusChange,
}: AppointmentsStatusBarProps): JSX.Element {
  const countForStatus = (status: AppointmentRequestFilter) =>
    statusBar.requestOptions.find((option) => option.id === status)?.count ?? 0;
  const openCapacityFact = statusBar.facts.find((fact) => fact.key === 'open');
  const visibleRequestsFact = statusBar.facts.find((fact) => fact.key === 'visible-requests');
  const metricItems: ReviewSummaryMetric[] = [
    {
      key: 'pending',
      label: 'Needs review',
      value: String(countForStatus('pending')),
      meta: countForStatus('pending') === 1 ? 'Request' : 'Requests',
      icon: CalendarClock,
      active: activeRequestStatus === 'pending',
      ariaLabel: `Needs review ${countForStatus('pending')}`,
      onPress: () => onRequestStatusChange('pending'),
    },
    {
      key: 'approved',
      label: 'Approved',
      value: String(countForStatus('approved')),
      meta: countForStatus('approved') === 1 ? 'Request' : 'Requests',
      icon: CheckCircle2,
      active: activeRequestStatus === 'approved',
      ariaLabel: `Approved ${countForStatus('approved')}`,
      onPress: () => onRequestStatusChange('approved'),
    },
    {
      key: 'rejected',
      label: 'Rejected',
      value: String(countForStatus('rejected')),
      meta: countForStatus('rejected') === 1 ? 'Request' : 'Requests',
      icon: ShieldX,
      active: activeRequestStatus === 'rejected',
      ariaLabel: `Rejected ${countForStatus('rejected')}`,
      onPress: () => onRequestStatusChange('rejected'),
    },
    {
      key: 'canceled',
      label: 'Canceled',
      value: String(countForStatus('canceled')),
      meta: countForStatus('canceled') === 1 ? 'Request' : 'Requests',
      icon: Ban,
      active: activeRequestStatus === 'canceled',
      ariaLabel: `Canceled ${countForStatus('canceled')}`,
      onPress: () => onRequestStatusChange('canceled'),
    },
    {
      key: 'open-capacity',
      label: 'Open capacity',
      value: openCapacityFact?.value ?? '0',
      meta: 'Slots',
      icon: CalendarCheck2,
    },
    {
      key: 'visible',
      label: 'Visible requests',
      value: visibleRequestsFact?.value ?? String(countForStatus(activeRequestStatus)),
      meta: 'Requests',
      icon: Eye,
    },
  ];

  return (
    <ReviewSummaryStrip
      className="v2-appointments-status-bar"
      kicker="Scheduling review"
      title={statusBar.title}
      summary={statusBar.guidanceLine}
      metrics={metricItems}
      metricLabel="Appointment scheduling metrics"
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
