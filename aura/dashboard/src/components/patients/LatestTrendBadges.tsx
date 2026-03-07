import { formatMedication, formatMoodValue, formatPainValue, formatPercent } from '../../utils/format';
import { deriveTrendSummary } from '../../utils/trends';
import type { TrendPointNormalized } from '../../types/models';

interface LatestTrendBadgesProps {
  points: TrendPointNormalized[];
}

export function LatestTrendBadges({ points }: LatestTrendBadgesProps): JSX.Element {
  const summary = deriveTrendSummary(points);

  return (
    <section className="latest-trend-badges" aria-label="Latest trend values">
      <article className="latest-trend-badge latest-trend-badge--pain">
        <p className="latest-trend-badge__label">Latest pain</p>
        <p className="latest-trend-badge__value">{formatPainValue(summary.latestPain)}</p>
      </article>
      <article className="latest-trend-badge latest-trend-badge--mood">
        <p className="latest-trend-badge__label">Latest mood</p>
        <p className="latest-trend-badge__value">{formatMoodValue(summary.latestMood)}</p>
      </article>
      <article className="latest-trend-badge latest-trend-badge--exercise">
        <p className="latest-trend-badge__label">Exercises</p>
        <p className="latest-trend-badge__value">{formatPercent(summary.latestExercises)}</p>
      </article>
      <article className="latest-trend-badge latest-trend-badge--medication">
        <p className="latest-trend-badge__label">Medication</p>
        <p className="latest-trend-badge__value">{formatMedication(summary.latestMedication)}</p>
      </article>
    </section>
  );
}
