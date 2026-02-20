import type { AlertItem } from '../../types/models';
import { Badge } from '../ui/Badge';

interface AssignmentChipProps {
  alert: AlertItem;
  clinicianId: string;
}

function otherAssigneeLabel(alert: AlertItem): string {
  return alert.assignedToName?.trim() || alert.assignedTo || 'Unknown';
}

export function AssignmentChip({ alert, clinicianId }: AssignmentChipProps): JSX.Element {
  if (!alert.assignedTo) {
    return <Badge variant="default">Unassigned</Badge>;
  }

  if (alert.assignedTo === clinicianId) {
    return <Badge variant="success">Assigned to you</Badge>;
  }

  return (
    <Badge variant="warning" title={`Assigned to ${otherAssigneeLabel(alert)}`}>
      Assigned: {otherAssigneeLabel(alert)}
    </Badge>
  );
}
