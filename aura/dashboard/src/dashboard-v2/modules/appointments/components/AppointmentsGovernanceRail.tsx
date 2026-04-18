import type { AppointmentPublishVm, AppointmentsGovernanceVm } from '../../../adapters/appointments';
import { DashboardV2Surface } from '../../../primitives/Surface';
import { DashboardV2Heading, DashboardV2Text } from '../../../primitives/Text';
import { AppointmentPublishPanel } from './AppointmentPublishPanel';

interface AppointmentsGovernanceRailProps {
  governance: AppointmentsGovernanceVm | null;
  publishVm: AppointmentPublishVm;
  publishErrorMessage: string | null;
  onStartsAtChange: (value: string) => void;
  onEndsAtChange: (value: string) => void;
  onMeetingLinkChange: (value: string) => void;
  onPublish: () => void;
}

function renderFacts(
  title: string,
  facts: Array<{ label: string; value: string }>,
): JSX.Element {
  return (
    <DashboardV2Surface className="v2-appointments-governance-rail__section" tone="muted">
      <DashboardV2Text tone="label">{title}</DashboardV2Text>
      <div className="v2-appointments-governance-rail__facts">
        {facts.map((fact) => (
          <article key={`${title}-${fact.label}`} className="v2-appointments-governance-rail__fact">
            <DashboardV2Text tone="label">{fact.label}</DashboardV2Text>
            <DashboardV2Text tone="strong">{fact.value}</DashboardV2Text>
          </article>
        ))}
      </div>
    </DashboardV2Surface>
  );
}

export function AppointmentsGovernanceRail({
  governance,
  publishVm,
  publishErrorMessage,
  onStartsAtChange,
  onEndsAtChange,
  onMeetingLinkChange,
  onPublish,
}: AppointmentsGovernanceRailProps): JSX.Element {
  return (
    <aside className="v2-appointments-governance-rail" aria-label="Scheduling support context">
      <AppointmentPublishPanel
        publishVm={publishVm}
        errorMessage={publishErrorMessage}
        onStartsAtChange={onStartsAtChange}
        onEndsAtChange={onEndsAtChange}
        onMeetingLinkChange={onMeetingLinkChange}
        onPublish={onPublish}
      />

      {governance ? (
        <>
          <DashboardV2Surface className="v2-appointments-governance-rail__intro" tone="elevated">
            <DashboardV2Text tone="label">Patient context</DashboardV2Text>
            <DashboardV2Heading as="h3">{governance.patientTitle}</DashboardV2Heading>
            <DashboardV2Text tone="muted">{governance.patientSubtitle}</DashboardV2Text>
          </DashboardV2Surface>
          {renderFacts('Patient facts', governance.patientFacts)}
          {renderFacts('Workflow facts', governance.workflowFacts)}
          {renderFacts('Schedule facts', governance.scheduleFacts)}
          <DashboardV2Surface className="v2-appointments-governance-rail__section" tone="muted">
            <DashboardV2Text tone="label">Trust boundary</DashboardV2Text>
            <DashboardV2Text tone="muted">{governance.explanation}</DashboardV2Text>
          </DashboardV2Surface>
        </>
      ) : (
        <DashboardV2Surface className="v2-appointments-governance-rail__section" tone="muted">
          <DashboardV2Heading as="h3">Scheduling support context</DashboardV2Heading>
          <DashboardV2Text tone="muted">
            Select a request to review patient, workflow, and schedule context alongside the publishing controls.
          </DashboardV2Text>
        </DashboardV2Surface>
      )}
    </aside>
  );
}
