import { cn } from '../../utils/cn';
import type { ClinicianIdentity } from '../../services/clinicianIdentity';

type ClinicianAvatarSize = 'sm' | 'md' | 'lg';

interface ClinicianAvatarProps {
  identity: Pick<ClinicianIdentity, 'displayName' | 'initials' | 'photo'>;
  size?: ClinicianAvatarSize;
  className?: string;
  decorative?: boolean;
}

export function ClinicianAvatar({
  identity,
  size = 'md',
  className,
  decorative = false,
}: ClinicianAvatarProps): JSX.Element {
  const label = `${identity.displayName} avatar`;

  return (
    <span
      className={cn('clinician-avatar', `clinician-avatar--${size}`, className)}
      aria-hidden={decorative ? 'true' : undefined}
      role={!decorative && !identity.photo ? 'img' : undefined}
      aria-label={!decorative && !identity.photo ? label : undefined}
    >
      {identity.photo ? (
        <img
          className="clinician-avatar__image"
          src={identity.photo.dataUrl}
          alt={decorative ? '' : label}
        />
      ) : (
        <span className="clinician-avatar__fallback">{identity.initials}</span>
      )}
    </span>
  );
}
