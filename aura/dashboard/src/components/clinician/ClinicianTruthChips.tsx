import { Badge } from '../ui/Badge';
import { cn } from '../../utils/cn';

type ClinicianTruthChipVariant =
  | 'default'
  | 'neutral'
  | 'info'
  | 'success'
  | 'warning'
  | 'danger'
  | 'new'
  | 'status-open'
  | 'status-ack'
  | 'status-resolved';

export interface ClinicianTruthChip {
  key?: string;
  label: string;
  variant: ClinicianTruthChipVariant;
  truth: 'server' | 'local';
}

interface ClinicianTruthChipsProps {
  chips: ClinicianTruthChip[];
  className?: string;
  localLabel?: string;
}

export function ClinicianTruthChips({
  chips,
  className,
  localLabel = 'Local only',
}: ClinicianTruthChipsProps): JSX.Element | null {
  if (chips.length === 0) {
    return null;
  }

  const serverChips = chips.filter((chip) => chip.truth === 'server');
  const localChips = chips.filter((chip) => chip.truth === 'local');

  return (
    <div className={cn('clinician-truth-chips', className)}>
      {serverChips.length > 0 ? (
        <div className="clinician-truth-chips__group clinician-truth-chips__group--server">
          {serverChips.map((chip, index) => (
            <Badge
              key={chip.key ?? `${chip.truth}-${chip.label}-${index}`}
              className="clinician-truth-chips__chip"
              variant={chip.variant}
            >
              {chip.label}
            </Badge>
          ))}
        </div>
      ) : null}

      {localChips.length > 0 ? (
        <div className="clinician-truth-chips__local">
          <span className="clinician-truth-chips__local-label">{localLabel}</span>
          <div className="clinician-truth-chips__group clinician-truth-chips__group--local">
            {localChips.map((chip, index) => (
              <Badge
                key={chip.key ?? `${chip.truth}-${chip.label}-${index}`}
                className="clinician-truth-chips__chip clinician-truth-chips__chip--local"
                variant={chip.variant}
              >
                {chip.label}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
