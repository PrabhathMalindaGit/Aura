import { Button } from '../ui/Button';

interface ClinicianConflictBannerProps {
  title: string;
  message: string;
  compareLabel?: string;
  reloadLabel?: string;
  onCompare?: () => void;
  onReload: () => void;
}

export function ClinicianConflictBanner({
  title,
  message,
  compareLabel = 'Compare latest version',
  reloadLabel = 'Reload latest version',
  onCompare,
  onReload,
}: ClinicianConflictBannerProps): JSX.Element {
  return (
    <section className="clinician-conflict-banner" role="alert" aria-live="assertive">
      <div className="clinician-conflict-banner__copy">
        <strong className="clinician-conflict-banner__title">{title}</strong>
        <p className="clinician-conflict-banner__message">{message}</p>
      </div>
      <div className="clinician-conflict-banner__actions">
        {onCompare ? (
          <Button variant="secondary" size="sm" onClick={onCompare}>
            {compareLabel}
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" onClick={onReload}>
          {reloadLabel}
        </Button>
      </div>
    </section>
  );
}
