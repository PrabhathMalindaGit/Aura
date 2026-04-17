import type { AlertGovernanceVm } from '../../../adapters/alerts';
import { DashboardV2Button } from '../../../primitives/Button';
import { DashboardV2Surface } from '../../../primitives/Surface';
import { DashboardV2Heading, DashboardV2Text } from '../../../primitives/Text';

interface AlertGovernanceRailProps {
  governance: AlertGovernanceVm | null;
  onOpenExplanation?: () => void;
}

interface AlertFactSectionProps {
  title: string;
  subtitle?: string;
  facts: Array<{ label: string; value: string }>;
  footer?: JSX.Element;
}

function AlertFactSection({
  title,
  subtitle,
  facts,
  footer,
}: AlertFactSectionProps): JSX.Element {
  return (
    <DashboardV2Surface className="v2-alert-governance-rail__card" tone="muted">
      <div className="v2-alert-governance-rail__card-header">
        <DashboardV2Text tone="label">{title}</DashboardV2Text>
        {subtitle ? <DashboardV2Text tone="muted">{subtitle}</DashboardV2Text> : null}
      </div>
      <dl className="v2-alert-governance-rail__facts">
        {facts.map((fact) => (
          <div key={`${title}-${fact.label}`} className="v2-alert-governance-rail__fact">
            <dt>{fact.label}</dt>
            <dd>{fact.value}</dd>
          </div>
        ))}
      </dl>
      {footer}
    </DashboardV2Surface>
  );
}

export function AlertPatientContextSection({
  governance,
}: {
  governance: AlertGovernanceVm;
}): JSX.Element {
  return (
    <AlertFactSection
      title="Patient context"
      subtitle={`${governance.patientTitle} · ${governance.patientSubtitle}`}
      facts={governance.patientFacts}
    />
  );
}

export function AlertWorkflowSection({
  governance,
}: {
  governance: AlertGovernanceVm;
}): JSX.Element {
  return (
    <AlertFactSection
      title="Workflow"
      subtitle={`Latest audit ${governance.latestAudit}`}
      facts={governance.governanceFacts}
    />
  );
}

export function AlertGovernanceMetadataSection({
  governance,
  onOpenExplanation,
}: {
  governance: AlertGovernanceVm;
  onOpenExplanation?: () => void;
}): JSX.Element {
  return (
    <div className="v2-alert-governance-rail__stack">
      <AlertFactSection title="Threshold metadata" facts={governance.thresholdFacts} />
      <AlertFactSection
        title="Notification and audit"
        facts={governance.notificationFacts}
        footer={
          onOpenExplanation ? (
            <div className="v2-alert-governance-rail__footer">
              <DashboardV2Button tone="ghost" size="sm" onPress={onOpenExplanation}>
                Open explanation
              </DashboardV2Button>
            </div>
          ) : undefined
        }
      />
    </div>
  );
}

export function AlertGovernanceRail({
  governance,
  onOpenExplanation,
}: AlertGovernanceRailProps): JSX.Element {
  if (!governance) {
    return (
      <DashboardV2Surface className="v2-alert-governance-rail" tone="muted">
        <DashboardV2Heading as="h2">Governance context</DashboardV2Heading>
        <DashboardV2Text tone="muted">
          Patient summary, provenance, threshold basis, and workflow context appear here after an alert is selected.
        </DashboardV2Text>
      </DashboardV2Surface>
    );
  }

  return (
    <div className="v2-alert-governance-rail" data-testid="v2-alert-governance-rail">
      <DashboardV2Surface className="v2-alert-governance-rail__intro" tone="elevated">
        <DashboardV2Text tone="label">Governance context</DashboardV2Text>
        <DashboardV2Heading as="h2">Support the current alert review</DashboardV2Heading>
        <DashboardV2Text tone="muted">
          This rail intentionally stays secondary to the active alert workspace. Unsupported ownership and provenance claims remain omitted.
        </DashboardV2Text>
      </DashboardV2Surface>

      <div className="v2-alert-governance-rail__stack">
        <AlertPatientContextSection governance={governance} />
        <AlertWorkflowSection governance={governance} />
        <AlertGovernanceMetadataSection
          governance={governance}
          onOpenExplanation={onOpenExplanation}
        />
      </div>
    </div>
  );
}
