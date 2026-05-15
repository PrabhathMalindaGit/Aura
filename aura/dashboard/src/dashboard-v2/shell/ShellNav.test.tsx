import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { DashboardV2ShellNav } from './ShellNav';

describe('DashboardV2ShellNav', () => {
  it('keeps clear accessible names when collapsed to icon-only navigation', () => {
    render(
      <MemoryRouter>
        <DashboardV2ShellNav collapsed />
      </MemoryRouter>,
    );

    expect(screen.getByRole('img', { name: 'Aura logo' })).toBeInTheDocument();

    for (const name of [
      'Dashboard',
      'Worklist',
      'Patients',
      'Alerts',
      'Communication',
      'Appointments',
      'Insights',
      'Settings',
    ]) {
      expect(screen.getByRole('link', { name })).toBeInTheDocument();
    }
  });

  it('uses the same concise accessible names in expanded navigation', () => {
    render(
      <MemoryRouter>
        <DashboardV2ShellNav collapsed={false} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('img', { name: 'Aura logo' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Worklist' })).toBeInTheDocument();
  });

  it('keeps the collapse toggle accessible when rendered as a compact collapsed control', () => {
    render(
      <MemoryRouter>
        <DashboardV2ShellNav collapsed onToggleCollapse={vi.fn()} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('title', 'Today overview');
  });
});
