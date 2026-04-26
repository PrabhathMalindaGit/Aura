import { FlaskConical } from 'lucide-react';
import { DashboardV2Button } from '../../../primitives/Button';

interface SchedulingDemoToggleProps {
  enabled: boolean;
  onToggle: () => void;
}

export function SchedulingDemoToggle({
  enabled,
  onToggle,
}: SchedulingDemoToggleProps): JSX.Element {
  return (
    <DashboardV2Button
      className={enabled ? 'v2-scheduling-demo-toggle v2-scheduling-demo-toggle--active' : 'v2-scheduling-demo-toggle'}
      tone={enabled ? 'secondary' : 'quiet'}
      size="sm"
      onPress={onToggle}
      leadingIcon={<FlaskConical size={14} />}
    >
      {enabled ? 'Synthetic demo active' : 'Demo data'}
    </DashboardV2Button>
  );
}
