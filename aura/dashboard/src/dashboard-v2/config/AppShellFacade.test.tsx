import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppShellFacade } from './AppShellFacade';
import {
  clearDashboardV2Gates,
  getDefaultDashboardV2Gates,
  writeDashboardV2Gates,
} from './migrationGates';

vi.mock('../../app/AppShell', () => ({
  AppShell: () => <div data-testid="legacy-shell">legacy shell</div>,
}));

vi.mock('../shell/DashboardV2Shell', () => ({
  DashboardV2Shell: () => <div data-testid="v2-shell">v2 shell</div>,
}));

describe('AppShellFacade', () => {
  afterEach(() => {
    clearDashboardV2Gates();
  });

  it('renders the v2 shell by default on completed routes', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <AppShellFacade />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('v2-shell')).toBeInTheDocument();
  });

  it('renders the legacy shell when a completed route is explicitly rolled back', () => {
    const defaults = getDefaultDashboardV2Gates();

    writeDashboardV2Gates({
      ...defaults,
      routes: {
        ...defaults.routes,
        dashboard: false,
      },
    });

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <AppShellFacade />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('legacy-shell')).toBeInTheDocument();
  });

  it('renders the v2 shell on the patients compare route', () => {
    render(
      <MemoryRouter initialEntries={['/patients/compare']}>
        <AppShellFacade />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('v2-shell')).toBeInTheDocument();
  });

  it('renders the v2 shell by default on the patients roster route', () => {
    render(
      <MemoryRouter initialEntries={['/patients']}>
        <AppShellFacade />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('v2-shell')).toBeInTheDocument();
  });
});
