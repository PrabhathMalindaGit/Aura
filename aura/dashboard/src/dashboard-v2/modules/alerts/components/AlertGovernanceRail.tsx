import type { AlertGovernanceVm } from '../../../adapters/alerts';
import {
  DashboardV2ClinicianSupportGroup,
  DashboardV2ClinicianSupportRail,
} from '../../../patterns/ClinicianSupportRail';
import { DashboardV2Button } from '../../../primitives/Button';
import { DashboardV2Text } from '../../../primitives/Text';

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
    <DashboardV2ClinicianSupportGroup className="v2-alert-governance-rail__card" tone="base" title={title} description={subtitle}>
      <dl className="v2-alert-governance-rail__facts">
        {facts.map((fact) => (
          <div key={`${title}-${fact.label}`} className="v2-alert-governance-rail__fact">
            <dt>{fact.label}</dt>
            <dd>{fact.value}</dd>
          </div>
        ))}
      </dl>
      {footer}
    </DashboardV2ClinicianSupportGroup>
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
              <DashboardV2Button tone="quiet" size="sm" onPress={onOpenExplanation}>
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
      <DashboardV2ClinicianSupportRail className="v2-alert-governance-rail" tone="muted" title="Governance context">
        <DashboardV2Text tone="muted">
          Patient summary, provenance, threshold basis, and workflow context appear here after an alert is selected.
        </DashboardV2Text>
      </DashboardV2ClinicianSupportRail>
    );
  }

  return (
    <DashboardV2ClinicianSupportRail
      className="v2-alert-governance-rail"
      tone="muted"
      eyebrow="Governance context"
      title="Support the current alert review"
      description="This rail stays secondary to the active alert workspace and keeps provenance claims conservative."
      data-testid="v2-alert-governance-rail"
    >
      <AlertPatientContextSection governance={governance} />
      <AlertWorkflowSection governance={governance} />
      <AlertGovernanceMetadataSection
        governance={governance}
        onOpenExplanation={onOpenExplanation}
      />
    </DashboardV2ClinicianSupportRail>
  );
}
