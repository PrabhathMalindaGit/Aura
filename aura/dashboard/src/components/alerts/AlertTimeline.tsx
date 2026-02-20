import { useEffect, useMemo, useState } from 'react';
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
        <ol className="timeline" aria-label="Alert care timeline">
          {events.map((event) => {
            const eventKey = `${event.type}-${event.at}-${event.label}`;
            const expanded = expandedEventMap[eventKey] ?? false;
            const detail = event.detail ?? '';
            const truncated = truncateText(detail, 160);
            const showToggle = Boolean(detail && truncated.truncated);

            return (
              <li key={eventKey} className="timeline__item">
                <span
                  className={`timeline__icon timeline__icon--${event.status ?? 'ok'}`}
                  aria-hidden="true"
                >
                  {iconForEvent(event)}
                </span>
                <div className="timeline__content">
                  <div className="timeline__header">
                    <strong>{event.label}</strong>
                    <time dateTime={event.at} title={formatExactTime(event.at)}>
                      {formatRelativeTime(event.at)}
                    </time>
                  </div>
                  {detail ? (
                    <p className="muted-text">
                      {expanded ? detail : truncated.text}
                    </p>
                  ) : null}
                  {showToggle ? (
                    <button
                      type="button"
                      className="timeline__toggle"
                      onClick={() =>
                        setExpandedEventMap((current) => ({
                          ...current,
                          [eventKey]: !expanded,
                        }))
                      }
                    >
                      {expanded ? 'Show less' : 'Show more'}
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="drawer-placeholder">
          <p>No timeline events available yet.</p>
        </div>
      )}
    </section>
  );
}
