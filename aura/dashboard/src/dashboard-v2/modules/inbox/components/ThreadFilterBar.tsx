import {
  COMMUNICATION_THREAD_VIEW_OPTIONS,
  type CommunicationThreadView,
} from '../../../../services/communicationWorkspace';
import { DashboardV2Button } from '../../../primitives/Button';
import { DashboardV2Select } from '../../../primitives/Select';
import { DashboardV2Text } from '../../../primitives/Text';

interface ThreadFilterBarProps {
  currentView: CommunicationThreadView;
  counts: Record<CommunicationThreadView, number>;
  isVeryNarrow: boolean;
  onViewChange: (value: CommunicationThreadView) => void;
}

export function ThreadFilterBar({
  currentView,
  counts,
  isVeryNarrow,
  onViewChange,
}: ThreadFilterBarProps): JSX.Element {
  if (isVeryNarrow) {
    return (
      <div className="v2-inbox-filter-bar v2-inbox-filter-bar--compact">
        <DashboardV2Select
          label="Queue view"
          options={COMMUNICATION_THREAD_VIEW_OPTIONS.map((option) => ({
            id: option.id,
            label: option.label,
          }))}
          selectedKey={currentView}
          onSelectionChange={(value) => onViewChange(value as CommunicationThreadView)}
        />
        <div className="v2-inbox-filter-bar__compact-facts">
          <span className="v2-inbox-filter-bar__count">
            {counts[currentView]} active
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="v2-inbox-filter-bar" role="group" aria-label="Communication filters">
      {COMMUNICATION_THREAD_VIEW_OPTIONS.map((option) => {
        const isActive = option.id === currentView;

        return (
          <DashboardV2Button
            key={option.id}
            tone={isActive ? 'primary' : 'secondary'}
            size="sm"
            onPress={() => onViewChange(option.id)}
          >
            <span>{option.label}</span>
            <DashboardV2Text as="span" tone={isActive ? 'strong' : 'muted'}>
              {counts[option.id]}
            </DashboardV2Text>
          </DashboardV2Button>
        );
      })}
    </div>
  );
}
