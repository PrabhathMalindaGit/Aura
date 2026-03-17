/* @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommunicationPage } from './CommunicationPage';
import { createJsonResponse } from '../test/mocks';

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

function renderCommunicationPage(initialEntry: string = '/communication'): void {
  const queryClient = createQueryClient();

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/communication" element={<CommunicationPage />} />
          <Route path="/patients/:patientId" element={<div>Patient detail workspace</div>} />
          <Route path="/alerts" element={<div>Alerts workspace</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const communicationOverview = {
  counts: {
    needsResponseCount: 2,
    flaggedBySafetyCount: 1,
    followUpRequestedCount: 2,
  },
  items: [
    {
      id: 'comm-1',
      patientId: 'patient-1',
      patientName: 'Jordan Lee',
      messageId: 'msg-1',
      needsResponse: true,
      flaggedBySafety: true,
      followUpRequested: true,
      messageCreatedAt: '2026-03-09T11:15:00.000Z',
      messagePreview: 'Pain is much worse after exercise today.',
    },
    {
      id: 'comm-2',
      patientId: 'patient-1',
      patientName: 'Jordan Lee',
      messageId: 'msg-2',
      needsResponse: true,
      flaggedBySafety: false,
      followUpRequested: false,
      messageCreatedAt: '2026-03-09T09:00:00.000Z',
      messagePreview: 'The morning session felt harder than usual.',
    },
    {
      id: 'comm-3',
      patientId: 'patient-2',
      patientName: 'Avery Chen',
      messageId: 'msg-3',
      needsResponse: true,
      flaggedBySafety: false,
      followUpRequested: true,
      messageCreatedAt: '2026-03-09T10:30:00.000Z',
      messagePreview: 'Can someone confirm whether tomorrow still works?',
    },
  ],
};

function installCommunicationFetchMock(): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(String(input));

    if (url.pathname === '/clinician/dashboard/communication-overview') {
      return createJsonResponse({ ok: true, overview: communicationOverview });
    }

    return createJsonResponse({ ok: false, error: 'NOT_FOUND' }, 404);
  });
}

describe('CommunicationPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem('aura_access_token', 'TEST_TOKEN');
    installCommunicationFetchMock();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders grouped patient-linked threads and a truthful communication timeline', async () => {
    renderCommunicationPage();

    expect(await screen.findByRole('heading', { name: 'Communication' })).toBeInTheDocument();
    expect(screen.getByText('Communication queue')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Jordan Lee/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Avery Chen/ })).toBeInTheDocument();
    expect(
      within(screen.getByRole('list', { name: 'Patient communication timeline' })).getByText(
        'Pain is much worse after exercise today.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'This timeline shows communication currently surfaced in the dashboard plus clinician replies stored locally in this browser.',
      ),
    ).toBeInTheDocument();
  });

  it('keeps unread threads unread through filter changes until the thread becomes active', async () => {
    const user = userEvent.setup();
    renderCommunicationPage();

    const averyThread = await screen.findByRole('button', { name: /Avery Chen/ });
    expect(within(averyThread).getByText('Unread')).toBeInTheDocument();

    await user.click(
      within(screen.getByRole('group', { name: 'Communication filters' })).getByRole('button', {
        name: /Unread/i,
      }),
    );

    expect(screen.queryByRole('button', { name: /Jordan Lee/ })).not.toBeInTheDocument();
    const unreadThread = screen.getByRole('button', { name: /Avery Chen/ });
    expect(within(unreadThread).getByText('Unread')).toBeInTheDocument();
    expect(screen.getByText('Selected thread is outside this view')).toBeInTheDocument();

    await user.click(unreadThread);

    await waitFor(() => {
      expect(within(screen.getByRole('button', { name: /Avery Chen/ })).queryByText('Unread')).not.toBeInTheDocument();
    });
  });

  it('falls back cleanly when the requested patient thread is missing', async () => {
    renderCommunicationPage('/communication?patientId=missing-patient');

    expect(await screen.findByRole('button', { name: /Jordan Lee/ })).toBeInTheDocument();
    expect(
      within(screen.getByRole('list', { name: 'Patient communication timeline' })).getByText(
        'Pain is much worse after exercise today.',
      ),
    ).toBeInTheDocument();
  });

  it('adds a browser-local clinician reply and updates the visible response state', async () => {
    const user = userEvent.setup();
    renderCommunicationPage('/communication?patientId=patient-2');

    const threadButton = await screen.findByRole('button', { name: /Avery Chen/ });
    expect(within(threadButton).getByText('Needs response')).toBeInTheDocument();

    await user.type(
      screen.getByRole('textbox', { name: 'Clinician reply' }),
      'Please keep tomorrow for now. We will review the schedule this afternoon.',
    );
    await user.click(screen.getByRole('button', { name: 'Send reply' }));

    expect(
      await within(screen.getByRole('list', { name: 'Patient communication timeline' })).findByText(
        'Please keep tomorrow for now. We will review the schedule this afternoon.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Replies are stored only in this browser for the current clinician during this foundation pass.')).toBeInTheDocument();

    await waitFor(() => {
      expect(within(screen.getByRole('button', { name: /Avery Chen/ })).queryByText('Needs response')).not.toBeInTheDocument();
    });
  });

  it('shows safety-aware alerts continuity only for safety-flagged threads', async () => {
    const user = userEvent.setup();
    renderCommunicationPage('/communication?patientId=patient-1');

    expect(await screen.findByRole('button', { name: 'Open alerts' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Open alerts' }));

    await waitFor(() => {
      expect(screen.getByText('Alerts workspace')).toBeInTheDocument();
    });
  });
});
