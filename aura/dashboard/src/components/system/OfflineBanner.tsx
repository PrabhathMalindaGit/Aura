import { useEffect, useState } from 'react';
import { RetryButton } from './RetryButton';
import { useConnectionStatus } from '../../services/connectionStore';

const DISMISS_KEY = 'aura_offline_banner_dismissed_sequence_v1';
const RETRY_EVENT = 'aura:retry';

function formatTime(timestamp: number | null): string {
  if (!timestamp) {
    return '--';
  }

  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function readDismissedSequence(): number {
  if (typeof window === 'undefined') {
    return -1;
  }

  const raw = window.sessionStorage.getItem(DISMISS_KEY);
  const value = Number(raw);
  return Number.isFinite(value) ? value : -1;
}

function dispatchRetryEvent(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new Event(RETRY_EVENT));
}

export function OfflineBanner(): JSX.Element | null {
  const connection = useConnectionStatus();
  const [dismissedSequence, setDismissedSequence] = useState(() => readDismissedSequence());

  useEffect(() => {
    setDismissedSequence(readDismissedSequence());
  }, [connection.offlineSequence]);

  if (connection.online || connection.offlineSequence <= dismissedSequence) {
    return null;
  }

  return (
    <aside
      className="offline-banner offline-banner--fixed glass-popover"
      role="status"
      aria-live="polite"
    >
      <div className="offline-banner__copy">
        <strong>Offline</strong>
        <span>
          Showing last known data as of {formatTime(connection.lastSuccessAt)}.
        </span>
      </div>
      <div className="offline-banner__actions">
        <RetryButton onRetry={dispatchRetryEvent} />
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => {
            if (typeof window !== 'undefined') {
              window.sessionStorage.setItem(DISMISS_KEY, String(connection.offlineSequence));
            }
            setDismissedSequence(connection.offlineSequence);
          }}
        >
          Dismiss
        </button>
      </div>
    </aside>
  );
}
