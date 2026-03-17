import { useId, useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TrendPointNormalized } from '../../types/models';
import {
  formatDateKey,
  formatDateKeyShort,
  formatMoodValue,
  formatPainValue,
  formatPercent,
} from '../../utils/format';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { AccessibleTrendList } from './AccessibleTrendList';
import { LatestTrendBadges } from './LatestTrendBadges';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import { getChartAnimationConfig, isJsdomRuntime, mapMedicationToNumeric } from '../../utils/chart';

interface TrendChartsProps {
  points: TrendPointNormalized[];
  onSelectDate: (date: string, triggerElement?: HTMLElement | null) => void;
  expandedMetric?: 'pain' | 'mood' | 'adherence' | null;
  onExpandMetric?: (metric: 'pain' | 'mood' | 'adherence') => void;
  onCollapseMetric?: () => void;
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
  color: string;
  ariaPrefix: string;
  onSelectDate: (date: string) => void;
}

interface ChartClickState {
  activePayload?: Array<{ payload?: ChartRow }>;
}

function InteractiveDot({
  cx,
  cy,
  payload,
  value,
  color,
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
      r={4}
      fill={color}
      stroke="hsl(var(--card))"
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

function medicationTickFormatter(value: number): string {
  if (value === 1) {
    return 'Taken';
  }

  if (value === 0) {
    return 'Not taken';
  }

  return '—';
}

function getChartDate(state: ChartClickState | undefined): string | null {
  return state?.activePayload?.[0]?.payload?.date ?? null;
}

function renderResponsiveChart(chartElement: JSX.Element): JSX.Element {
  if (isJsdomRuntime()) {
    return chartElement;
  }

  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
      {chartElement}
    </ResponsiveContainer>
  );
}

export function TrendCharts({
  points,
  onSelectDate,
  expandedMetric = null,
  onExpandMetric,
  onCollapseMetric,
}: TrendChartsProps): JSX.Element {
  const prefersReducedMotion = usePrefersReducedMotion();
  const animation = getChartAnimationConfig(prefersReducedMotion);
  const gradientSeed = useId().replace(/:/g, '-');
  const painGradientId = `${gradientSeed}-pain-gradient`;
  const moodGradientId = `${gradientSeed}-mood-gradient`;
  const adherenceGradientId = `${gradientSeed}-adherence-gradient`;

  const chartRows = useMemo<ChartRow[]>(
    () =>
      points.map((point) => ({
        ...point,
        label: formatDateKeyShort(point.date),
        medicationNumeric: mapMedicationToNumeric(point.medication),
      })),
    [points],
  );

  function renderTrendAction(metric: 'pain' | 'mood' | 'adherence', label: string): JSX.Element | null {
    if (expandedMetric === metric && onCollapseMetric) {
      return (
        <Button variant="secondary" size="sm" onClick={onCollapseMetric}>
          Collapse trend
        </Button>
      );
    }

    if (!onExpandMetric) {
      return null;
    }

    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          onExpandMetric(metric);
        }}
      >
        Expand {label}
      </Button>
    );
  }

  function renderPainCard(expanded: boolean): JSX.Element {
    const chartHeight = expanded ? 360 : 280;

    return (
      <Card
        title={
          <div className="trend-chart__title">
            <span>{expanded ? 'Expanded pain trend' : 'Pain trend'}</span>
            <small className="muted-text">Pain (0-10)</small>
          </div>
        }
        action={renderTrendAction('pain', 'pain trend')}
        className={`trend-chart-card trend-chart-card--pain${expanded ? ' trend-chart-card--expanded' : ''}`}
        data-testid={expanded ? 'trend-chart-expanded-pain' : 'trend-chart-card-pain'}
      >
        <div
          className={`trend-chart__canvas${expanded ? ' trend-chart__canvas--expanded' : ''}`}
          role="img"
          aria-label="Pain trend line chart"
        >
          {renderResponsiveChart(
            <AreaChart
              width={640}
              height={chartHeight}
              data={chartRows}
              onClick={(state) => {
                const date = getChartDate(state as ChartClickState | undefined);
                if (date) {
                  onSelectDate(date);
                }
              }}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id={painGradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--chart-pain) / var(--chart-fill-alpha-start))" />
                  <stop offset="100%" stopColor="hsl(var(--chart-pain) / var(--chart-fill-alpha-end))" />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border) / var(--chart-grid-alpha))"
              />
              <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" />
              <YAxis domain={[0, 10]} stroke="hsl(var(--muted-foreground))" />
              <Tooltip
                formatter={(value: number | string | null) =>
                  formatPainValue(typeof value === 'number' ? value : null)
                }
                labelFormatter={(_label, payload) => {
                  const row = payload?.[0]?.payload as ChartRow | undefined;
                  return row ? formatDateKey(row.date) : '';
                }}
              />
              <Area
                type="monotone"
                dataKey="pain"
                name="Pain"
                stroke="hsl(var(--chart-pain) / var(--chart-stroke-alpha))"
                strokeWidth={2}
                fill={`url(#${painGradientId})`}
                connectNulls={false}
                activeDot={{ r: 6 }}
                dot={(props) => (
                  <InteractiveDot
                    cx={props.cx}
                    cy={props.cy}
                    payload={props.payload as ChartRow}
                    value={typeof props.value === 'number' ? props.value : null}
                    color="hsl(var(--chart-pain) / var(--chart-stroke-alpha))"
                    ariaPrefix="Pain point"
                    onSelectDate={(date) => onSelectDate(date)}
                  />
                )}
                isAnimationActive={animation.isAnimationActive}
                animationDuration={animation.animationDuration}
              />
            </AreaChart>,
          )}
        </div>
      </Card>
    );
  }

  function renderMoodCard(expanded: boolean): JSX.Element {
    const chartHeight = expanded ? 360 : 280;

    return (
      <Card
        title={
          <div className="trend-chart__title">
            <span>{expanded ? 'Expanded mood trend' : 'Mood trend'}</span>
            <small className="muted-text">Mood score</small>
          </div>
        }
        action={renderTrendAction('mood', 'mood trend')}
        className={`trend-chart-card trend-chart-card--mood${expanded ? ' trend-chart-card--expanded' : ''}`}
        data-testid={expanded ? 'trend-chart-expanded-mood' : 'trend-chart-card-mood'}
      >
        <div
          className={`trend-chart__canvas${expanded ? ' trend-chart__canvas--expanded' : ''}`}
          role="img"
          aria-label="Mood trend line chart"
        >
          {renderResponsiveChart(
            <AreaChart
              width={640}
              height={chartHeight}
              data={chartRows}
              onClick={(state) => {
                const date = getChartDate(state as ChartClickState | undefined);
                if (date) {
                  onSelectDate(date);
                }
              }}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id={moodGradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--chart-mood) / var(--chart-fill-alpha-start))" />
                  <stop offset="100%" stopColor="hsl(var(--chart-mood) / var(--chart-fill-alpha-end))" />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border) / var(--chart-grid-alpha))"
              />
              <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" />
              <YAxis domain={[0, 10]} stroke="hsl(var(--muted-foreground))" />
              <Tooltip
                formatter={(value: number | string | null) =>
                  formatMoodValue(typeof value === 'number' ? value : null)
                }
                labelFormatter={(_label, payload) => {
                  const row = payload?.[0]?.payload as ChartRow | undefined;
                  return row ? formatDateKey(row.date) : '';
                }}
              />
              <Area
                type="monotone"
                dataKey="mood"
                name="Mood"
                stroke="hsl(var(--chart-mood) / var(--chart-stroke-alpha))"
                strokeWidth={2}
                fill={`url(#${moodGradientId})`}
                connectNulls={false}
                activeDot={{ r: 6 }}
                dot={(props) => (
                  <InteractiveDot
                    cx={props.cx}
                    cy={props.cy}
                    payload={props.payload as ChartRow}
                    value={typeof props.value === 'number' ? props.value : null}
                    color="hsl(var(--chart-mood) / var(--chart-stroke-alpha))"
                    ariaPrefix="Mood point"
                    onSelectDate={(date) => onSelectDate(date)}
                  />
                )}
                isAnimationActive={animation.isAnimationActive}
                animationDuration={animation.animationDuration}
              />
            </AreaChart>,
          )}
        </div>
      </Card>
    );
  }

  function renderAdherenceCard(expanded: boolean): JSX.Element {
    const chartHeight = expanded ? 360 : 280;

    return (
      <Card
        title={
          <div className="trend-chart__title">
            <span>{expanded ? 'Expanded adherence trend' : 'Adherence trend'}</span>
            <small className="muted-text">Exercises (%) and medication</small>
          </div>
        }
        action={renderTrendAction('adherence', 'adherence trend')}
        className={`trend-chart-card trend-chart-card--adherence${
          expanded ? ' trend-chart-card--expanded' : ''
        }`}
        data-testid={expanded ? 'trend-chart-expanded-adherence' : 'trend-chart-card-adherence'}
      >
        <div
          className={`trend-chart__canvas${expanded ? ' trend-chart__canvas--expanded' : ''}`}
          role="img"
          aria-label="Adherence trend chart"
        >
          {renderResponsiveChart(
            <ComposedChart
              width={640}
              height={chartHeight}
              data={chartRows}
              onClick={(state) => {
                const date = getChartDate(state as ChartClickState | undefined);
                if (date) {
                  onSelectDate(date);
                }
              }}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id={adherenceGradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--chart-adherence) / var(--chart-fill-alpha-start))" />
                  <stop offset="100%" stopColor="hsl(var(--chart-adherence) / var(--chart-fill-alpha-end))" />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border) / var(--chart-grid-alpha))"
              />
              <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" />
              <YAxis
                domain={[0, 1]}
                stroke="hsl(var(--muted-foreground))"
                tickFormatter={(value) => `${Math.round(value * 100)}%`}
              />
              <Tooltip
                formatter={(value: number | string | null, name) => {
                  if (name === 'Medication') {
                    return medicationTickFormatter(typeof value === 'number' ? value : 0);
                  }

                  return formatPercent(typeof value === 'number' ? value : null);
                }}
                labelFormatter={(_label, payload) => {
                  const row = payload?.[0]?.payload as ChartRow | undefined;
                  return row ? formatDateKey(row.date) : '';
                }}
              />
              <Area
                type="monotone"
                dataKey="exercises"
                name="Exercises"
                stroke="hsl(var(--chart-adherence) / var(--chart-stroke-alpha))"
                strokeWidth={2}
                fill={`url(#${adherenceGradientId})`}
                connectNulls={false}
                activeDot={{ r: 6 }}
                dot={(props) => (
                  <InteractiveDot
                    cx={props.cx}
                    cy={props.cy}
                    payload={props.payload as ChartRow}
                    value={typeof props.value === 'number' ? props.value : null}
                    color="hsl(var(--chart-adherence) / var(--chart-stroke-alpha))"
                    ariaPrefix="Exercise point"
                    onSelectDate={(date) => onSelectDate(date)}
                  />
                )}
                isAnimationActive={animation.isAnimationActive}
                animationDuration={animation.animationDuration}
              />
              <Scatter
                dataKey="medicationNumeric"
                name="Medication"
                fill="hsl(var(--warning))"
                shape={(props) => (
                  <InteractiveDot
                    cx={props.cx}
                    cy={props.cy}
                    payload={props.payload as ChartRow}
                    value={
                      typeof props.payload?.medicationNumeric === 'number'
                        ? props.payload.medicationNumeric
                        : null
                    }
                    color="hsl(var(--warning))"
                    ariaPrefix="Medication point"
                    onSelectDate={(date) => onSelectDate(date)}
                  />
                )}
                isAnimationActive={animation.isAnimationActive}
                animationDuration={animation.animationDuration}
              />
            </ComposedChart>,
          )}
        </div>
      </Card>
    );
  }

  const expandedCard =
    expandedMetric === 'pain'
      ? renderPainCard(true)
      : expandedMetric === 'mood'
        ? renderMoodCard(true)
        : expandedMetric === 'adherence'
          ? renderAdherenceCard(true)
          : null;

  return (
    <section className="trend-charts-stack" aria-label="Patient trend charts">
      <LatestTrendBadges points={points} />

      {expandedCard ? (
        <div className="trend-chart-focus" data-testid="trend-chart-expanded-shell">
          {expandedCard}
          <p className="trend-chart-focus__note">
            Expanded view uses the same chart data and day drilldown already available in the main trend review.
          </p>
        </div>
      ) : null}

      <div className="trend-charts-grid">
        {expandedMetric !== 'pain' ? renderPainCard(false) : null}
        {expandedMetric !== 'mood' ? renderMoodCard(false) : null}
        {expandedMetric !== 'adherence' ? renderAdherenceCard(false) : null}
      </div>

      <Card
        className="trend-chart-card trend-chart-card--drilldown"
        title={
          <div className="trend-chart__title">
            <span>Day drilldown</span>
            <small className="muted-text">Keyboard-friendly list for opening day detail</small>
          </div>
        }
      >
        <AccessibleTrendList points={points} onSelectDate={onSelectDate} />
      </Card>
    </section>
  );
}
