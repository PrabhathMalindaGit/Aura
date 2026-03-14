import type { PatientStatus } from '../../types/models';
import { Badge } from '../ui/Badge';

interface PatientStatusMenuProps {
  currentStatus: PatientStatus;
  compact?: boolean;
}

const STATUS_LABELS: Record<PatientStatus, string> = {
  active: 'Active',
  on_hold: 'On hold',
  discharged: 'Discharged',
  inactive: 'Inactive',
};

export function PatientStatusMenu({ currentStatus, compact = false }: PatientStatusMenuProps): JSX.Element {
  return (
    <div className={`patient-status-menu${compact ? ' patient-status-menu--compact' : ''}`}>
      <div className="patient-status-menu__current">
        <span className="patient-status-menu__eyebrow">Status</span>
        <Badge className="patient-status-menu__badge" variant="neutral">
          {STATUS_LABELS[currentStatus]}
        </Badge>
      </div>
      <p className="patient-status-menu__note">
        Editing stays unavailable until the patient status endpoint is connected.
      </p>
    </div>
  );
}
