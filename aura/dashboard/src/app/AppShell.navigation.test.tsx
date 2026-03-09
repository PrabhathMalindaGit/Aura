/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Navigate, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from './AppShell';

type BreakpointPreset = 'mobile' | 'desktop';

function installMatchMediaPreset(preset: BreakpointPreset): void {
  const mobileMap = new Map<string, boolean>([
    ['(max-width: 899px)', true],
    ['(min-width: 900px) and (max-width: 1199px)', false],
    ['(min-width: 1200px)', false],
  ]);

  const desktopMap = new Map<string, boolean>([
    ['(max-width: 899px)', false],
    ['(min-width: 900px) and (max-width: 1199px)', false],
    ['(min-width: 1200px)', true],
  ]);

  const activeMap = preset === 'mobile' ? mobileMap : desktopMap;

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: activeMap.get(query) ?? false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function renderShell(entry: string): void {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/" element={<AppShell />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<div>Dashboard workspace</div>} />
          <Route path="alerts" element={<div>Alerts workspace</div>} />
          <Route path="patients" element={<div>Patients workspace</div>} />
          <Route path="settings" element={<div>Settings workspace</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('AppShell navigation', () => {
  beforeEach(() => {
    window.localStorage.clear();
    installMatchMediaPreset('desktop');
  });

  afterEach(() => {
    cleanup();
  });

  it('opens and closes mobile nav sheet with menu button and Escape', async () => {
    installMatchMediaPreset('mobile');
    const user = userEvent.setup();

    renderShell('/alerts');

    const menuButton = screen.getByRole('button', { name: 'Open navigation menu' });
    await user.click(menuButton);

    expect(screen.getByRole('dialog', { name: 'Navigation menu' })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Navigation menu' })).not.toBeInTheDocument();
    });

    expect(menuButton).toHaveFocus();
  });

  it('highlights the active sidebar item on desktop', () => {
    installMatchMediaPreset('desktop');
    renderShell('/patients');

    const activeLink = screen.getByRole('link', { name: 'Patients' });
    expect(activeLink).toHaveClass('sidebar-item--active');
  });

  it('redirects the shell index route to dashboard workspace', async () => {
    installMatchMediaPreset('desktop');
    renderShell('/');

    await waitFor(() => {
      expect(screen.getByText('Dashboard workspace')).toBeInTheDocument();
    });

    const activeLink = screen.getByRole('link', { name: 'Dashboard' });
    expect(activeLink).toHaveClass('sidebar-item--active');
  });
});
