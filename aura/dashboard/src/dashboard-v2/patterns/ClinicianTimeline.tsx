import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';
import { DashboardV2Surface } from '../primitives/Surface';
import { DashboardV2Heading, DashboardV2Text } from '../primitives/Text';

interface DashboardV2ClinicianTimelineProps {
  eyebrow?: string;
  title: string;
  children: ReactNode;
  className?: string;
}

interface DashboardV2ClinicianTimelineRowProps {
  marker?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  badges?: ReactNode;
  children: ReactNode;
  tone?: 'patient' | 'clinician' | 'system';
  continuation?: boolean;
  className?: string;
}

export function DashboardV2ClinicianTimeline({
  eyebrow,
  title,
  children,
  className,
}: DashboardV2ClinicianTimelineProps): JSX.Element {
  return (
    <DashboardV2Surface className={cn('v2-clinician-timeline', className)} tone="elevated">
      <div className="v2-clinician-timeline__header">
        {eyebrow ? <DashboardV2Text tone="label">{eyebrow}</DashboardV2Text> : null}
        <DashboardV2Heading as="h3">{title}</DashboardV2Heading>
      </div>
      <div className="v2-clinician-timeline__list" role="list">
        {children}
      </div>
    </DashboardV2Surface>
  );
}

export function DashboardV2ClinicianTimelineRow({
  marker,
  title,
  meta,
  badges,
  children,
  tone = 'system',
  continuation = false,
  className,
}: DashboardV2ClinicianTimelineRowProps): JSX.Element {
  return (
    <article
      className={cn(
        'v2-clinician-timeline-row',
        `v2-clinician-timeline-row--${tone}`,
        continuation && 'v2-clinician-timeline-row--continuation',
        className,
      )}
      role="listitem"
    >
      <div className="v2-clinician-timeline-row__spine" aria-hidden="true">
        <span className="v2-clinician-timeline-row__dot" />
      </div>
      <div className="v2-clinician-timeline-row__content">
        <div className="v2-clinician-timeline-row__header">
          <div className="v2-clinician-timeline-row__title">
            {marker ? <span className="v2-clinician-timeline-row__marker">{marker}</span> : null}
            <div className="v2-clinician-timeline-row__title-copy">
              <strong>{title}</strong>
              {meta ? <div className="v2-clinician-timeline-row__meta">{meta}</div> : null}
            </div>
          </div>
          {badges ? <div className="v2-clinician-timeline-row__badges">{badges}</div> : null}
        </div>
        <div className="v2-clinician-timeline-row__body">{children}</div>
      </div>
    </article>
  );
}
