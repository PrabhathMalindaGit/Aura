/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OfflineBanner } from './OfflineBanner';
import {
  markSuccess,
  resetConnectionStoreForTests,
  setOnline,
} from '../../services/connectionStore';

describe('OfflineBanner', () => {
  beforeEach(() => {
    resetConnectionStoreForTests();
    window.sessionStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-22T09:14:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('renders offline message with last known data time and fixed banner class', () => {
    markSuccess('/clinician/alerts', Date.parse('2026-02-22T09:14:00.000Z'));
    setOnline(false);

    render(<OfflineBanner />);

    expect(screen.getByRole('status')).toHaveTextContent('Offline');
    expect(screen.getByRole('status')).toHaveTextContent('Showing last known data as of');
    expect(screen.getByRole('status')).toHaveClass('offline-banner--fixed');
  });

  it('dispatches global retry event', () => {
    markSuccess('/clinician/alerts', Date.parse('2026-02-22T09:14:00.000Z'));
    setOnline(false);
    const retryListener = vi.fn();
    window.addEventListener('aura:retry', retryListener);

    render(<OfflineBanner />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(retryListener).toHaveBeenCalledTimes(1);
    window.removeEventListener('aura:retry', retryListener);
  });
});
