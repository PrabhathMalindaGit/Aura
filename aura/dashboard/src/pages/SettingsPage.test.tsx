/* @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SettingsPage } from './SettingsPage';

describe('SettingsPage truthfulness', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it('keeps only real appearance controls interactive and explains pending ones honestly', () => {
    render(<SettingsPage />);

    expect(screen.getByRole('radio', { name: 'System' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Light' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeInTheDocument();

    expect(screen.queryByRole('button', { name: 'Save preferences' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Restore defaults' })).not.toBeInTheDocument();

    expect(
      screen.getByText(
        'Warning display follows the live connection state in the shared shell and is not configurable in this browser yet.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Table density still follows the shared dashboard default. A browser-level density preference is planned, but not active in this pass.',
      ),
    ).toBeInTheDocument();
  });
});
