import { useMemo } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TrendPointNormalized } from '../../types/models';
import { formatDateKey, formatDateKeyShort, formatMedication, formatMoodValue, formatPainValue, formatPercent } from '../../utils/format';
import { trendPointHasAnyData } from '../../utils/trends';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

interface TrendChartsProps {
  points: TrendPointNormalized[];
  onSelectDate: (date: string, triggerElement?: HTMLElement | null) => void;
}

interface ChartRow extends TrendPointNormalized {
  label: string;
  medicationNumeric: number | null;
}

interface InteractiveDotProps {
  cx?: number;
  cy?: number;
  payload?: ChartRow;
  value?: number | null;
  stroke?: string;
  ariaPrefix: string;
  onSelectDate: (date: string) => void;
}

function InteractiveDot({
  cx,
  cy,
  payload,
  value,
  stroke,
  ariaPrefix,
  onSelectDate,
}: InteractiveDotProps): JSX.Element | null {
  if (cx === undefined || cy === undefined || !payload || value === null) {
    return null;
  }

  const label = `${ariaPrefix} ${formatDateKey(payload.date)}`;

  return (
    <circle
      role="button"
      tabIndex={0}
      aria-label={label}
      cx={cx}
      cy={cy}
      r={5}
      fill={stroke ?? 'var(--color-primary)'}
      stroke="var(--color-surface)"
      strokeWidth={2}
      onClick={() => onSelectDate(payload.date)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelectDate(payload.date);
        }
      }}
    />
  );
}

function toNumericOrNull(value: unknown): number | null {
  return typeof value === 'number' && !Number.isNaN(value) ? value : null;
}

function medicationTickFormatter(value: number): string {
  return value === 1 ? 'Taken' : 'Not taken';
}

export function TrendCharts({ points, onSelectDate }: TrendChartsProps): JSX.Element {
  const chartRows = useMemo<ChartRow[]>(
    () =>
      points.map((point) => ({
        ...point,
        label: formatDateKeyShort(point.date),
        medicationNumeric: point.medication === null ? null : point.medication ? 1 : 0,
      })),
    [points],
  );

  const detailRows = useMemo(() => points.filter((point) => trendPointHasAnyData(point)), [points]);

  return (
    <section className="trend-charts-stack" aria-label="Patient trend charts">
      <Card title="Pain trend (0-10)">
        <div className="trend-chart__canvas">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartRows}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="label" stroke="var(--color-muted)" />
              <YAxis domain={[0, 10]} stroke="var(--color-muted)" />
              <Tooltip
                formatter={(value: unknown) => formatPainValue(toNumericOrNull(value))}
                labelFormatter={(_label, payload) => {
                  const row = payload?.[0]?.payload as ChartRow | undefined;
                  return row ? formatDateKey(row.date) : '';
                }}
              />
              <Line
                type="monotone"
                dataKey="pain"
                name="Pain"
                stroke="var(--color-danger)"
                strokeWidth={2}
                connectNulls={false}
                dot={(props: any) => (
                  <InteractiveDot
                    {...(props as unknown as InteractiveDotProps)}
                    ariaPrefix="Pain point"
                    onSelectDate={(date) => onSelectDate(date)}
                  />
                )}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card title="Mood trend">
        <div className="trend-chart__canvas">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartRows}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="label" stroke="var(--color-muted)" />
              <YAxis domain={[0, 10]} stroke="var(--color-muted)" />
              <Tooltip
                formatter={(value: unknown) => formatMoodValue(toNumericOrNull(value))}
                labelFormatter={(_label, payload) => {
                  const row = payload?.[0]?.payload as ChartRow | undefined;
                  return row ? formatDateKey(row.date) : '';
                }}
              />
              <Line
                type="monotone"
                dataKey="mood"
                name="Mood"
                stroke="var(--color-primary)"
                strokeWidth={2}
                connectNulls={false}
                dot={(props: any) => (
                  <InteractiveDot
                    {...(props as unknown as InteractiveDotProps)}
                    ariaPrefix="Mood point"
                    onSelectDate={(date) => onSelectDate(date)}
                  />
                )}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card title="Adherence trend">
        <div className="trend-chart__canvas">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartRows}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="label" stroke="var(--color-muted)" />
              <YAxis
                domain={[0, 1]}
                stroke="var(--color-muted)"
                tickFormatter={(value) => `${Math.round(value * 100)}%`}
              />
              <Tooltip
                formatter={(value: unknown, name?: string) => {
                  const numeric = toNumericOrNull(value);
                  if (name === 'Medication') {
                    return medicationTickFormatter(numeric ?? 0);
                  }

                  return formatPercent(numeric);
                }}
                labelFormatter={(_label, payload) => {
                  const row = payload?.[0]?.payload as ChartRow | undefined;
                  return row ? formatDateKey(row.date) : '';
                }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="exercises"
                name="Exercises"
                stroke="var(--color-success)"
                strokeWidth={2}
                connectNulls={false}
                dot={(props: any) => (
                  <InteractiveDot
                    {...(props as unknown as InteractiveDotProps)}
                    ariaPrefix="Exercise point"
                    onSelectDate={(date) => onSelectDate(date)}
                  />
                )}
              />
              <Line
                type="step"
                dataKey="medicationNumeric"
                name="Medication"
                stroke="var(--color-warning)"
                strokeWidth={2}
                connectNulls={false}
                dot={(props: any) => (
                  <InteractiveDot
                    {...(props as unknown as InteractiveDotProps)}
                    ariaPrefix="Medication point"
                    onSelectDate={(date) => onSelectDate(date)}
                  />
                )}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card title="Trend details list">
        <ul className="trend-chart__list" aria-label="Trend details by day">
          {detailRows.map((point) => (
            <li key={point.date} className="trend-chart__list-item">
              <span>
                <strong>{formatDateKey(point.date)}</strong>
                <span className="muted-text">
                  Pain {formatPainValue(point.pain)} | Mood {formatMoodValue(point.mood)} | Exercises {formatPercent(point.exercises)} | Medication {formatMedication(point.medication)}
                </span>
              </span>
              <Button
                variant="ghost"
                onClick={(event) => onSelectDate(point.date, event.currentTarget)}
                aria-label={`Open day detail for ${formatDateKey(point.date)}`}
              >
                View details
              </Button>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}
