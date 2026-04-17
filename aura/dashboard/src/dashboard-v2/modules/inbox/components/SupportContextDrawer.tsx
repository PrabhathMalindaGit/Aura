import { DashboardV2Drawer } from '../../../primitives/Drawer';
import { DashboardV2Tabs } from '../../../primitives/Tabs';
import type { InboxSupportVm } from '../../../adapters/communication';
import {
  InboxReferenceSection,
  InboxSharedCoordinationSection,
  InboxWorkflowSection,
} from './SharedCoordinationRail';

export type InboxSupportView = 'shared' | 'workflow' | 'reference';

interface SupportContextDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  support: InboxSupportVm | null;
  activeView: InboxSupportView;
  onViewChange: (value: InboxSupportView) => void;
  coordinationLoading: boolean;
  coordinationError: string | null;
  sharedNoteDraft: string;
  sharedNoteNotice: string | null;
  sharedNoteError: string | null;
  sharedNotePending: boolean;
  placement: 'right' | 'bottom';
  onSharedNoteChange: (value: string) => void;
  onSubmitSharedNote: (event?: React.FormEvent<HTMLFormElement>) => void;
  onOpenStructuredCoordination: () => void;
  onOpenExplanation: () => void;
}

export function SupportContextDrawer({
  open,
  onOpenChange,
  support,
  activeView,
  onViewChange,
  coordinationLoading,
  coordinationError,
  sharedNoteDraft,
  sharedNoteNotice,
  sharedNoteError,
  sharedNotePending,
  placement,
  onSharedNoteChange,
  onSubmitSharedNote,
  onOpenStructuredCoordination,
  onOpenExplanation,
}: SupportContextDrawerProps): JSX.Element {
  if (!support) {
    return (
      <DashboardV2Drawer
        open={open}
        onOpenChange={onOpenChange}
        title="Support context"
        description="Shared coordination, workflow context, and reference guidance"
        placement={placement}
      >
        <p>No support context is available until a thread is selected.</p>
      </DashboardV2Drawer>
    );
  }

  return (
    <DashboardV2Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Support context"
      description="Shared coordination, workflow context, and reference guidance"
      placement={placement}
    >
      <DashboardV2Tabs
        ariaLabel="Support context tabs"
        items={[
          {
            id: 'shared',
            label: 'Shared coordination',
            content: (
              <InboxSharedCoordinationSection
                support={support}
                coordinationLoading={coordinationLoading}
                coordinationError={coordinationError}
                sharedNoteDraft={sharedNoteDraft}
                sharedNoteNotice={sharedNoteNotice}
                sharedNoteError={sharedNoteError}
                sharedNotePending={sharedNotePending}
                onSharedNoteChange={onSharedNoteChange}
                onSubmitSharedNote={onSubmitSharedNote}
                onOpenStructuredCoordination={onOpenStructuredCoordination}
                onOpenExplanation={onOpenExplanation}
              />
            ),
          },
          {
            id: 'workflow',
            label: 'Workflow',
            content: <InboxWorkflowSection support={support} />,
          },
          {
            id: 'reference',
            label: 'Reference',
            content: (
              <InboxReferenceSection
                support={support}
                onOpenExplanation={onOpenExplanation}
              />
            ),
          },
        ]}
        selectedKey={activeView}
        onSelectionChange={(value) => onViewChange(value as InboxSupportView)}
      />
    </DashboardV2Drawer>
  );
}
