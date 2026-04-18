import type { InsightsGovernanceVm } from '../../../adapters/insights';
import { DashboardV2Surface } from '../../../primitives/Surface';
import { DashboardV2Heading, DashboardV2Text } from '../../../primitives/Text';

interface InsightsGovernanceRailProps {
  governance: InsightsGovernanceVm | null;
}

function renderFacts(
  title: string,
  facts: Array<{ label: string; value: string }>,
): JSX.Element {
  return (
    <DashboardV2Surface className="v2-insights-governance-rail__section" tone="muted">
      <DashboardV2Text tone="label">{title}</DashboardV2Text>
      <div className="v2-insights-governance-rail__facts">
        {facts.map((fact) => (
          <article key={`${title}-${fact.label}`} className="v2-insights-governance-rail__fact">
            <DashboardV2Text tone="label">{fact.label}</DashboardV2Text>
            <DashboardV2Text tone="strong">{fact.value}</DashboardV2Text>
          </article>
        ))}
      </div>
    </DashboardV2Surface>
  );
}

export function InsightGovernanceRail({
  governance,
}: InsightsGovernanceRailProps): JSX.Element {
  if (!governance) {
    return (
      <DashboardV2Surface className="v2-insights-governance-rail__idle" tone="muted">
        <DashboardV2Heading as="h3">Support context</DashboardV2Heading>
        <DashboardV2Text tone="muted">
          Select a follow-up suggestion to review patient context, supported metadata, and route-specific governance notes.
        </DashboardV2Text>
      </DashboardV2Surface>
    );
  }

  return (
    <aside className="v2-insights-governance-rail" aria-label="Insight support context">
      <DashboardV2Surface className="v2-insights-governance-rail__intro" tone="elevated">
        <DashboardV2Text tone="label">Patient context</DashboardV2Text>
        <DashboardV2Heading as="h3">{governance.patientTitle}</DashboardV2Heading>
        <DashboardV2Text tone="muted">{governance.patientSubtitle}</DashboardV2Text>
      </DashboardV2Surface>

      {renderFacts('Patient facts', governance.patientFacts)}
      {renderFacts('Review facts', governance.reviewFacts)}
      {renderFacts('Support facts', governance.supportFacts)}

      <DashboardV2Surface className="v2-insights-governance-rail__section" tone="muted">
        <DashboardV2Text tone="label">Trust boundary</DashboardV2Text>
        <DashboardV2Text tone="muted">{governance.explanation}</DashboardV2Text>
      </DashboardV2Surface>
    </aside>
  );
}
