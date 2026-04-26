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

      <DashboardV2Surface className="v2-appointments-governance-rail__intro" tone="elevated">
        <DashboardV2Text tone="label">Selected request context</DashboardV2Text>
        {governance ? (
          <>
            <DashboardV2Heading as="h3">{governance.patientTitle}</DashboardV2Heading>
            <DashboardV2Text tone="muted">{governance.requestSummary}</DashboardV2Text>
            <div className="v2-appointments-governance-rail__context-stack">
              <div>
                <DashboardV2Text tone="label">Reason for visit</DashboardV2Text>
                <DashboardV2Text tone="muted">{governance.requestReason}</DashboardV2Text>
              </div>
              <div>
                <DashboardV2Text tone="label">Constraints</DashboardV2Text>
                <DashboardV2Text tone="muted">{governance.constraints}</DashboardV2Text>
              </div>
              <div className="v2-appointments-governance-rail__recommended">
                <DashboardV2Text tone="label">Recommended slot</DashboardV2Text>
                <DashboardV2Text tone="strong">{governance.recommendedSlot}</DashboardV2Text>
              </div>
            </div>
          </>
        ) : (
          <>
            <DashboardV2Heading as="h3">No request selected</DashboardV2Heading>
            <DashboardV2Text tone="muted">
              Select a request to review patient, workflow, and scheduling context.
            </DashboardV2Text>
          </>
        )}
      </DashboardV2Surface>

      <DashboardV2Surface className="v2-appointments-governance-rail__section" tone="muted">
        <DashboardV2Heading as="h3">Support context</DashboardV2Heading>
        {governance ? (
          <>
            <DashboardV2Text tone="muted">
              Match request needs to visible clinician time before approving, rejecting, or publishing more availability.
            </DashboardV2Text>
            <div className="v2-appointments-governance-rail__facts">
              {governance.scheduleFacts.slice(1, 4).map((fact) => (
                <article key={fact.label} className="v2-appointments-governance-rail__fact">
                  <DashboardV2Text tone="label">{fact.label}</DashboardV2Text>
                  <DashboardV2Text tone="strong">{fact.value}</DashboardV2Text>
                </article>
              ))}
            </div>
            <DashboardV2Text tone="muted">{governance.explanation}</DashboardV2Text>
          </>
        ) : (
          <DashboardV2Text tone="muted">
            Use the planner and capacity detail to decide whether new availability is needed before publishing clinician time.
          </DashboardV2Text>
        )}
      </DashboardV2Surface>
    </aside>
  );
}
