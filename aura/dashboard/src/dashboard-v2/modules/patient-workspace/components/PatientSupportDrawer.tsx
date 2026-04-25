import { DashboardV2Drawer } from '../../../primitives/Drawer';
import { DashboardV2Tabs } from '../../../primitives/Tabs';
import type { PatientWorkspaceSupportView } from '../../../state/usePatientWorkspaceUiStore';
import type { ClinicianTaskItem, DashboardCommunicationOverviewItem } from '../../../../types/models';
import type { PatientWorkspaceGovernanceVm } from '../../../adapters/patientWorkspace';
import { PatientHandoffPanel } from '../../../../components/patients/PatientHandoffPanel';
import {
  PatientGovernanceMetadataSection,
  PatientGovernanceWorkflowSection,
} from './PatientGovernanceRail';

interface PatientSupportDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeView: PatientWorkspaceSupportView;
  onViewChange: (view: PatientWorkspaceSupportView) => void;
  governance: PatientWorkspaceGovernanceVm;
  patientId: string;
  communicationItems: DashboardCommunicationOverviewItem[];
  taskSnapshot: ClinicianTaskItem[];
  onOpenNextAction: (action: 'alerts' | 'communication' | 'tasks' | 'appointments' | 'plan') => void;
  onOpenExplanation?: () => void;
  placement?: 'right' | 'bottom';
}

export function PatientSupportDrawer({
  open,
  onOpenChange,
  activeView,
  onViewChange,
  governance,
  patientId,
  communicationItems,
  taskSnapshot,
  onOpenNextAction,
  onOpenExplanation,
  placement = 'right',
}: PatientSupportDrawerProps): JSX.Element {
  const latestMessageId = communicationItems[0]?.messageId;

  return (
    <DashboardV2Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Care context"
      description="Shared handoff, follow-up links, and review basis for this patient."
      placement={placement}
      className="v2-patient-care-drawer"
    >
      <DashboardV2Tabs
        ariaLabel="Care context sections"
        selectedKey={activeView}
        onSelectionChange={(value) => onViewChange(value as PatientWorkspaceSupportView)}
        items={[
          {
            id: 'coordination',
            label: 'Coordination',
            content: (
              <PatientHandoffPanel
                patientId={patientId}
                communicationMessageId={latestMessageId}
                taskSnapshot={taskSnapshot}
                onOpenNextAction={onOpenNextAction}
                presentation="drawer"
              />
            ),
          },
          {
            id: 'workflow',
            label: 'Workflow',
            content: <PatientGovernanceWorkflowSection governance={governance} />,
          },
          {
            id: 'governance',
            label: 'Trust',
            content: (
              <PatientGovernanceMetadataSection
                governance={governance}
                onOpenExplanation={onOpenExplanation}
              />
            ),
          },
        ]}
      />
    </DashboardV2Drawer>
  );
}
