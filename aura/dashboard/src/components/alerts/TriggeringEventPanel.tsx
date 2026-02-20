import { useMemo, useState } from 'react';
import type { TriggeringEvent } from '../../types/models';
import { Button } from '../ui/Button';
import { Skeleton } from '../ui/Skeleton';
import { formatExactTime, formatRelativeTime } from '../../utils/time';
import { truncateText } from '../../utils/text';

interface TriggeringEventPanelProps {
  event: TriggeringEvent | undefined;
  loading: boolean;
  onFetchDetails: () => void;
  fetchDisabled?: boolean;
}

interface ExpandableTextProps {
  text: string;
  maxLength?: number;
  className?: string;
}

function ExpandableText({ text, maxLength = 220, className }: ExpandableTextProps): JSX.Element {
  const [expanded, setExpanded] = useState(false);

  const truncated = useMemo(() => truncateText(text, maxLength), [maxLength, text]);
  const canExpand = truncated.truncated;

  return (
    <div className={className}>
      <p>{expanded ? text : truncated.text}</p>
      {canExpand ? (
        <Button variant="ghost" className="triggering-event__toggle" onClick={() => setExpanded((value) => !value)}>
          {expanded ? 'Show less' : 'Show more'}
        </Button>
      ) : null}
    </div>
  );
}

function renderCheckin(event: Extract<TriggeringEvent, { type: 'checkin' }>): JSX.Element {
  return (
    <div className="triggering-event__card">
      <h4>Check-in snapshot</h4>
      <dl className="triggering-event__stats">
        <div>
          <dt>Date</dt>
          <dd title={formatExactTime(event.date)}>{formatRelativeTime(event.date)}</dd>
        </div>
        <div>
          <dt>Pain</dt>
          <dd>{event.pain}</dd>
        </div>
        <div>
          <dt>Mood</dt>
          <dd>{event.mood}</dd>
        </div>
        <div>
          <dt>Exercises</dt>
          <dd>{event.adherence?.exercises ?? '—'}</dd>
        </div>
        <div>
          <dt>Medication</dt>
          <dd>{event.adherence?.medication === undefined ? '—' : event.adherence.medication ? 'Taken' : 'Missed'}</dd>
        </div>
      </dl>
      {event.notes ? (
        <div className="triggering-event__notes">
          <strong>Notes</strong>
          <ExpandableText text={event.notes} maxLength={240} />
        </div>
      ) : null}
    </div>
  );
}

function renderChat(event: Extract<TriggeringEvent, { type: 'chat' }>): JSX.Element {
  return (
    <div className="triggering-event__card">
      <h4>Triggering message</h4>
      <p className="triggering-event__timestamp" title={formatExactTime(event.createdAt)}>
        {formatRelativeTime(event.createdAt)}
      </p>
      <ExpandableText text={event.text} maxLength={260} className="triggering-event__message" />
      {event.context?.before?.length || event.context?.after?.length ? (
        <div className="triggering-event__context">
          <strong>Conversation context</strong>
          {event.context.before?.length ? (
            <div className="triggering-event__context-block">
              <span>Before</span>
              <ul>
                {event.context.before.slice(-3).map((message) => (
                  <li key={`${message.createdAt}-${message.text.slice(0, 12)}`}>
                    <ExpandableText text={message.text} maxLength={160} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {event.context.after?.length ? (
            <div className="triggering-event__context-block">
              <span>After</span>
              <ul>
                {event.context.after.slice(0, 3).map((message) => (
                  <li key={`${message.createdAt}-${message.text.slice(0, 12)}`}>
                    <ExpandableText text={message.text} maxLength={160} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function TriggeringEventPanel({
  event,
  loading,
  onFetchDetails,
  fetchDisabled = false,
}: TriggeringEventPanelProps): JSX.Element {
  if (loading) {
    return (
      <section className="drawer-section" aria-label="Triggering event loading">
        <h3>Triggering event</h3>
        <div className="triggering-event__skeletons">
          <Skeleton height={100} />
          <Skeleton height={80} />
        </div>
      </section>
    );
  }

  return (
    <section className="drawer-section" aria-label="Triggering event">
      <h3>Triggering event</h3>
      {event?.type === 'checkin' ? renderCheckin(event) : null}
      {event?.type === 'chat' ? renderChat(event) : null}
      {!event ? (
        <div className="drawer-placeholder">
          <p>Triggering event not available yet.</p>
          <Button variant="secondary" onClick={onFetchDetails} disabled={fetchDisabled}>
            Fetch details
          </Button>
        </div>
      ) : null}
    </section>
  );
}
