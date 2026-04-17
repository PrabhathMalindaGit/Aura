import { DashboardV2Button } from '../../../primitives/Button';
import { DashboardV2Surface } from '../../../primitives/Surface';
import { DashboardV2Heading, DashboardV2Text } from '../../../primitives/Text';
import type { PatientWorkspaceActionId, PatientWorkspaceDecisionStripVm } from '../../../adapters/patientWorkspace';

interface PatientDecisionStripProps {
  strip: PatientWorkspaceDecisionStripVm;
  onAction: (actionId: PatientWorkspaceActionId) => void;
}

export function PatientDecisionStrip({
  strip,
  onAction,
}: PatientDecisionStripProps): JSX.Element {
  return (
    <DashboardV2Surface className="v2-patient-decision-strip" tone="muted">
      <div className="v2-patient-decision-strip__copy">
        <DashboardV2Text tone="label">{strip.scopeLabel}</DashboardV2Text>
        <DashboardV2Heading as="h2">{strip.whyNowTitle}</DashboardV2Heading>
        <DashboardV2Text tone="muted">{strip.whyNowBody}</DashboardV2Text>
        <DashboardV2Text tone="caption">{strip.attentionLine}</DashboardV2Text>
      </div>

      <div className="v2-patient-decision-strip__facts" aria-label="Current patient review facts">
        {strip.facts.map((fact) => (
          <article key={fact.label} className="v2-patient-decision-strip__fact">
            <DashboardV2Text tone="label">{fact.label}</DashboardV2Text>
            <DashboardV2Text as="strong" tone="strong">
              {fact.value}
            </DashboardV2Text>
            <DashboardV2Text tone="muted">{fact.note}</DashboardV2Text>
          </article>
        ))}
      </div>

      {strip.actions.length > 0 ? (
        <div className="v2-patient-decision-strip__actions">
          {strip.actions.map((action) => (
            <DashboardV2Button
              key={action.id}
              tone="secondary"
              size="sm"
              onPress={() => onAction(action.id)}
            >
              {action.label}
            </DashboardV2Button>
          ))}
        </div>
      ) : null}
    </DashboardV2Surface>
  );
}
