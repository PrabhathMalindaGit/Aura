import type { SessionSettings } from './sessionSettings';

export type SessionTimeoutReason = 'idle' | 'absolute' | 'manual';
export type SessionWarningKind = 'idle' | 'absolute';

export interface SessionTimeoutWarning {
  kind: SessionWarningKind;
  deadlineMs: number;
  remainingMs: number;
  announcement: string | null;
}

export interface SessionTimeoutState {
  running: boolean;
  idleDeadlineMs: number | null;
  absoluteDeadlineMs: number | null;
  warning: SessionTimeoutWarning | null;
}

export interface SessionTimeoutManager {
  start: () => void;
  stop: () => void;
  resetIdle: () => void;
  continueSession: () => void;
  updateConfig: (config: SessionSettings) => void;
  logout: (reason?: SessionTimeoutReason) => void;
  getState: () => SessionTimeoutState;
}

interface SessionTimeoutManagerOptions {
  config: SessionSettings;
  onWarningChange: (warning: SessionTimeoutWarning | null) => void;
  onLogout: (reason: SessionTimeoutReason) => void;
  now?: () => number;
  windowRef?: Window;
  documentRef?: Document;
}

const COUNTDOWN_INTERVAL_MS = 1000;
const ABSOLUTE_WARNING_DISMISS_MS = 10_000;
const MIN_TIMEOUT_MS = 50;

const ACTIVITY_EVENTS: Array<keyof DocumentEventMap> = [
  'mousemove',
  'mousedown',
  'keydown',
  'touchstart',
  'scroll',
  'click',
];

function toPositiveNumber(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }

  return value;
}

function normalizeConfig(config: SessionSettings): SessionSettings {
  return {
    enabled: Boolean(config.enabled),
    idleMinutes: toPositiveNumber(config.idleMinutes, 15),
    warningSeconds: toPositiveNumber(config.warningSeconds, 60),
    absoluteHours: toPositiveNumber(config.absoluteHours, 8),
    absoluteWarningSeconds: toPositiveNumber(config.absoluteWarningSeconds, 5 * 60),
    activityDebounceSeconds: toPositiveNumber(config.activityDebounceSeconds, 5),
  };
}

function buildAnnouncement(remainingMs: number): string | null {
  const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));

  if (remainingSeconds > 10 && remainingSeconds % 10 !== 0) {
    return null;
  }

  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const formatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  return `Session will end in ${formatted}.`;
}

