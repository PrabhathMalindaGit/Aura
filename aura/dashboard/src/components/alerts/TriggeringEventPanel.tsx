import { useMemo, useState } from 'react';
import type { TriggeringEvent } from '../../types/models';
import { Button } from '../ui/Button';
import { Skeleton } from '../ui/Skeleton';
import { formatExactTime, formatRelativeTime } from '../../utils/time';
import { truncateText } from '../../utils/text';

const MISSING_TRIGGERING_EVENT_TEXT = 'No triggering event details available';

interface LegacyChatMessageWindowItem {
  id?: string;
  createdAt?: string;
  role?: string;
  text?: unknown;
}

interface LegacyChatEvent {
  type: 'chat';
  messageWindow?: LegacyChatMessageWindowItem[];
}

type TriggeringEventView = TriggeringEvent | LegacyChatEvent;

interface TriggeringEventPanelProps {
  event: TriggeringEventView | undefined;
  loading: boolean;
  onFetchDetails: () => void;
  fetchDisabled?: boolean;
  sourceId?: string;
}

interface ExpandableTextProps {
  text: string;
  maxLength?: number;
  className?: string;
}

function toUsableText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function resolveContextText(value: unknown): string {
  return toUsableText(value) ?? MISSING_TRIGGERING_EVENT_TEXT;
}

function resolveChatMessageText(event: Extract<TriggeringEventView, { type: 'chat' }>, sourceId?: string): string {
  const directText = 'text' in event ? toUsableText(event.text) : undefined;
  if (directText) {
    return directText;
  }

  const messageWindow =
    'messageWindow' in event && Array.isArray(event.messageWindow) ? event.messageWindow : undefined;

  if (messageWindow?.length) {
    const sourceMessage =
      sourceId
        ? messageWindow.find((message) => message.id === sourceId && toUsableText(message.text))
        : undefined;
    const sourceMessageText = sourceMessage ? toUsableText(sourceMessage.text) : undefined;
    if (sourceMessageText) {
      return sourceMessageText;
    }

    const firstUserMessage = messageWindow.find(
      (message) => message.role === 'user' && toUsableText(message.text),
    );
    const firstUserMessageText = firstUserMessage ? toUsableText(firstUserMessage.text) : undefined;
    if (firstUserMessageText) {
      return firstUserMessageText;
    }

    const firstMessageWithText = messageWindow.find((message) => toUsableText(message.text));
    const firstMessageText = firstMessageWithText ? toUsableText(firstMessageWithText.text) : undefined;
    if (firstMessageText) {
      return firstMessageText;
    }
  }

  return MISSING_TRIGGERING_EVENT_TEXT;
}

function getContextMessageKey(
  message: { createdAt: string; text?: unknown },
  index: number,
  prefix: string,
): string {
  return `${prefix}-${message.createdAt}-${resolveContextText(message.text).slice(0, 12)}-${index}`;
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

function renderChat(
  event: Extract<TriggeringEventView, { type: 'chat' }>,
  sourceId?: string,
): JSX.Element {
  const beforeMessages = 'context' in event ? event.context?.before ?? [] : [];
  const afterMessages = 'context' in event ? event.context?.after ?? [] : [];
  const triggerText = resolveChatMessageText(event, sourceId);

  return (
    <div className="triggering-event__card">
      <h4>Triggering message</h4>
      {'createdAt' in event && event.createdAt ? (
        <p className="triggering-event__timestamp" title={formatExactTime(event.createdAt)}>
          {formatRelativeTime(event.createdAt)}
        </p>
      ) : null}
      <ExpandableText text={triggerText} maxLength={260} className="triggering-event__message" />
      {beforeMessages.length || afterMessages.length ? (
        <div className="triggering-event__context">
          <strong>Conversation context</strong>
          {beforeMessages.length ? (
            <div className="triggering-event__context-block">
              <span>Before</span>
              <ul>
                {beforeMessages.slice(-3).map((message, index) => (
                  <li key={getContextMessageKey(message, index, 'before')}>
                    <ExpandableText text={resolveContextText(message.text)} maxLength={160} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {afterMessages.length ? (
            <div className="triggering-event__context-block">
              <span>After</span>
              <ul>
                {afterMessages.slice(0, 3).map((message, index) => (
                  <li key={getContextMessageKey(message, index, 'after')}>
                    <ExpandableText text={resolveContextText(message.text)} maxLength={160} />
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
  sourceId,
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
      {event?.type === 'chat' ? renderChat(event, sourceId) : null}
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
