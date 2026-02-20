import type { AlertStatus } from '../../types/models';
import { cn } from '../../utils/cn';

interface StatusTabsProps {
  value: AlertStatus;
  onChange: (status: AlertStatus) => void;
}

const statuses: Array<{ value: AlertStatus; label: string }> = [
  { value: 'open', label: 'Open' },
  { value: 'acknowledged', label: 'Acknowledged' },
  { value: 'resolved', label: 'Resolved' },
];

export function StatusTabs({ value, onChange }: StatusTabsProps): JSX.Element {
  return (
    <div className="alerts-status-tabs" role="tablist" aria-label="Alert status tabs">
      {statuses.map((status) => {
        const selected = value === status.value;

        return (
          <button
            key={status.value}
            type="button"
            role="tab"
            aria-selected={selected}
            className={cn('alerts-status-tabs__tab', selected && 'alerts-status-tabs__tab--active')}
            onClick={() => onChange(status.value)}
          >
            {status.label}
          </button>
        );
      })}
    </div>
  );
}
