import { cn } from '../../utils/cn';

export interface ClinicianTimelineListItem {
  id: string;
  title: string;
  timestampLabel: string;
  timestampTitle?: string;
  detail?: string;
  icon?: string;
  detailToggle?: {
    label: string;
    onClick: () => void;
  };
  tone?: 'default' | 'warning' | 'danger' | 'success';
}

interface ClinicianTimelineListProps {
  items: ClinicianTimelineListItem[];
  className?: string;
  emptyTitle?: string;
}

export function ClinicianTimelineList({
  items,
  className,
  emptyTitle = 'No activity available yet.',
}: ClinicianTimelineListProps): JSX.Element {
  if (items.length === 0) {
    return (
      <div className={cn('clinician-timeline clinician-timeline--empty', className)}>
        <p className="clinician-timeline__empty">{emptyTitle}</p>
      </div>
    );
  }

  return (
    <ol className={cn('clinician-timeline', className)} aria-label="Clinician timeline">
      {items.map((item) => (
        <li
          key={item.id}
          className={cn('clinician-timeline__item', item.tone && `clinician-timeline__item--${item.tone}`)}
        >
          <span className="clinician-timeline__icon" aria-hidden="true">
            {item.icon ?? '•'}
          </span>
          <div className="clinician-timeline__content">
            <div className="clinician-timeline__header">
              <strong className="clinician-timeline__title">{item.title}</strong>
              <span className="clinician-timeline__time" title={item.timestampTitle}>
                {item.timestampLabel}
              </span>
            </div>
            {item.detail ? <p className="clinician-timeline__detail">{item.detail}</p> : null}
            {item.detailToggle ? (
              <button
                type="button"
                className="timeline__toggle"
                onClick={item.detailToggle.onClick}
              >
                {item.detailToggle.label}
              </button>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
