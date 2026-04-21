import { PatientAppointmentsPanel } from '../../../../components/patients/PatientAppointmentsPanel';
import { PatientCommunicationPanel } from '../../../../components/patients/PatientCommunicationPanel';
import { PatientTasksPanel } from '../../../../components/patients/PatientTasksPanel';
import type { ClinicianCommunicationTemplate } from '../../../../services/clinicianProfile';
import type { AppointmentRequestItem, ClinicianTaskItem, DashboardCommunicationOverviewItem } from '../../../../types/models';
import type { CommunicationTimelineEvent } from '../../../../services/communicationWorkspace';
import type { PatientWorkspaceCommunicationsVm } from '../../../adapters/patientWorkspace';
import { DashboardV2Surface } from '../../../primitives/Surface';
import { DashboardV2Heading, DashboardV2Text } from '../../../primitives/Text';

interface PatientCommunicationsPaneProps {
  communications: PatientWorkspaceCommunicationsVm;
  items: DashboardCommunicationOverviewItem[];
  timeline: CommunicationTimelineEvent[];
  patientQuickReply: string;
  selectedQuickReplyTemplateId: string;
  canQuickReplyFromPatientDetail: boolean;
  patientCommunicationBlockedBySafety: boolean;
  communicationAuthoring: {
    templates: ClinicianCommunicationTemplate[];
    hasSignature: boolean;
  };
  tasks: ClinicianTaskItem[];
  completedTasks: ClinicianTaskItem[];
  completingTaskId: string | null;
  appointments: AppointmentRequestItem[];
  tasksFreshnessLabel: string | null;
  appointmentsFreshnessLabel: string | null;
  onRetry: () => void;
  onOpenCommunicationWorkspace: () => void;
  onOpenAlertsWorkspace: () => void;
  onOpenAppointmentsWorkspace: () => void;
  onQuickReplyChange: (value: string) => void;
  onSendQuickReply: () => void;
  onSelectedQuickReplyTemplateChange: (value: string) => void;
  onInsertTemplate: () => void;
  onInsertSignature: () => void;
  onCompleteTask: (taskId: string) => void;
}

export function PatientCommunicationsPane({
  communications,
  items,
  timeline,
  patientQuickReply,
  selectedQuickReplyTemplateId,
  canQuickReplyFromPatientDetail,
  patientCommunicationBlockedBySafety,
  communicationAuthoring,
  tasks,
  completedTasks,
  completingTaskId,
  appointments,
  tasksFreshnessLabel,
  appointmentsFreshnessLabel,
  onRetry,
  onOpenCommunicationWorkspace,
  onOpenAlertsWorkspace,
  onOpenAppointmentsWorkspace,
  onQuickReplyChange,
  onSendQuickReply,
  onSelectedQuickReplyTemplateChange,
  onInsertTemplate,
  onInsertSignature,
  onCompleteTask,
}: PatientCommunicationsPaneProps): JSX.Element {
  return (
    <div className="v2-patient-pane v2-patient-pane--communications" data-testid="v2-patient-communications-pane">
      <DashboardV2Surface className="v2-patient-pane-intro" tone="muted">
        <DashboardV2Text tone="label">Communications</DashboardV2Text>
        <DashboardV2Heading as="h3">Patient messaging, local reply continuity, and operational follow-through</DashboardV2Heading>
        <DashboardV2Text tone="muted">{communications.serverTruthNote}</DashboardV2Text>
        <DashboardV2Text tone="caption">{communications.localTruthNote}</DashboardV2Text>
      </DashboardV2Surface>

      <div className="v2-patient-communications-workbench">
        <PatientCommunicationPanel
          items={items}
          timeline={timeline}
          freshnessLabel={communications.freshnessLabel}
          onRetry={onRetry}
          onOpenCommunication={onOpenCommunicationWorkspace}
          onOpenAlerts={onOpenAlertsWorkspace}
          showQuickReply={canQuickReplyFromPatientDetail}
          quickReplyBlockedBySafety={patientCommunicationBlockedBySafety}
          quickReplyValue={patientQuickReply}
          onQuickReplyChange={onQuickReplyChange}
          onSendQuickReply={onSendQuickReply}
          replyTemplates={communicationAuthoring.templates}
          selectedTemplateId={selectedQuickReplyTemplateId}
          onSelectedTemplateChange={onSelectedQuickReplyTemplateChange}
          onInsertTemplate={onInsertTemplate}
          hasSignature={communicationAuthoring.hasSignature}
          onInsertSignature={onInsertSignature}
        />

        <div className="v2-patient-communications-grid">
          <PatientTasksPanel
            activeTasks={tasks}
            recentCompletedTasks={completedTasks}
            freshnessLabel={tasksFreshnessLabel}
            completingTaskId={completingTaskId}
            onRetry={onRetry}
            onCompleteTask={onCompleteTask}
            onOpenAlerts={onOpenAlertsWorkspace}
            onOpenAppointments={onOpenAppointmentsWorkspace}
          />
          <PatientAppointmentsPanel
            items={appointments}
            freshnessLabel={appointmentsFreshnessLabel}
            onRetry={onRetry}
            onOpenAppointments={onOpenAppointmentsWorkspace}
          />
        </div>
      </div>
    </div>
  );
}