export function createSessionTimeoutManager({
  config: initialConfig,
  onWarningChange,
  onLogout,
  now: nowFn,
  windowRef,
  documentRef,
}: SessionTimeoutManagerOptions): SessionTimeoutManager {
  let config = normalizeConfig(initialConfig);

  const win = windowRef ?? (typeof window !== 'undefined' ? window : undefined);
  const doc = documentRef ?? (typeof document !== 'undefined' ? document : undefined);
  const now = nowFn ?? (() => Date.now());

  let running = false;
  let sessionStartMs = 0;
  let idleDeadlineMs = 0;
  let absoluteDeadlineMs = 0;
  let lastActivityHandledMs = 0;
  let absoluteWarningDismissedUntilMs = 0;
  let warning: SessionTimeoutWarning | null = null;
  let checkTimeoutId: number | null = null;
  let countdownIntervalId: number | null = null;

  function clearCheckTimeout(): void {
    if (!win || checkTimeoutId === null) {
      return;
    }

    win.clearTimeout(checkTimeoutId);
    checkTimeoutId = null;
  }

  function clearCountdownInterval(): void {
    if (!win || countdownIntervalId === null) {
      return;
    }

    win.clearInterval(countdownIntervalId);
    countdownIntervalId = null;
  }

  function scheduleCheck(delayMs: number): void {
    if (!win) {
      return;
    }

    clearCheckTimeout();
    checkTimeoutId = win.setTimeout(() => {
      evaluate();
    }, Math.max(MIN_TIMEOUT_MS, delayMs));
  }

  function startCountdownIfNeeded(): void {
    if (!win || countdownIntervalId !== null) {
      return;
    }

    countdownIntervalId = win.setInterval(() => {
      evaluate(true);
    }, COUNTDOWN_INTERVAL_MS);
  }

  function setWarning(next: SessionTimeoutWarning | null): void {
    const prev = warning;
    const changed =
      prev?.kind !== next?.kind ||
      prev?.deadlineMs !== next?.deadlineMs ||
      prev?.announcement !== next?.announcement ||
      Math.ceil((prev?.remainingMs ?? 0) / 1000) !== Math.ceil((next?.remainingMs ?? 0) / 1000);

    warning = next;

    if (warning) {
      startCountdownIfNeeded();
    } else {
      clearCountdownInterval();
    }

    if (changed) {
      onWarningChange(next);
    }
  }

  function idleDurationMs(): number {
    return config.idleMinutes * 60 * 1000;
  }

  function idleWarningMs(): number {
    return config.warningSeconds * 1000;
  }

  function absoluteDurationMs(): number {
    return config.absoluteHours * 60 * 60 * 1000;
  }

  function absoluteWarningMs(): number {
    return config.absoluteWarningSeconds * 1000;
  }

  function activityDebounceMs(): number {
    return config.activityDebounceSeconds * 1000;
  }

  function buildWarning(kind: SessionWarningKind, deadlineMs: number, currentMs: number): SessionTimeoutWarning {
    const remainingMs = Math.max(0, deadlineMs - currentMs);

    return {
      kind,
      deadlineMs,
      remainingMs,
      announcement: buildAnnouncement(remainingMs),
    };
  }

  function performLogout(reason: SessionTimeoutReason): void {
    stop();
    onLogout(reason);
  }

  function nextScheduledCheckMs(currentMs: number): number | null {
    const candidates = [
      idleDeadlineMs - idleWarningMs(),
      idleDeadlineMs,
      absoluteDeadlineMs - absoluteWarningMs(),
      absoluteDeadlineMs,
    ].filter((candidate) => candidate > currentMs);

    if (
      currentMs >= absoluteDeadlineMs - absoluteWarningMs() &&
      currentMs < absoluteWarningDismissedUntilMs &&
      absoluteWarningDismissedUntilMs > currentMs
    ) {
      candidates.push(absoluteWarningDismissedUntilMs);
    }

    if (candidates.length === 0) {
      return null;
    }

    return Math.min(...candidates);
  }

  function evaluate(fromCountdown: boolean = false): void {
    if (!running || !config.enabled) {
      return;
    }

    const currentMs = now();

    if (currentMs >= absoluteDeadlineMs) {
      performLogout('absolute');
      return;
    }

    if (currentMs >= idleDeadlineMs) {
      performLogout('idle');
      return;
    }

    const idleWarningStartMs = idleDeadlineMs - idleWarningMs();
    const absoluteWarningStartMs = absoluteDeadlineMs - absoluteWarningMs();

    const activeWarnings: Array<{ kind: SessionWarningKind; deadlineMs: number }> = [];

    if (currentMs >= idleWarningStartMs) {
      activeWarnings.push({ kind: 'idle', deadlineMs: idleDeadlineMs });
    }

    if (
      currentMs >= absoluteWarningStartMs &&
      currentMs >= absoluteWarningDismissedUntilMs
    ) {
      activeWarnings.push({ kind: 'absolute', deadlineMs: absoluteDeadlineMs });
    }

    if (activeWarnings.length > 0) {
      activeWarnings.sort((left, right) => left.deadlineMs - right.deadlineMs);
      setWarning(buildWarning(activeWarnings[0].kind, activeWarnings[0].deadlineMs, currentMs));
      return;
    }

    setWarning(null);

    if (fromCountdown) {
      return;
    }

    const nextCheckAt = nextScheduledCheckMs(currentMs);
    if (nextCheckAt !== null) {
      scheduleCheck(nextCheckAt - currentMs);
    }
  }

  function resetIdle(force: boolean = false): void {
    if (!running || !config.enabled) {
      return;
    }

    if (warning && !force) {
      return;
    }

    const currentMs = now();
    idleDeadlineMs = currentMs + idleDurationMs();
    lastActivityHandledMs = currentMs;

    if (warning?.kind === 'idle') {
      setWarning(null);
    }

    evaluate();
  }

  function handleActivity(): void {
    if (!running || !config.enabled || warning) {
      return;
    }

    const currentMs = now();
    if (currentMs - lastActivityHandledMs < activityDebounceMs()) {
      return;
    }

    resetIdle(true);
  }

  function attachActivityListeners(): void {
    if (!doc || !win) {
      return;
    }

    ACTIVITY_EVENTS.forEach((eventName) => {
      doc.addEventListener(eventName, handleActivity);
    });

    win.addEventListener('focus', handleActivity);
  }

  function detachActivityListeners(): void {
    if (!doc || !win) {
      return;
    }

    ACTIVITY_EVENTS.forEach((eventName) => {
      doc.removeEventListener(eventName, handleActivity);
    });

    win.removeEventListener('focus', handleActivity);
  }

  function start(): void {
    stop();

    if (!config.enabled) {
      return;
    }

    running = true;
    sessionStartMs = now();
    idleDeadlineMs = sessionStartMs + idleDurationMs();
    absoluteDeadlineMs = sessionStartMs + absoluteDurationMs();
    lastActivityHandledMs = sessionStartMs;
    absoluteWarningDismissedUntilMs = 0;

    attachActivityListeners();
    evaluate();
  }

  function stop(): void {
    running = false;
    clearCheckTimeout();
    clearCountdownInterval();
    detachActivityListeners();
    setWarning(null);
  }

  function continueSession(): void {
    if (!running || !warning) {
      resetIdle(true);
      return;
    }

    if (warning.kind === 'idle') {
      resetIdle(true);
      return;
    }

    absoluteWarningDismissedUntilMs = now() + ABSOLUTE_WARNING_DISMISS_MS;
    setWarning(null);
    evaluate();
  }

  function updateConfig(nextConfig: SessionSettings): void {
    config = normalizeConfig(nextConfig);

    if (!running) {
      if (config.enabled) {
        start();
      }
      return;
    }

    if (!config.enabled) {
      stop();
      return;
    }

    const currentMs = now();
    idleDeadlineMs = currentMs + idleDurationMs();
    absoluteDeadlineMs = sessionStartMs + absoluteDurationMs();

    if (currentMs >= absoluteDeadlineMs) {
      performLogout('absolute');
      return;
    }

    evaluate();
  }

  function logout(reason: SessionTimeoutReason = 'manual'): void {
    performLogout(reason);
  }

  function getState(): SessionTimeoutState {
    return {
      running,
      idleDeadlineMs: running ? idleDeadlineMs : null,
      absoluteDeadlineMs: running ? absoluteDeadlineMs : null,
      warning,
    };
  }

  return {
    start,
    stop,
    resetIdle: () => resetIdle(true),
    continueSession,
    updateConfig,
    logout,
    getState,
  };
}
