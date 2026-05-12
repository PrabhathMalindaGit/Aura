import { useEffect, useMemo, useState } from 'react';
import type { InboxTimelineItemVm } from '../../../adapters/communication';
import { DashboardV2ClinicianPatientAnchor } from '../../../patterns/ClinicianPatientAnchor';
import {
  DashboardV2ClinicianTimeline,
  DashboardV2ClinicianTimelineRow,
} from '../../../patterns/ClinicianTimeline';
import { DashboardV2Badge } from '../../../primitives/Badge';
import { DashboardV2Button } from '../../../primitives/Button';
import { DashboardV2Text } from '../../../primitives/Text';

interface ThreadTimelineProps {
  items: InboxTimelineItemVm[];
}

const RECENT_TIMELINE_LIMIT = 6;

export function ThreadTimeline({ items }: ThreadTimelineProps): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const hiddenCount = Math.max(items.length - RECENT_TIMELINE_LIMIT, 0);
  const shouldCapTimeline = hiddenCount > 0;

  useEffect(() => {
    setExpanded(false);
  }, [items]);

  const visibleItems = useMemo(() => {
    if (!shouldCapTimeline || expanded) {
      return items;
    }

    return items.slice(-RECENT_TIMELINE_LIMIT);
  }, [expanded, items, shouldCapTimeline]);

  return (
    <div data-testid="v2-inbox-timeline">
      <DashboardV2ClinicianTimeline
        className="v2-inbox-timeline"
        eyebrow="Main review lane"
        title="Timeline"
      >
        <div className="v2-inbox-timeline__content" aria-label="Patient communication timeline">
          {items.length === 0 ? (
            <div className="v2-inbox-timeline__empty" role="status">
              <DashboardV2Text tone="strong">No timeline items yet</DashboardV2Text>
              <DashboardV2Text tone="muted">
                Patient messages and browser-local clinician replies will appear here when available.
              </DashboardV2Text>
            </div>
          ) : null}

          {shouldCapTimeline ? (
            <div className="v2-inbox-timeline__summary">
              <DashboardV2Text tone="muted">
                {expanded
                  ? `Showing all ${items.length} timeline events.`
                  : `Showing the latest ${visibleItems.length} of ${items.length} timeline events.`}
              </DashboardV2Text>
              <DashboardV2Button
                tone="secondary"
                size="sm"
                onPress={() => setExpanded((current) => !current)}
                aria-label={expanded ? 'Show fewer timeline events' : 'Show more timeline events'}
              >
                {expanded ? 'Show fewer' : `Show more (${hiddenCount})`}
              </DashboardV2Button>
            </div>
          ) : null}

          {visibleItems.map((item) => (
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
    </div>
  );
}
