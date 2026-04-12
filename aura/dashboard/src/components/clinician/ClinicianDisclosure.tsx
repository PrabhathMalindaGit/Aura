import { useState, type ReactNode } from 'react';
import { Button } from '../ui/Button';
import { cn } from '../../utils/cn';

interface ClinicianDisclosureProps {
  title: string;
  summary?: string;
  className?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function ClinicianDisclosure({
  title,
  summary,
  className,
  defaultOpen = false,
  children,
}: ClinicianDisclosureProps): JSX.Element {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className={cn('clinician-disclosure', className)} aria-label={title}>
      <div className="clinician-disclosure__header">
        <div className="clinician-disclosure__copy">
          <p className="clinician-disclosure__title">{title}</p>
          {summary ? <p className="clinician-disclosure__summary">{summary}</p> : null}
        </div>
        <Button variant="ghost" size="sm" onClick={() => setOpen((current) => !current)}>
          {open ? 'Hide details' : 'Show details'}
        </Button>
      </div>
      {open ? <div className="clinician-disclosure__body">{children}</div> : null}
    </section>
  );
}
