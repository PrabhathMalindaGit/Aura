import type { TrendPointNormalized } from '../../types/models';
import {
  formatDateKey,
  formatMedication,
  formatMoodValue,
  formatPainValue,
  formatPercent,
} from '../../utils/format';
import { trendPointHasAnyData } from '../../utils/trends';
import { Button } from '../ui/Button';

interface AccessibleTrendListProps {
  points: TrendPointNormalized[];
  onSelectDate: (date: string, triggerElement?: HTMLElement | null) => void;
}

export function AccessibleTrendList({
  points,
  onSelectDate,
}: AccessibleTrendListProps): JSX.Element {
  return (
    <ul className="trend-access-list" aria-label="Trend details by day">
      {points.map((point) => {
        const hasCheckin = trendPointHasAnyData(point);

        return (
          <li key={point.date} className="trend-access-list__item" data-testid={`trend-row-${point.date}`}>
            <span className="trend-access-list__text">
              <strong>{formatDateKey(point.date)}</strong>
              {hasCheckin ? (
                <span className="muted-text">
                  Pain {formatPainValue(point.pain)} | Mood {formatMoodValue(point.mood)} | Exercises{' '}
                  {formatPercent(point.exercises)} | Medication {formatMedication(point.medication)}
                </span>
              ) : (
                <span className="muted-text">No check-in recorded.</span>
              )}
            </span>
            <Button
              variant="ghost"
              data-testid={`trend-view-${point.date}`}
              onClick={(event) => onSelectDate(point.date, event.currentTarget)}
              aria-label={`View details for ${formatDateKey(point.date)}`}
            >
              View details
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
