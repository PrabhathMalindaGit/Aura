import type { InboxTimelineItemVm } from '../../../adapters/communication';
import { DashboardV2ClinicianPatientAnchor } from '../../../patterns/ClinicianPatientAnchor';
import {
  DashboardV2ClinicianTimeline,
  DashboardV2ClinicianTimelineRow,
} from '../../../patterns/ClinicianTimeline';
import { DashboardV2Badge } from '../../../primitives/Badge';
import { DashboardV2Text } from '../../../primitives/Text';

interface ThreadTimelineProps {
  items: InboxTimelineItemVm[];
}

export function ThreadTimeline({ items }: ThreadTimelineProps): JSX.Element {
  return (
    <DashboardV2ClinicianTimeline
      className="v2-inbox-timeline"
      eyebrow="Main review lane"
      title="Timeline"
    >
      <div aria-label="Patient communication timeline">
        {items.map((item) => (
          <DashboardV2ClinicianTimelineRow
            key={item.id}
            className={`v2-inbox-timeline__event v2-inbox-timeline__event--${item.role}${
              item.continuation ? ' v2-inbox-timeline__event--continuation' : ''
            }`}
            tone={item.role === 'patient' ? 'patient' : item.role === 'clinician' ? 'clinician' : 'system'}
            continuation={item.continuation}
            marker={
              item.role === 'patient' ? (
                <DashboardV2ClinicianPatientAnchor patientLabel={item.speakerLabel} tone="neutral" />
              ) : (
                <span className="v2-inbox-timeline__marker-label">{item.role[0]?.toUpperCase() ?? 'S'}</span>
              )
            }
            title={item.speakerLabel}
            meta={
              <>
                {item.speakerSecondaryLabel ? <span>{item.speakerSecondaryLabel}</span> : null}
                <span title={item.occurredAtTitle}>{item.occurredAtLabel}</span>
                {item.metaNote ? <span>{item.metaNote}</span> : null}
              </>
            }
            badges={
              item.badges.length > 0
                ? item.badges.map((badge) => (
                    <DashboardV2Badge key={`${item.id}-${badge.label}`} tone={badge.tone === 'critical' ? 'safety' : badge.tone === 'warning' ? 'delayed' : badge.tone === 'patient' ? 'shared' : badge.tone === 'clinician' ? 'private' : badge.tone}>
                      {badge.label}
                    </DashboardV2Badge>
                  ))
                : undefined
            }
          >
            <DashboardV2Text>{item.preview}</DashboardV2Text>
          </DashboardV2ClinicianTimelineRow>
        ))}
      </div>
    </DashboardV2ClinicianTimeline>
  );
}
