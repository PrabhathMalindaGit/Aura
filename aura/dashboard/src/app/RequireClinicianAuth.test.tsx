/* @vitest-environment jsdom */

import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RequireClinicianAuth } from './RequireClinicianAuth';

function renderGuard(): void {
  render(
    <MemoryRouter initialEntries={['/alerts']}>
      <Routes>
        <Route path="/login" element={<div>Login page</div>} />
        <Route element={<RequireClinicianAuth />}>
          <Route path="/alerts" element={<div>Alerts workspace</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('RequireClinicianAuth', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('redirects to login immediately when no clinician token is stored', async () => {
    renderGuard();

    expect(await screen.findByText('Login page')).toBeInTheDocument();
  });

  it('waits for server bootstrap and renders protected routes when the session is valid', async () => {
    window.localStorage.setItem('aura_access_token', 'ACCESS_TOKEN');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          clinician: {
            id: 'clinician-1',
            email: 'clinician@example.com',
            name: 'Clinician One',
            role: 'clinician',
          },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );

    renderGuard();

    expect(screen.getByText('Checking clinician session…')).toBeInTheDocument();
    expect(await screen.findByText('Alerts workspace')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/auth/clinician/me');
  });

  it('redirects to login and clears tokens when bootstrap returns 401', async () => {
    window.localStorage.setItem('aura_access_token', 'ACCESS_TOKEN');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: 'UNAUTHORIZED' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    );

    renderGuard();

    expect(screen.getByText('Checking clinician session…')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Login page')).toBeInTheDocument();
    });

    expect(window.localStorage.getItem('aura_access_token')).toBeNull();
  });
});
