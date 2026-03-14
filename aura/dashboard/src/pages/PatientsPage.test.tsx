/* @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PatientsPage } from './PatientsPage';

function createJsonResponse(body: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

function installMatchMediaMock(): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
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

function renderPatientsPage(initialEntry: string = '/patients'): void {
  const queryClient = createQueryClient();

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <PatientsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  installMatchMediaMock();
});

afterEach(() => {
  cleanup();
});

describe('PatientsPage endpoint handling', () => {
  it('renders endpoint not ready empty state when /clinician/patients is missing', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes('/clinician/patients')) {
        return createJsonResponse({ ok: false }, 404);
      }

      return createJsonResponse({ ok: true, patients: [] });
    });

    renderPatientsPage();

    expect(await screen.findByText('Patients list not available yet')).toBeInTheDocument();
    expect(screen.getByText('The backend endpoint /clinician/patients is not implemented.')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Show developer hint'));
    expect(screen.getByText('Add GET /clinician/patients returning { ok: true, patients: [...] }')).toBeInTheDocument();
    expect(screen.getByLabelText('Search patients')).toBeInTheDocument();
  });

  it('hydrates the roster search from the URL query string', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes('/clinician/patients')) {
        return createJsonResponse(
          {
            ok: true,
            patients: [
              {
                id: 'patient-42',
                displayName: 'Taylor Moss',
                status: 'active',
                lastCheckinAt: '2026-03-13T09:00:00.000Z',
                openAlertCount: 1,
                lastPain: 7.2,
              },
              {
                id: 'patient-77',
                displayName: 'Jordan Lee',
                status: 'active',
                lastCheckinAt: '2026-03-13T10:00:00.000Z',
                openAlertCount: 0,
                lastPain: 2.1,
              },
            ],
          },
          200,
        );
      }

      return createJsonResponse({ ok: true, patients: [] });
    });

    renderPatientsPage('/patients?search=Taylor');

    const searchInput = await screen.findByRole('searchbox', { name: 'Search patients' });
    expect(searchInput).toHaveValue('Taylor');

    await waitFor(() => {
      expect(screen.getByLabelText('Patient Taylor Moss')).toBeInTheDocument();
    });
    expect(screen.queryByLabelText('Patient Jordan Lee')).not.toBeInTheDocument();
  });
});
