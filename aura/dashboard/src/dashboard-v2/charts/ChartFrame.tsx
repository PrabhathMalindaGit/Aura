import type { ReactNode } from 'react';
import type { ProvenanceSource } from '../adapters/viewModels';
import { DashboardV2Surface } from '../primitives/Surface';
import { DashboardV2Heading, DashboardV2Text } from '../primitives/Text';
import { DashboardV2ProvenanceBadge } from '../patterns/ProvenanceBadge';

interface DashboardV2ChartFrameProps {
  title: string;
  summary: string;
  description?: string;
  thresholdLabel?: string;
  provenance?: ProvenanceSource[];
  dataTablePath?: ReactNode;
  children: ReactNode;
}

export function DashboardV2ChartFrame({
  title,
  summary,
  description,
  thresholdLabel,
  provenance = [],
  dataTablePath,
  children,
}: DashboardV2ChartFrameProps): JSX.Element {
  return (
    <DashboardV2Surface className="v2-chart-frame" tone="elevated">
      <header className="v2-chart-frame__header">
        <div className="v2-chart-frame__copy">
          <DashboardV2Heading as="h2">{title}</DashboardV2Heading>
          <DashboardV2Text tone="strong">{summary}</DashboardV2Text>
          {description ? <DashboardV2Text tone="muted">{description}</DashboardV2Text> : null}
        </div>
        <div className="v2-chart-frame__meta">
          {thresholdLabel ? (
            <span className="v2-chart-frame__threshold">Threshold: {thresholdLabel}</span>
          ) : null}
          {provenance.map((source) => (
            <DashboardV2ProvenanceBadge key={source} source={source} />
          ))}
        </div>
      </header>
      <div className="v2-chart-frame__visual">{children}</div>
      {dataTablePath ? <div className="v2-chart-frame__table-link">{dataTablePath}</div> : null}
    </DashboardV2Surface>
  );
}
