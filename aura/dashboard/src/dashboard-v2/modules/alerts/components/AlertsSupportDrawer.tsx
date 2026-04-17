import { DashboardV2Drawer } from '../../../primitives/Drawer';
import { DashboardV2Tabs } from '../../../primitives/Tabs';
import {
  AlertGovernanceMetadataSection,
  AlertPatientContextSection,
  AlertWorkflowSection,
} from './AlertGovernanceRail';
import type { AlertGovernanceVm } from '../../../adapters/alerts';

export type AlertsSupportView = 'patient' | 'workflow' | 'governance';

interface AlertsSupportDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeView: AlertsSupportView;
  onViewChange: (view: AlertsSupportView) => void;
  governance: AlertGovernanceVm | null;
  onOpenExplanation?: () => void;
  placement?: 'right' | 'bottom';
}

export function AlertsSupportDrawer({
  open,
  onOpenChange,
  activeView,
  onViewChange,
  governance,
  onOpenExplanation,
  placement = 'right',
}: AlertsSupportDrawerProps): JSX.Element {
  return (
    <DashboardV2Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Alert governance context"
      description="Patient context, workflow, and threshold metadata stay available without crowding the active alert workspace."
      placement={placement}
    >
      <DashboardV2Tabs
        ariaLabel="Alert governance sections"
        selectedKey={activeView}
        onSelectionChange={(value) => onViewChange(value as AlertsSupportView)}
        items={[
          {
            id: 'patient',
            label: 'Patient',
            content: governance ? <AlertPatientContextSection governance={governance} /> : null,
          },
          {
            id: 'workflow',
            label: 'Workflow',
            content: governance ? <AlertWorkflowSection governance={governance} /> : null,
          },
          {
            id: 'governance',
            label: 'Governance',
            content: governance ? (
              <AlertGovernanceMetadataSection
                governance={governance}
                onOpenExplanation={onOpenExplanation}
              />
            ) : null,
          },
        ]}
      />
    </DashboardV2Drawer>
  );
}
