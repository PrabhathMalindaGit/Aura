/* @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
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

function renderPatientsPage(): void {
  const queryClient = createQueryClient();

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
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

    expect(await screen.findByText('Patients endpoint not ready')).toBeInTheDocument();
    expect(screen.getByText('Add GET /clinician/patients returning { ok: true, patients: [...] }')).toBeInTheDocument();
    expect(screen.getByLabelText('Search patients')).toBeInTheDocument();
  });
});
