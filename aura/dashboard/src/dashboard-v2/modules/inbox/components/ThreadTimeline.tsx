import type { InboxTimelineItemVm } from '../../../adapters/communication';
import { DashboardV2Badge } from '../../../primitives/Badge';
import { DashboardV2Heading, DashboardV2Text } from '../../../primitives/Text';
import { DashboardV2Surface } from '../../../primitives/Surface';

interface ThreadTimelineProps {
  items: InboxTimelineItemVm[];
}

export function ThreadTimeline({ items }: ThreadTimelineProps): JSX.Element {
  return (
    <DashboardV2Surface className="v2-inbox-timeline" tone="elevated">
      <div className="v2-inbox-section-heading">
        <DashboardV2Text tone="label">Main review lane</DashboardV2Text>
        <DashboardV2Heading as="h3">Timeline</DashboardV2Heading>
      </div>

      <div className="v2-inbox-timeline__list" role="list" aria-label="Patient communication timeline">
        {items.map((item) => (
          <article
            key={item.id}
            className={`v2-inbox-timeline__event v2-inbox-timeline__event--${item.role}${
              item.continuation ? ' v2-inbox-timeline__event--continuation' : ''
            }`}
            role="listitem"
          >
            <div className="v2-inbox-timeline__event-head">
              <div className="v2-inbox-timeline__event-copy">
                <strong>{item.speakerLabel}</strong>
                {item.speakerSecondaryLabel ? (
                  <DashboardV2Text tone="muted">{item.speakerSecondaryLabel}</DashboardV2Text>
                ) : null}
                <div className="v2-inbox-timeline__event-meta">
                  <span title={item.occurredAtTitle}>{item.occurredAtLabel}</span>
                  {item.metaNote ? <span>{item.metaNote}</span> : null}
                </div>
              </div>

              {item.badges.length > 0 ? (
                <div className="v2-inbox-timeline__event-badges">
                  {item.badges.map((badge) => (
                    <DashboardV2Badge key={`${item.id}-${badge.label}`} tone={badge.tone}>
                      {badge.label}
                    </DashboardV2Badge>
                  ))}
                </div>
              ) : null}
            </div>

            <DashboardV2Text>{item.preview}</DashboardV2Text>
          </article>
        ))}
      </div>
    </DashboardV2Surface>
  );
}
