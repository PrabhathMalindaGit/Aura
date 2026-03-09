/* @vitest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClinicianLoginPage } from './ClinicianLoginPage';

function renderPage(initialState?: unknown): void {
  render(
    <MemoryRouter initialEntries={[{ pathname: '/login', state: initialState }]}>
      <Routes>
        <Route path="/login" element={<ClinicianLoginPage />} />
        <Route path="/dashboard" element={<div>Dashboard home</div>} />
        <Route path="/alerts" element={<div>Alerts workspace</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ClinicianLoginPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('shows session-expired recovery guidance', () => {
    renderPage({ reason: 'expired' });

    expect(screen.getByText('Your clinician session expired. Sign in again to continue.')).toBeInTheDocument();
  });

  it('signs in and routes to alerts on valid credentials', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          token: 'TOKEN_VALUE',
          clinician: {
            id: 'clinician-1',
            name: 'Clinician One',
          },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );

    renderPage({ from: '/alerts' });

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'clinician1@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'devpass123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(screen.getByText('Alerts workspace')).toBeInTheDocument();
    });

    expect(window.localStorage.getItem('aura_access_token')).toBe('TOKEN_VALUE');
  });

  it('defaults to dashboard home when no redirect source is provided', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          token: 'TOKEN_VALUE',
          clinician: {
            id: 'clinician-1',
            name: 'Clinician One',
          },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );

    renderPage();

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'clinician1@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'devpass123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(screen.getByText('Dashboard home')).toBeInTheDocument();
    });
  });
});
