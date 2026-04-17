import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppShellFacade } from './AppShellFacade';
import { clearDashboardV2Gates, writeDashboardV2Gates } from './migrationGates';

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

  it('renders the legacy shell when no v2 route gate is enabled', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <AppShellFacade />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('legacy-shell')).toBeInTheDocument();
  });

  it('renders the v2 shell when the current route is enabled', () => {
    writeDashboardV2Gates({
      shell: false,
      routes: {
        dashboard: true,
        worklist: false,
        communication: false,
        'patient-workspace': false,
        alerts: false,
        insights: false,
        appointments: false,
        settings: false,
      },
    });

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <AppShellFacade />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('v2-shell')).toBeInTheDocument();
  });
});
