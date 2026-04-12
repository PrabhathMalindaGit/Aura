import { Button } from '../ui/Button';
import { cn } from '../../utils/cn';

export interface ClinicianActionBarItem {
  key?: string;
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
}

interface ClinicianActionBarProps {
  eyebrow?: string;
  title?: string;
  note?: string;
  className?: string;
  recommendedAction?: ClinicianActionBarItem | null;
  secondaryActions?: ClinicianActionBarItem[];
  utilityActions?: ClinicianActionBarItem[];
}

export function ClinicianActionBar({
  eyebrow,
  title,
  note,
  className,
  recommendedAction = null,
  secondaryActions = [],
  utilityActions = [],
}: ClinicianActionBarProps): JSX.Element | null {
  if (
    !eyebrow &&
    !title &&
    !note &&
    !recommendedAction &&
    secondaryActions.length === 0 &&
    utilityActions.length === 0
  ) {
    return null;
  }

  return (
    <section className={cn('clinician-action-bar', className)} aria-label="Recommended clinician actions">
      {eyebrow || title || note ? (
        <div className="clinician-action-bar__copy">
          {eyebrow ? <p className="clinician-action-bar__eyebrow">{eyebrow}</p> : null}
          {title ? <h2 className="clinician-action-bar__title">{title}</h2> : null}
          {note ? <p className="clinician-action-bar__note">{note}</p> : null}
        </div>
      ) : null}

      <div className="clinician-action-bar__controls">
        <div className="clinician-action-bar__recommended">
          {recommendedAction ? (
            <Button
              variant={recommendedAction.variant ?? 'primary'}
              size="sm"
              onClick={recommendedAction.onClick}
              disabled={recommendedAction.disabled}
            >
              {recommendedAction.label}
            </Button>
          ) : null}
        </div>

        {secondaryActions.length > 0 ? (
          <div className="clinician-action-bar__secondary">
            {secondaryActions.slice(0, 2).map((action, index) => (
              <Button
                key={action.key ?? `${action.label}-${index}`}
                variant={action.variant ?? 'secondary'}
                size="sm"
                onClick={action.onClick}
                disabled={action.disabled}
              >
                {action.label}
              </Button>
            ))}
          </div>
        ) : null}

        {utilityActions.length > 0 ? (
          <div className="clinician-action-bar__utilities">
            {utilityActions.map((action, index) => (
              <Button
                key={action.key ?? `${action.label}-${index}`}
                variant={action.variant ?? 'ghost'}
                size="sm"
                onClick={action.onClick}
                disabled={action.disabled}
              >
                {action.label}
              </Button>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
