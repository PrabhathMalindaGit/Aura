import { useEffect, useMemo, useState } from 'react';
import { ClinicianTimelineList } from '../clinician/ClinicianTimelineList';
import type { TimelineEvent } from '../../types/models';
import { Skeleton } from '../ui/Skeleton';
import { formatExactTime, formatRelativeTime } from '../../utils/time';
import { truncateText } from '../../utils/text';

interface AlertTimelineProps {
  events: TimelineEvent[] | undefined;
  loading: boolean;
}

function iconForEvent(event: TimelineEvent): string {
  if (event.type === 'NOTIFICATION_FAILED') {
    return '!';
  }

  if (
    event.type === 'NOTIFICATION_ATTEMPTED' ||
    event.type === 'NOTIFICATION_SENT' ||
    event.type === 'NOTIFICATION_SKIPPED'
  ) {
    return 'N';
  }

  if (event.type === 'SEEN') {
    return 'V';
  }

  if (event.type === 'ACKNOWLEDGED') {
    return 'A';
  }

  if (event.type === 'RESOLVED') {
    return 'R';
  }

  if (event.type === 'OVERRIDE_RISK') {
    return 'O';
  }

  if (event.type === 'ASSIGNED') {
    return 'S';
  }

  return '•';
}

export function AlertTimeline({ events, loading }: AlertTimelineProps): JSX.Element {
  const [expandedEventMap, setExpandedEventMap] = useState<Record<string, boolean>>({});

  const eventKeys = useMemo(
    () => (events ?? []).map((event) => `${event.type}-${event.at}-${event.label}`),
    [events],
  );

  useEffect(() => {
    setExpandedEventMap((current) => {
      const next = Object.fromEntries(eventKeys.map((key) => [key, Boolean(current[key])]));
      return next;
    });
  }, [eventKeys]);

  if (loading) {
    return (
      <section className="drawer-section" aria-label="Timeline loading">
        <h3>Timeline</h3>
        <div className="timeline__skeletons">
          <Skeleton height={64} />
          <Skeleton height={64} />
          <Skeleton height={64} />
        </div>
      </section>
    );
  }

  return (
    <section className="drawer-section" aria-label="Timeline">
      <h3>Timeline</h3>
      {events?.length ? (
        <ClinicianTimelineList
          items={events.map((event) => {
            const eventKey = `${event.type}-${event.at}-${event.label}`;
            const expanded = expandedEventMap[eventKey] ?? false;
            const detail = event.detail ?? '';
            const truncated = truncateText(detail, 160);
            const showToggle = Boolean(detail && truncated.truncated);

            return {
              id: eventKey,
              title: event.label,
              timestampLabel: formatRelativeTime(event.at),
              timestampTitle: formatExactTime(event.at),
              tone:
                event.status === 'fail' ? 'danger' : event.status === 'warn' ? 'warning' : 'default',
              detail: expanded ? detail : truncated.text,
              detailToggle:
                showToggle
                  ? {
                      label: expanded ? 'Show less' : 'Show more',
                      onClick: () =>
                        setExpandedEventMap((current) => ({
                          ...current,
                          [eventKey]: !expanded,
                        })),
                    }
                  : undefined,
              icon: iconForEvent(event),
            };
          })}
        />
      ) : (
        <div className="drawer-placeholder">
          <p>No timeline events available yet.</p>
        </div>
      )}
    </section>
  );
}
