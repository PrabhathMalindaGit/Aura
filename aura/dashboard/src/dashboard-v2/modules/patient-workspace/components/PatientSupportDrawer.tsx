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
      title="Patient workspace context"
      description="Shared coordination, linked workflow, and governance details stay available without narrowing the active workspace."
      placement={placement}
    >
      <DashboardV2Tabs
        ariaLabel="Patient support sections"
        selectedKey={activeView}
        onSelectionChange={(value) => onViewChange(value as PatientWorkspaceSupportView)}
        items={[
          {
            id: 'coordination',
            label: 'Shared coordination',
            content: (
              <PatientHandoffPanel
                patientId={patientId}
                communicationMessageId={latestMessageId}
                taskSnapshot={taskSnapshot}
                onOpenNextAction={onOpenNextAction}
              />
            ),
          },
          {
            id: 'workflow',
            label: 'Linked workflow',
            content: <PatientGovernanceWorkflowSection governance={governance} />,
          },
          {
            id: 'governance',
            label: 'Governance & trust',
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
