import type { AlertStatus } from '../../types/models';
import { cn } from '../../utils/cn';

interface StatusTabsProps {
  value: AlertStatus;
  onChange: (status: AlertStatus) => void;
  counts?: Partial<Record<AlertStatus, number>>;
}

const statuses: Array<{ value: AlertStatus; label: string }> = [
  { value: 'open', label: 'Open' },
  { value: 'acknowledged', label: 'Acknowledged' },
  { value: 'resolved', label: 'Resolved' },
];

function statusTabTestId(status: AlertStatus): string {
  if (status === 'acknowledged') {
    return 'alerts-tab-ack';
  }

  return `alerts-tab-${status}`;
}

export function StatusTabs({ value, onChange, counts }: StatusTabsProps): JSX.Element {
  return (
    <div className="alerts-status-tabs" role="tablist" aria-label="Alert status tabs">
      {statuses.map((status) => {
        const selected = value === status.value;
        const count = counts?.[status.value];

        return (
          <button
            key={status.value}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-label={status.label}
            data-testid={statusTabTestId(status.value)}
            className={cn('alerts-status-tabs__tab', selected && 'alerts-status-tabs__tab--active')}
            onClick={() => onChange(status.value)}
          >
            <span className="alerts-status-tabs__label">{status.label}</span>
            {typeof count === 'number' ? (
              <span className="alerts-status-tabs__count" aria-hidden="true">
                {count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
