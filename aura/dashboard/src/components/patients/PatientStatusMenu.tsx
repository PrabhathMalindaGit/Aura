import { useEffect, useState } from 'react';
import type { PatientStatus } from '../../types/models';
import { Button } from '../ui/Button';

interface PatientStatusMenuProps {
  currentStatus: PatientStatus;
  compact?: boolean;
}

const STATUS_OPTIONS: Array<{ value: PatientStatus; label: string }> = [
  { value: 'active', label: 'Active' },
  { value: 'on_hold', label: 'On hold' },
  { value: 'discharged', label: 'Discharged' },
  { value: 'inactive', label: 'Inactive' },
];

const BACKEND_REQUIRED_TITLE =
  'Requires backend endpoint: PATCH /clinician/patients/:id/status { status }';

export function PatientStatusMenu({ currentStatus, compact = false }: PatientStatusMenuProps): JSX.Element {
  const [draftStatus, setDraftStatus] = useState<PatientStatus>(currentStatus);

  useEffect(() => {
    setDraftStatus(currentStatus);
  }, [currentStatus]);

  return (
    <div className={`patient-status-menu${compact ? ' patient-status-menu--compact' : ''}`}>
      <label className="patient-status-menu__label">
        <span className="visually-hidden">Change patient status</span>
        <select
          aria-label="Change patient status"
          value={draftStatus}
          onChange={(event) => setDraftStatus(event.target.value as PatientStatus)}
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <Button variant="ghost" disabled title={BACKEND_REQUIRED_TITLE}>
        Save
      </Button>
    </div>
  );
}
