/* @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommunicationPage } from './CommunicationPage';
import { SettingsPage } from './SettingsPage';
import { createJsonResponse } from '../test/mocks';
import { clearClinicianProfileForTests, getClinicianProfile, setClinicianProfile } from '../services/clinicianProfile';
import {
  addPatientHandoffNote,
  clearPatientHandoffWorkspaceForTests,
  savePatientCurrentHandoff,
} from '../services/patientHandoffWorkspace';

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

function toBase64Url(value: string): string {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function buildToken(input: { sub: string; name?: string; exp?: number }): string {
  const header = toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = toBase64Url(
    JSON.stringify({
      sub: input.sub,
      name: input.name,
      exp: input.exp ?? Math.floor(Date.now() / 1000) + 60 * 60,
    }),
  );

  return `${header}.${payload}.signature`;
}

function signInAs(input: { sub: string; name?: string }): void {
  window.localStorage.setItem('aura_access_token', buildToken(input));
}

function renderCommunicationPage(initialEntry: string = '/communication'): void {
  const queryClient = createQueryClient();

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/communication" element={<CommunicationPage />} />
          <Route path="/patients/:patientId" element={<div>Patient detail workspace</div>} />
          <Route path="/patients/:patientId/plan" element={<div>Plan workspace</div>} />
          <Route path="/appointments" element={<div>Appointments workspace</div>} />
          <Route path="/alerts" element={<AlertsWorkspaceRoute />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function renderCommunicationPageWithSettings(initialEntry: string = '/communication'): void {
  const queryClient = createQueryClient();

  render(
    <>
      <SettingsPage />
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[initialEntry]}>
          <Routes>
            <Route path="/communication" element={<CommunicationPage />} />
            <Route path="/patients/:patientId" element={<div>Patient detail workspace</div>} />
            <Route path="/patients/:patientId/plan" element={<div>Plan workspace</div>} />
            <Route path="/appointments" element={<div>Appointments workspace</div>} />
            <Route path="/alerts" element={<AlertsWorkspaceRoute />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </>,
  );
}

function AlertsWorkspaceRoute(): JSX.Element {
  const location = useLocation();

  return <div>{`Alerts workspace${location.search}`}</div>;
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
    clearClinicianProfileForTests();
    clearPatientHandoffWorkspaceForTests();
    signInAs({ sub: 'auth-clinician-1', name: 'Dr Rivera' });
    setClinicianProfile({
      ...getClinicianProfile(),
      displayName: 'Dr Elena Hall',
      clinicianId: 'elena-hall-local',
      roleTitle: 'Lead rehab clinician',
      specialty: 'Post-op recovery',
    });
    installCommunicationFetchMock();
  });

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

  it('renders grouped patient-linked threads and a truthful communication timeline', async () => {
    const user = userEvent.setup();
    renderCommunicationPage();

    expect(await screen.findByRole('heading', { name: 'Communication' })).toBeInTheDocument();
    expect(screen.getByText('Communication queue')).toBeInTheDocument();
    const jordanThread = await screen.findByRole('button', { name: /Jordan Lee/ });
    expect(jordanThread).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Avery Chen/ })).toBeInTheDocument();

    await user.click(jordanThread);

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

  it('applies the saved default communication filter only when the route does not already set one', async () => {
    setClinicianProfile({
      ...getClinicianProfile(),
      workspacePreferences: {
        ...getClinicianProfile().workspacePreferences,
        defaultCommunicationFilter: 'needs-response',
      },
    });

    renderCommunicationPage();

    expect(await screen.findByRole('button', { name: /Needs response/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
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

  it('falls back cleanly when the requested patient thread is missing and preserves the requested view', async () => {
    renderCommunicationPage('/communication?patientId=missing-patient&view=safety-flagged');

    const safetyFlaggedFilter = await screen.findByRole('button', { name: /Safety flagged/i });
    expect(safetyFlaggedFilter).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByRole('button', { name: /Jordan Lee/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Avery Chen/ })).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('list', { name: 'Patient communication timeline' })).getByText(
        'Pain is much worse after exercise today.',
      ),
    ).toBeInTheDocument();
  });

  it('adds a browser-local clinician reply and updates the visible response state', async () => {
    const user = userEvent.setup();
    renderCommunicationPage('/communication?patientId=patient-2&view=needs-response');

    expect(await screen.findByRole('button', { name: /Needs response/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    const threadButton = await screen.findByRole('button', { name: /Avery Chen/ });
    expect(within(threadButton).getByText('Needs response')).toBeInTheDocument();

    await user.type(
      screen.getByRole('textbox', { name: 'Clinician reply' }),
      'Please keep tomorrow for now. We will review the schedule this afternoon.',
    );
    expect(screen.getByText('Local clinician identity')).toBeInTheDocument();
    expect(screen.getByText('Dr Elena Hall')).toBeInTheDocument();
    expect(screen.getByText('Lead rehab clinician · Post-op recovery')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save local reply' }));

    expect(
      await within(screen.getByRole('list', { name: 'Patient communication timeline' })).findByText(
        'Please keep tomorrow for now. We will review the schedule this afternoon.',
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Dr Elena Hall').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Lead rehab clinician · Post-op recovery').length).toBeGreaterThan(0);
    expect(screen.getByText('Replies are stored only in this browser for the current clinician during this foundation pass.')).toBeInTheDocument();

    await waitFor(() => {
      expect(within(screen.getByRole('button', { name: /Avery Chen/ })).queryByText('Needs response')).not.toBeInTheDocument();
    });
  });

  it('inserts templates and dedupes the signature block without overwriting draft text', async () => {
    const user = userEvent.setup();
    setClinicianProfile({
      ...getClinicianProfile(),
      communicationAuthoring: {
        defaultSignature: 'Dr Elena Hall\nLead rehab clinician · Post-op recovery',
        autoAppendSignature: false,
        templates: [
          {
            id: 'reviewed',
            title: 'Reviewed',
            body: 'Thanks, I have reviewed this update.',
          },
        ],
      },
    });

    renderCommunicationPage('/communication?patientId=patient-2&view=needs-response');

    const replyField = (await screen.findByRole('textbox', {
      name: 'Clinician reply',
    })) as HTMLTextAreaElement;
    expect(screen.getByRole('combobox', { name: 'Quick reply template' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Insert template' }));
    expect(replyField).toHaveValue('Thanks, I have reviewed this update.');

    await user.click(screen.getByRole('button', { name: 'Insert signature' }));
    expect(replyField).toHaveValue(
      'Thanks, I have reviewed this update.\n\nDr Elena Hall\nLead rehab clinician · Post-op recovery',
    );

    await user.click(screen.getByRole('button', { name: 'Insert signature' }));
    expect(replyField).toHaveValue(
      'Thanks, I have reviewed this update.\n\nDr Elena Hall\nLead rehab clinician · Post-op recovery',
    );
  });

  it('auto-appends the saved signature only on fresh empty draft sessions and not after removal', async () => {
    const user = userEvent.setup();
    const signature = 'Dr Elena Hall\nLead rehab clinician · Post-op recovery';

    setClinicianProfile({
      ...getClinicianProfile(),
      communicationAuthoring: {
        defaultSignature: signature,
        autoAppendSignature: true,
        templates: [
          {
            id: 'follow-up',
            title: 'Follow-up',
            body: 'Please keep checking in tomorrow.',
          },
        ],
      },
    });

    renderCommunicationPage('/communication?patientId=patient-1');

    const replyField = (await screen.findByRole('textbox', {
      name: 'Clinician reply',
    })) as HTMLTextAreaElement;
    await waitFor(() => {
      expect(replyField).toHaveValue(signature);
    });

    await user.click(screen.getByRole('button', { name: 'Insert template' }));
    expect(replyField).toHaveValue(`Please keep checking in tomorrow.\n\n${signature}`);

    await user.clear(replyField);
    expect(replyField).toHaveValue('');

    await user.click(screen.getByRole('button', { name: /Avery Chen/ }));
    await waitFor(() => {
      expect(replyField).toHaveValue(signature);
    });

    await user.click(screen.getByRole('button', { name: /Jordan Lee/ }));
    await waitFor(() => {
      expect(replyField).toHaveValue('');
    });
  });

  it('reacts to Settings authoring changes in the open composer without a reload', async () => {
    const user = userEvent.setup();

    renderCommunicationPageWithSettings('/communication?patientId=patient-2&view=needs-response');

    const templatePicker = (await screen.findByRole(
      'combobox',
      {
        name: 'Quick reply template',
      },
      {
        timeout: 5_000,
      },
    )) as HTMLSelectElement;
    const insertSignatureButton = screen.getByRole('button', { name: 'Insert signature' });
    const replyField = screen.getByRole('textbox', { name: 'Clinician reply' });

    expect(templatePicker).toBeDisabled();
    expect(insertSignatureButton).toBeDisabled();

    await user.type(
      screen.getByLabelText('Default signature'),
      'Dr Elena Hall\nLead rehab clinician · Post-op recovery',
    );
    await user.click(screen.getByRole('button', { name: 'Add template' }));
    await user.type(screen.getByLabelText('Template 1 title'), 'Reviewed');
    await user.type(
      screen.getByLabelText('Template 1 body'),
      'Thanks, I have reviewed this update.',
    );
    await user.click(screen.getByRole('button', { name: 'Save communication settings' }));

    await waitFor(() => {
      expect(templatePicker).not.toBeDisabled();
    });
    expect(insertSignatureButton).not.toBeDisabled();
    expect(within(templatePicker).getByRole('option', { name: 'Reviewed' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Insert template' }));
    await user.click(insertSignatureButton);

    expect(replyField).toHaveValue(
      'Thanks, I have reviewed this update.\n\nDr Elena Hall\nLead rehab clinician · Post-op recovery',
    );
  }, 30_000);

  it('reduces only page-level communication attention without hiding active thread content', async () => {
    setClinicianProfile({
      ...getClinicianProfile(),
      notificationPreferences: {
        communication: {
          cueMode: 'reduced',
        },
        safety: {
          cueMode: 'default',
        },
        quietHours: {
          enabled: false,
          startTime: '22:00',
          endTime: '07:00',
        },
      },
    });

    renderCommunicationPage('/communication?patientId=patient-1&view=needs-response');

    expect(await screen.findByRole('button', { name: /Jordan Lee/ })).toBeInTheDocument();
    const needsResponsePill = await screen.findByTestId('communication-needs-response-pill');
    expect(needsResponsePill).not.toHaveClass('communication-page__meta-pill--attention');
    expect(
      within(screen.getByRole('group', { name: 'Communication filters' })).getByRole('button', {
        name: /Needs response/i,
      }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      within(screen.getByRole('list', { name: 'Patient communication timeline' })).getByText(
        'Pain is much worse after exercise today.',
      ),
    ).toBeInTheDocument();
  });

  it('reacts to Settings notification changes without hiding the currently open thread', async () => {
    const user = userEvent.setup();

    renderCommunicationPageWithSettings('/communication?patientId=patient-1&view=needs-response');

    const needsResponsePill = (await screen.findByTestId(
      'communication-needs-response-pill',
    )) as HTMLElement;
    expect(needsResponsePill).toHaveClass('communication-page__meta-pill--attention');

    await user.selectOptions(screen.getByLabelText('Communication attention cues'), 'reduced');
    await user.click(screen.getByRole('button', { name: 'Save notification settings' }));

    await waitFor(() => {
      expect(needsResponsePill).not.toHaveClass('communication-page__meta-pill--attention');
    });
    expect(screen.getByRole('button', { name: /Jordan Lee/ })).toBeInTheDocument();
    expect(
      within(screen.getByRole('list', { name: 'Patient communication timeline' })).getByText(
        'Pain is much worse after exercise today.',
      ),
    ).toBeInTheDocument();
  });

  it('shows safety-aware alerts continuity only for safety-flagged threads', async () => {
    const user = userEvent.setup();
    renderCommunicationPage('/communication?patientId=patient-1');

    expect(await screen.findByRole('button', { name: 'Open alerts' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Open alerts' }));

    await waitFor(() => {
      expect(screen.getByText('Alerts workspace?patientId=patient-1&source=chat')).toBeInTheDocument();
    });
  });

  it('renders a read-only handoff context strip when browser-local handoff data exists', async () => {
    savePatientCurrentHandoff('patient-1', {
      summary: 'Keep this thread aligned with the current plan review before the next reply.',
      nextAction: 'plan',
      followUpOwner: { kind: 'self', clinicianId: '', authorDisplayName: '' },
    });
    const user = userEvent.setup();

    renderCommunicationPage('/communication?patientId=patient-1');

    const handoffContext = await screen.findByTestId('communication-handoff-context');
    expect(handoffContext).toHaveAccessibleName('Internal handoff context');
    expect(
      within(handoffContext).getByText(
        'Keep this thread aligned with the current plan review before the next reply.',
      ),
    ).toBeInTheDocument();
    expect(within(handoffContext).getByRole('button', { name: 'Open plan' })).toBeInTheDocument();
    expect(within(handoffContext).getAllByText('Dr Elena Hall').length).toBeGreaterThan(0);
    expect(
      within(handoffContext).getByText('Stored only in this browser for local patient handoff continuity.'),
    ).toBeInTheDocument();

    await user.click(within(handoffContext).getByRole('button', { name: 'Open plan' }));

    await waitFor(() => {
      expect(screen.getByText('Plan workspace')).toBeInTheDocument();
    });
  });

  it('shows the latest internal note preview when there is no current structured handoff', async () => {
    addPatientHandoffNote('patient-2', 'Latest browser-local note for the next review pass.');

    renderCommunicationPage('/communication?patientId=patient-2');

    const handoffContext = await screen.findByTestId('communication-handoff-context');
    expect(
      within(handoffContext).getByText('Latest browser-local note for the next review pass.'),
    ).toBeInTheDocument();
    expect(within(handoffContext).getByText('Latest note by')).toBeInTheDocument();
    expect(within(handoffContext).queryByText('Next step')).not.toBeInTheDocument();
    expect(within(handoffContext).queryByText('Follow-up owner')).not.toBeInTheDocument();
  });

  it('does not show the handoff context strip when no local handoff data exists', async () => {
    renderCommunicationPage('/communication?patientId=patient-1');

    expect(await screen.findByRole('heading', { name: 'Communication' })).toBeInTheDocument();
    expect(screen.queryByTestId('communication-handoff-context')).not.toBeInTheDocument();
  });

  it('keeps the message timeline truthful when handoff context exists', async () => {
    savePatientCurrentHandoff('patient-1', {
      summary: 'Handoff context belongs in the strip, not the communication timeline.',
      nextAction: 'alerts',
      followUpOwner: { kind: 'custom', label: 'Weekend coverage desk' },
    });
    addPatientHandoffNote('patient-1', 'This note should not appear as a timeline message.');

    renderCommunicationPage('/communication?patientId=patient-1');

    const handoffContext = await screen.findByTestId('communication-handoff-context');
    expect(handoffContext).toBeInTheDocument();

    const timeline = screen.getByRole('list', { name: 'Patient communication timeline' });
    expect(within(timeline).getByText('Pain is much worse after exercise today.')).toBeInTheDocument();
    expect(within(timeline).queryByText('Handoff context belongs in the strip, not the communication timeline.')).not.toBeInTheDocument();
    expect(within(timeline).queryByText('This note should not appear as a timeline message.')).not.toBeInTheDocument();
    expect(within(timeline).queryByText('Dr Elena Hall')).not.toBeInTheDocument();
  });
});
