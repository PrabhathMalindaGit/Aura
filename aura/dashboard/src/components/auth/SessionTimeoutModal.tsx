import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { SessionTimeoutWarning } from '../../services/sessionTimeout';
import { focusFirstElement, trapTabKey } from '../../utils/focus';
import { formatCountdown } from '../../utils/timeFormat';
import { Button } from '../ui/Button';

interface SessionTimeoutModalProps {
  open: boolean;
  warning: SessionTimeoutWarning | null;
  returnFocusRef?: RefObject<HTMLElement | null>;
  onContinueSession: () => void;
  onLogoutNow: () => void;
}

export function SessionTimeoutModal({
  open,
  warning,
  returnFocusRef,
  onContinueSession,
  onLogoutNow,
}: SessionTimeoutModalProps): JSX.Element | null {
  const panelRef = useRef<HTMLElement | null>(null);
  const continueRef = useRef<HTMLButtonElement | null>(null);
  const fallbackFocusRef = useRef<HTMLElement | null>(null);
  const [liveMessage, setLiveMessage] = useState('');

  useEffect(() => {
    if (!open) {
      setLiveMessage('');
      return;
    }

    const explicitReturnTarget = returnFocusRef?.current ?? null;
    fallbackFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const frame = window.requestAnimationFrame(() => {
      if (panelRef.current) {
        focusFirstElement(panelRef.current, continueRef.current);
      } else {
        continueRef.current?.focus();
      }
    });

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        return;
      }

      if (!panelRef.current) {
        return;
      }

      trapTabKey(event, panelRef.current);
    };

    document.addEventListener('keydown', onKeyDown);

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = originalOverflow;

      const target = explicitReturnTarget ?? fallbackFocusRef.current;
      target?.focus();
    };
  }, [open, returnFocusRef]);

  useEffect(() => {
    if (!open || !warning) {
      return;
    }

    const secondsRemaining = Math.max(0, Math.ceil(warning.remainingMs / 1000));
    if (secondsRemaining > 10 && secondsRemaining % 10 !== 0) {
      return;
    }

    setLiveMessage(`Session will end in ${formatCountdown(warning.remainingMs)}.`);
  }, [open, warning]);

  if (!open || !warning) {
    return null;
  }

  const titleId = 'session-timeout-title';
  const descriptionId = 'session-timeout-description';
  const countdownId = 'session-timeout-countdown';

  const countdown = formatCountdown(warning.remainingMs);
  const bodyText =
    warning.kind === 'absolute'
      ? 'This session reached its maximum duration. For patient safety, the dashboard will lock soon.'
      : 'No activity detected. For patient safety, this dashboard will lock soon.';

  return (
    <div className="session-timeout" role="presentation">
      <div className="session-timeout__overlay" aria-hidden="true" />
      <section
        ref={panelRef}
        className="session-timeout__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <h2 id={titleId} className="session-timeout__title">
          Session will end soon
        </h2>
        <p id={descriptionId} className="session-timeout__description">
          {bodyText}
        </p>
        <p id={countdownId} className="session-timeout__countdown" aria-live="off">
          Locks in <strong>{countdown}</strong>
        </p>
        <p className="visually-hidden" aria-live="polite" aria-atomic="true">
          {liveMessage}
        </p>

        <div className="session-timeout__actions">
          <Button ref={continueRef} variant="primary" onClick={onContinueSession}>
            Continue session
          </Button>
          <Button variant="danger" onClick={onLogoutNow}>
            Log out now
          </Button>
        </div>
      </section>
    </div>
  );
}
