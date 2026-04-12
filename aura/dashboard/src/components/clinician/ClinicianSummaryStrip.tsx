import { cn } from '../../utils/cn';

export interface ClinicianSummaryStripItem {
  key?: string;
  label: string;
  value: string;
  hint?: string;
  note?: string;
  tone?: 'default' | 'warning' | 'danger' | 'success';
}

interface ClinicianSummaryStripProps {
  items: ClinicianSummaryStripItem[];
  className?: string;
  ariaLabel?: string;
}

export function ClinicianSummaryStrip({
  items,
  className,
  ariaLabel = 'Clinician summary strip',
}: ClinicianSummaryStripProps): JSX.Element | null {
  if (items.length === 0) {
    return null;
  }

  return (
    <section className={cn('clinician-summary-strip', className)} aria-label={ariaLabel}>
      {items.map((item) => (
        <article
          key={item.key ?? item.label}
          className={cn(
            'clinician-summary-strip__item',
            item.tone && `clinician-summary-strip__item--${item.tone}`,
          )}
        >
          <p className="clinician-summary-strip__label">{item.label}</p>
          <p className="clinician-summary-strip__value">{item.value}</p>
          {item.hint ?? item.note ? (
            <p className="clinician-summary-strip__hint">{item.hint ?? item.note}</p>
          ) : null}
        </article>
      ))}
    </section>
  );
}
