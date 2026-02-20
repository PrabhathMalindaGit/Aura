import type { PatientStatus, PatientSummary } from '../../types/models';
import { Badge } from '../ui/Badge';

interface PatientStatusBadgeProps {
  status: PatientSummary['status'];
}

function toBadgeVariant(status: PatientStatus): 'default' | 'success' | 'warning' | 'danger' {
  if (status === 'active') {
    return 'success';
  }

  if (status === 'on_hold') {
    return 'warning';
  }

  if (status === 'discharged') {
    return 'default';
  }

  return 'danger';
}

function normalizeStatus(status: PatientSummary['status']): PatientStatus {
  if (status === 'active' || status === 'on_hold' || status === 'discharged' || status === 'inactive') {
    return status;
  }

  return 'inactive';
}

function toStatusLabel(status: PatientStatus): string {
  if (status === 'on_hold') {
    return 'On hold';
  }

  if (status === 'discharged') {
    return 'Discharged';
  }

  if (status === 'inactive') {
    return 'Inactive';
  }

  return 'Active';
}

export function PatientStatusBadge({ status }: PatientStatusBadgeProps): JSX.Element {
  const normalized = normalizeStatus(status);

  return (
    <Badge variant={toBadgeVariant(normalized)} icon aria-label={`Patient status ${toStatusLabel(normalized)}`}>
      {toStatusLabel(normalized)}
    </Badge>
  );
}
