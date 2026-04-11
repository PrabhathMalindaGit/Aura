/* @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
import type { ClinicianCoordinationRecord } from '../types/models';

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
          <Route
            path="/patients/:patientId/communications"
            element={<div>Patient detail communications workspace</div>}
          />
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
            <Route
              path="/patients/:patientId/communications"
              element={<div>Patient detail communications workspace</div>}
            />
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
      patientRiskLevel: 'high',
      openAlertCount: 2,
      lastCheckinAt: '2026-03-09T08:15:00.000Z',
      lastPainScore: 8,
      responseState: 'delayed',
      responseDelayHours: 8,
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
      patientRiskLevel: 'high',
      openAlertCount: 2,
      lastCheckinAt: '2026-03-09T08:15:00.000Z',
      lastPainScore: 8,
      responseState: 'delayed',
      responseDelayHours: 8,
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
      patientRiskLevel: 'low',
      openAlertCount: 0,
      lastCheckinAt: '2026-03-08T09:30:00.000Z',
      lastPainScore: 3,
      responseState: 'reviewing',
      responseDelayHours: 24,
    },
  ],
};

function createSharedCoordinationRecord(
  patientId: string,
  overrides: Partial<ClinicianCoordinationRecord> = {},
): ClinicianCoordinationRecord {
  return {
    patientId,
    currentHandoff: {
      summary: 'Shared coordination summary for the next clinician.',
      nextStep: 'plan',
      followUpOwner: {
        kind: 'clinician',
        clinicianId: 'coordination-clinician-1',
        displayName: 'Dr Elena Hall',
      },
      updatedBy: {
        clinicianId: 'coordination-clinician-1',
        displayName: 'Dr Elena Hall',
      },
      updatedAt: '2026-03-09T11:45:00.000Z',
    },
    noteHistory: [
      {
        id: 'coord-note-1',
        text: 'Shared coordination note for inbox review.',
        createdBy: {
          clinicianId: 'coordination-clinician-1',
          displayName: 'Dr Elena Hall',
        },
        createdAt: '2026-03-09T11:50:00.000Z',
      },
    ],
    createdAt: '2026-03-09T11:40:00.000Z',
    updatedAt: '2026-03-09T11:50:00.000Z',
    ...overrides,
  };
}

function installCommunicationFetchMock(options: {
  coordinationByPatient?: Record<string, ClinicianCoordinationRecord | null>;
  coordinationGetStatus?: number;
  coordinationNoteStatus?: number;
} = {}): void {
  vi.restoreAllMocks();
  const coordinationState = new Map(
    Object.entries(options.coordinationByPatient ?? {}),
  );

  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input));

    if (url.pathname === '/clinician/dashboard/communication-overview') {
      return createJsonResponse({ ok: true, overview: communicationOverview });
    }

    if (url.pathname.match(/^\/clinician\/patients\/[^/]+\/coordination\/notes$/)) {
      if (options.coordinationNoteStatus && options.coordinationNoteStatus >= 400) {
        return createJsonResponse({ ok: false, error: 'COORDINATION_NOTE_FAILED' }, options.coordinationNoteStatus);
      }

      const patientId = decodeURIComponent(url.pathname.split('/')[3] ?? '');
      const requestBody = init?.body ? (JSON.parse(String(init.body)) as { text?: string }) : {};
      const currentRecord = coordinationState.get(patientId) ?? null;
      const nextCreatedAt = new Date(
        Date.parse(currentRecord?.updatedAt ?? '2026-03-09T12:00:00.000Z') + 60_000,
      ).toISOString();
      const nextNote = {
        id: `coord-note-${(currentRecord?.noteHistory.length ?? 0) + 1}`,
        text: requestBody.text ?? '',
        createdBy: {
          clinicianId: 'elena-hall-local',
          displayName: 'Dr Elena Hall',
        },
        createdAt: nextCreatedAt,
      };
      const nextRecord: ClinicianCoordinationRecord = {
        patientId,
        currentHandoff: currentRecord?.currentHandoff ?? null,
        noteHistory: [nextNote, ...(currentRecord?.noteHistory ?? [])],
        createdAt: currentRecord?.createdAt ?? nextCreatedAt,
        updatedAt: nextCreatedAt,
      };

      coordinationState.set(patientId, nextRecord);

      return createJsonResponse({
        ok: true,
        coordination: nextRecord,
      }, 201);
    }

    if (url.pathname.match(/^\/clinician\/patients\/[^/]+\/coordination$/)) {
      if (options.coordinationGetStatus && options.coordinationGetStatus >= 400) {
        return createJsonResponse({ ok: false, error: 'COORDINATION_LOAD_FAILED' }, options.coordinationGetStatus);
      }

      const patientId = decodeURIComponent(url.pathname.split('/')[3] ?? '');
      return createJsonResponse({
        ok: true,
        coordination: coordinationState.get(patientId) ?? null,
      });
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

    expect(await screen.findByRole('heading', { name: 'Inbox' })).toBeInTheDocument();
    expect(screen.getByText('Communication queue')).toBeInTheDocument();
    expect(screen.queryByText('Inbox summary')).not.toBeInTheDocument();
    expect(screen.queryByText('Clinical communication review')).not.toBeInTheDocument();
    expect(screen.queryByText('Compose console')).not.toBeInTheDocument();
    expect(screen.queryByText('Current mix')).not.toBeInTheDocument();
    const jordanThread = await screen.findByRole('button', { name: /Jordan Lee/ });
    expect(jordanThread).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Avery Chen/ })).toBeInTheDocument();

    await user.click(jordanThread);

    expect(
      within(screen.getByRole('list', { name: 'Patient communication timeline' })).getByText(
        'Pain is much worse after exercise today.',
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Higher risk context/i)[0]).toBeInTheDocument();
    expect(screen.getAllByText(/2 open alerts/i)[0]).toBeInTheDocument();
    expect(screen.getAllByText(/Response delayed past 8h/i)[0]).toBeInTheDocument();
    expect(
      screen.getByText(
        'This timeline is limited to patient communication plus local clinician replies saved in this browser.',
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
    expect(within(averyThread).getByText('Needs response')).toBeInTheDocument();

    await user.click(
      within(screen.getByRole('group', { name: 'Communication filters' })).getByRole('button', {
        name: /Unread/i,
      }),
    );

    expect(screen.queryByRole('button', { name: /Jordan Lee/ })).not.toBeInTheDocument();
    const unreadThread = screen.getByRole('button', { name: /Avery Chen/ });
    expect(screen.getByText('Selected thread is outside this view')).toBeInTheDocument();

    await user.click(unreadThread);

    await waitFor(() => {
      expect(screen.queryByText('Selected thread is outside this view')).not.toBeInTheDocument();
      expect(
        within(screen.getByRole('region', { name: 'Active communication review' })).queryByText('Unread'),
      ).not.toBeInTheDocument();
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

    const replyField = await screen.findByRole('textbox', { name: 'Personal reply draft' });
    fireEvent.change(replyField, {
      target: {
        value: 'Please keep tomorrow for now. We will review the schedule this afternoon.',
      },
    });
    await waitFor(() => {
      expect(replyField).toHaveValue(
        'Please keep tomorrow for now. We will review the schedule this afternoon.',
      );
    });
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
    expect(
      screen.getByText(
        'Local to this browser for this clinician. Not sent from Aura and not shared with the care team.',
      ),
    ).toBeInTheDocument();

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
      name: 'Personal reply draft',
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
      name: 'Personal reply draft',
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
    const replyField = screen.getByRole('textbox', { name: 'Personal reply draft' });

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
    expect(needsResponsePill).not.toHaveClass('communication-page__status-card--response-hot');
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
    expect(needsResponsePill).toHaveClass('communication-page__status-card--response-hot');

    await user.selectOptions(screen.getByLabelText('Communication attention cues'), 'reduced');
    await user.click(screen.getByRole('button', { name: 'Save notification settings' }));

    await waitFor(() => {
      expect(needsResponsePill).not.toHaveClass('communication-page__status-card--response-hot');
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

  it('shows shared coordination loading without blocking the personal draft composer', async () => {
    vi.restoreAllMocks();
    let resolveCoordination: ((value: Response) => void) | null = null;
    const coordinationResponse = new Promise<Response>((resolve) => {
      resolveCoordination = resolve;
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input));

      if (url.pathname === '/clinician/dashboard/communication-overview') {
        return createJsonResponse({ ok: true, overview: communicationOverview });
      }

      if (url.pathname === '/clinician/patients/patient-1/coordination') {
        return coordinationResponse;
      }

      return createJsonResponse({ ok: false, error: 'NOT_FOUND' }, 404);
    });

    const user = userEvent.setup();
    renderCommunicationPage('/communication?patientId=patient-1');

    const replyField = await screen.findByRole('textbox', { name: 'Personal reply draft' });
    await user.type(replyField, 'Local draft stays usable while shared coordination loads.');

    const coordinationContext = await screen.findByTestId('communication-shared-coordination');
    expect(within(coordinationContext).getByText('Shared care-team coordination')).toBeInTheDocument();
    expect(within(coordinationContext).queryByLabelText('Add shared coordination note')).not.toBeInTheDocument();
    expect(replyField).toHaveValue('Local draft stays usable while shared coordination loads.');

    resolveCoordination?.(
      createJsonResponse({
        ok: true,
        coordination: createSharedCoordinationRecord('patient-1'),
      }),
    );

    expect(
      await within(coordinationContext).findByLabelText('Add shared coordination note'),
    ).toBeInTheDocument();
  });

  it('renders shared coordination with a read-only handoff snapshot and a Patient Detail CTA', async () => {
    installCommunicationFetchMock({
      coordinationByPatient: {
        'patient-1': createSharedCoordinationRecord('patient-1', {
          currentHandoff: {
            summary: 'Keep this thread aligned with the current plan review before the next reply.',
            nextStep: 'plan',
            followUpOwner: {
              kind: 'clinician',
              clinicianId: 'coordination-clinician-1',
              displayName: 'Dr Elena Hall',
            },
            updatedBy: {
              clinicianId: 'coordination-clinician-1',
              displayName: 'Dr Elena Hall',
            },
            updatedAt: '2026-03-09T11:45:00.000Z',
          },
        }),
      },
    });
    const user = userEvent.setup();

    renderCommunicationPage('/communication?patientId=patient-1');

    const coordinationContext = await screen.findByTestId('communication-shared-coordination');
    expect(coordinationContext).toHaveAccessibleName('Shared clinician coordination');
    expect(
      await within(coordinationContext).findByText(
        'Keep this thread aligned with the current plan review before the next reply.',
      ),
    ).toBeInTheDocument();
    expect(
      await within(coordinationContext).findByRole('button', {
        name: 'Open structured coordination in Patient Detail',
      }),
    ).toBeInTheDocument();
    expect(
      await within(coordinationContext).findByLabelText('Add shared coordination note'),
    ).toBeInTheDocument();
    expect(
      within(coordinationContext).getByRole('region', { name: 'Latest shared coordination activity' }),
    ).toBeInTheDocument();
    expect((await within(coordinationContext).findAllByText('Dr Elena Hall')).length).toBeGreaterThan(0);
    expect(
      within(coordinationContext).getByText(
        'Shared in Aura for the care team across clinician sessions and devices. It stays separate from personal reply drafts and the patient message timeline.',
      ),
    ).toBeInTheDocument();

    await user.click(
      within(coordinationContext).getByRole('button', {
        name: 'Open structured coordination in Patient Detail',
      }),
    );

    await waitFor(() => {
      expect(screen.getByText('Patient detail communications workspace')).toBeInTheDocument();
    });
  });

  it('renders a linked task as read-only shared context without mutating the local draft', async () => {
    installCommunicationFetchMock({
      coordinationByPatient: {
        'patient-1': createSharedCoordinationRecord('patient-1', {
          currentHandoff: {
            summary: 'Keep the real workflow object visible for the next clinician.',
            nextStep: 'tasks',
            followUpOwner: {
              kind: 'custom',
              label: 'Weekend review desk',
            },
            linkedTaskId: 'task-1',
            linkedTask: {
              id: 'task-1',
              title: 'Check medication adherence',
              type: 'adherence_review',
              priority: 'high',
              status: 'open',
              dueAt: '2026-03-09T18:00:00.000Z',
              assignedTo: 'clinician-7',
              source: {
                type: 'manual',
                label: 'Manual follow-up',
              },
              updatedAt: '2026-03-09T12:05:00.000Z',
            },
            updatedBy: {
              clinicianId: 'coordination-clinician-1',
              displayName: 'Dr Elena Hall',
            },
            updatedAt: '2026-03-09T11:45:00.000Z',
          },
        }),
      },
    });
    const user = userEvent.setup();

    renderCommunicationPage('/communication?patientId=patient-1');

    const replyField = await screen.findByRole('textbox', { name: 'Personal reply draft' });
    await user.type(replyField, 'Keep this local draft unchanged while viewing the linked task.');

    const coordinationContext = await screen.findByTestId('communication-shared-coordination');
    const linkedTaskRegion = within(coordinationContext).getByRole('region', {
      name: 'Linked follow-through task',
    });

    expect(within(linkedTaskRegion).getByText('Check medication adherence')).toBeInTheDocument();
    expect(within(linkedTaskRegion).getAllByText('Open').length).toBeGreaterThan(0);
    expect(within(linkedTaskRegion).getByText('High')).toBeInTheDocument();
    expect(within(linkedTaskRegion).getByText('clinician-7')).toBeInTheDocument();
    expect(within(linkedTaskRegion).getByText('Manual follow-up')).toBeInTheDocument();
    expect(
      within(linkedTaskRegion).getByText(
        'Existing follow-through task reference only. Shared coordination does not create or complete this task.',
      ),
    ).toBeInTheDocument();
    expect(within(linkedTaskRegion).queryByRole('button', { name: /Complete/i })).not.toBeInTheDocument();
    expect(replyField).toHaveValue('Keep this local draft unchanged while viewing the linked task.');

    const timeline = screen.getByRole('list', { name: 'Patient communication timeline' });
    expect(within(timeline).queryByText('Check medication adherence')).not.toBeInTheDocument();
  });

  it('appends a shared coordination note from Communication without changing the personal draft', async () => {
    installCommunicationFetchMock({
      coordinationByPatient: {
        'patient-1': createSharedCoordinationRecord('patient-1'),
      },
    });
    const user = userEvent.setup();

    renderCommunicationPage('/communication?patientId=patient-1');

    const replyField = await screen.findByRole('textbox', { name: 'Personal reply draft' });
    await user.type(replyField, 'Keep this local draft separate.');

    const coordinationContext = await screen.findByTestId('communication-shared-coordination');
    const noteField = (await within(coordinationContext).findByLabelText(
      'Add shared coordination note',
    )) as HTMLTextAreaElement;

    await user.type(noteField, 'Team-visible note from communication workspace.');
    await user.click(within(coordinationContext).getByRole('button', { name: 'Add shared note' }));

    expect(
      await within(coordinationContext).findByText(
        'Shared coordination note added for the care team.',
      ),
    ).toBeInTheDocument();
    expect(noteField).toHaveValue('');
    expect(replyField).toHaveValue('Keep this local draft separate.');

    const sharedNotes = within(coordinationContext).getByRole('region', {
      name: 'Recent shared coordination notes',
    });
    expect(
      within(sharedNotes).getByText('Team-visible note from communication workspace.'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('list', { name: 'Patient communication timeline' })).queryByText(
        'Team-visible note from communication workspace.',
      ),
    ).not.toBeInTheDocument();
  });

  it('shows the latest shared note preview when there is no current shared handoff', async () => {
    installCommunicationFetchMock({
      coordinationByPatient: {
        'patient-2': createSharedCoordinationRecord('patient-2', {
          currentHandoff: null,
          noteHistory: [
            {
              id: 'coord-note-2',
              text: 'Latest shared coordination note for the next review pass.',
              createdBy: {
                clinicianId: 'coordination-clinician-1',
                displayName: 'Dr Elena Hall',
              },
              createdAt: '2026-03-09T11:58:00.000Z',
            },
          ],
        }),
      },
    });

    renderCommunicationPage('/communication?patientId=patient-2');

    const coordinationContext = await screen.findByTestId('communication-shared-coordination');
    const snapshot = await within(coordinationContext).findByRole('region', {
      name: 'Current shared coordination snapshot',
    });
    const latestActivity = await within(coordinationContext).findByRole('region', {
      name: 'Latest shared coordination activity',
    });
    const recentNotes = await within(coordinationContext).findByRole('region', {
      name: 'Recent shared coordination notes',
    });
    expect(await within(snapshot).findByText('No current shared handoff saved.')).toBeInTheDocument();
    expect(
      within(snapshot).queryByText('Latest shared coordination note for the next review pass.'),
    ).not.toBeInTheDocument();
    expect(
      await within(latestActivity).findByText('Latest shared coordination note for the next review pass.'),
    ).toBeInTheDocument();
    expect(within(latestActivity).getAllByText('Shared coordination note added').length).toBeGreaterThan(0);
    expect(
      within(recentNotes).getByText('Latest shared coordination note for the next review pass.'),
    ).toBeInTheDocument();
    expect(within(coordinationContext).queryByText('Next step')).not.toBeInTheDocument();
    expect(within(coordinationContext).queryByText('Follow-up owner')).not.toBeInTheDocument();
    expect(within(coordinationContext).getByLabelText('Add shared coordination note')).toBeInTheDocument();
  });

  it('shows a neutral shared coordination empty state when no shared record exists', async () => {
    renderCommunicationPage('/communication?patientId=patient-1');

    const coordinationContext = await screen.findByTestId('communication-shared-coordination');
    expect(await within(coordinationContext).findByText('No current shared handoff saved.')).toBeInTheDocument();
    expect(
      within(coordinationContext).getByRole('region', { name: 'Linked follow-through task' }),
    ).toHaveTextContent('No follow-through task linked');
    expect(
      await within(coordinationContext).findByLabelText('Add shared coordination note'),
    ).toBeInTheDocument();
    expect(
      await within(coordinationContext).findByRole('button', {
        name: 'Open structured coordination in Patient Detail',
      }),
    ).toBeInTheDocument();
    expect(
      within(coordinationContext).getByRole('region', { name: 'Latest shared coordination activity' }),
    ).toHaveTextContent('No shared activity yet');
  });

  it('preserves the personal draft when adding a shared note fails', async () => {
    installCommunicationFetchMock({
      coordinationByPatient: {
        'patient-1': createSharedCoordinationRecord('patient-1'),
      },
      coordinationNoteStatus: 400,
    });
    const user = userEvent.setup();

    renderCommunicationPage('/communication?patientId=patient-1');

    const replyField = await screen.findByRole('textbox', { name: 'Personal reply draft' });
    await user.type(replyField, 'Local draft should survive shared-note failure.');

    const coordinationContext = await screen.findByTestId('communication-shared-coordination');
    const noteField = (await within(coordinationContext).findByLabelText(
      'Add shared coordination note',
    )) as HTMLTextAreaElement;
    await user.type(noteField, 'Shared note that should stay in place on failure.');
    await user.click(within(coordinationContext).getByRole('button', { name: 'Add shared note' }));

    expect(await within(coordinationContext).findByRole('alert')).toBeInTheDocument();
    expect(noteField).toHaveValue('Shared note that should stay in place on failure.');
    expect(replyField).toHaveValue('Local draft should survive shared-note failure.');
  });

  it('shows a truthful unavailable linked task state when the saved task reference cannot resolve', async () => {
    installCommunicationFetchMock({
      coordinationByPatient: {
        'patient-1': createSharedCoordinationRecord('patient-1', {
          currentHandoff: {
            summary: 'The handoff still points to an unavailable task.',
            nextStep: 'tasks',
            followUpOwner: { kind: 'unassigned' },
            linkedTaskId: 'task-missing',
            linkedTask: null,
            updatedBy: {
              clinicianId: 'coordination-clinician-1',
              displayName: 'Dr Elena Hall',
            },
            updatedAt: '2026-03-09T11:45:00.000Z',
          },
        }),
      },
    });

    renderCommunicationPage('/communication?patientId=patient-1');

    const coordinationContext = await screen.findByTestId('communication-shared-coordination');
    const linkedTaskRegion = await within(coordinationContext).findByRole('region', {
      name: 'Linked follow-through task',
    });

    expect(within(linkedTaskRegion).getAllByText('Linked task unavailable').length).toBeGreaterThan(0);
    expect(
      within(linkedTaskRegion).getByText(
        'This handoff still points to a task id, but Aura cannot resolve that task right now.',
      ),
    ).toBeInTheDocument();
  });

  it('retries cleanly when the shared coordination fetch fails and keeps the personal draft untouched', async () => {
    installCommunicationFetchMock({
      coordinationGetStatus: 400,
    });
    const user = userEvent.setup();

    renderCommunicationPage('/communication?patientId=patient-1');

    const replyField = await screen.findByRole('textbox', { name: 'Personal reply draft' });
    await user.type(replyField, 'Local draft should remain during coordination reload issues.');

    const coordinationContext = await screen.findByTestId('communication-shared-coordination');
    expect(
      await within(coordinationContext).findByText(
        'Personal reply drafts stay local to this browser while shared coordination reloads.',
      ),
    ).toBeInTheDocument();

    await user.click(within(coordinationContext).getByRole('button', { name: 'Retry' }));
    expect(within(coordinationContext).getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(replyField).toHaveValue('Local draft should remain during coordination reload issues.');
  });

  it('switches patients without carrying over the wrong shared coordination', async () => {
    installCommunicationFetchMock({
      coordinationByPatient: {
        'patient-1': createSharedCoordinationRecord('patient-1', {
          currentHandoff: {
            summary: 'Patient one shared handoff.',
            nextStep: 'plan',
            followUpOwner: { kind: 'custom', label: 'Patient one owner' },
            updatedBy: {
              clinicianId: 'coordination-clinician-1',
              displayName: 'Dr Elena Hall',
            },
            updatedAt: '2026-03-09T11:45:00.000Z',
            linkedTaskId: 'task-patient-1',
            linkedTask: {
              id: 'task-patient-1',
              title: 'Patient one linked task',
              type: 'follow_up',
              priority: 'high',
              status: 'open',
              assignedTo: 'clinician-1',
              updatedAt: '2026-03-09T11:45:00.000Z',
            },
          },
        }),
        'patient-2': createSharedCoordinationRecord('patient-2', {
          currentHandoff: {
            summary: 'Patient two shared handoff.',
            nextStep: 'communication',
            followUpOwner: { kind: 'custom', label: 'Patient two owner' },
            updatedBy: {
              clinicianId: 'coordination-clinician-2',
              displayName: 'Dr Morgan Shaw',
            },
            updatedAt: '2026-03-09T11:55:00.000Z',
            linkedTaskId: 'task-patient-2',
            linkedTask: {
              id: 'task-patient-2',
              title: 'Patient two linked task',
              type: 'communication',
              priority: 'medium',
              status: 'in_progress',
              assignedTo: 'clinician-2',
              updatedAt: '2026-03-09T11:55:00.000Z',
            },
          },
          noteHistory: [
            {
              id: 'coord-note-2',
              text: 'Patient two shared note.',
              createdBy: {
                clinicianId: 'coordination-clinician-2',
                displayName: 'Dr Morgan Shaw',
              },
              createdAt: '2026-03-09T11:58:00.000Z',
            },
          ],
        }),
      },
    });
    const user = userEvent.setup();

    renderCommunicationPage('/communication?patientId=patient-1');

    const coordinationContext = await screen.findByTestId('communication-shared-coordination');
    expect(await within(coordinationContext).findByText('Patient one shared handoff.')).toBeInTheDocument();
    expect(await within(coordinationContext).findByText('Patient one linked task')).toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: /Avery Chen/ }));

    expect(await within(coordinationContext).findByText('Patient two shared handoff.')).toBeInTheDocument();
    expect(await within(coordinationContext).findByText('Patient two linked task')).toBeInTheDocument();
    expect(within(coordinationContext).queryByText('Patient one shared handoff.')).not.toBeInTheDocument();
    expect(within(coordinationContext).queryByText('Patient one linked task')).not.toBeInTheDocument();
  });

  it('does not let browser-local handoff storage drive inbox shared context', async () => {
    savePatientCurrentHandoff('patient-1', {
      summary: 'Legacy local handoff should not appear as shared inbox context.',
      nextAction: 'alerts',
      followUpOwner: { kind: 'custom', label: 'Weekend coverage desk' },
    });
    addPatientHandoffNote('patient-1', 'Legacy local note should stay out of shared inbox context.');

    renderCommunicationPage('/communication?patientId=patient-1');

    const coordinationContext = await screen.findByTestId('communication-shared-coordination');
    expect(await within(coordinationContext).findByText('No current shared handoff saved.')).toBeInTheDocument();
    expect(
      within(coordinationContext).queryByText('Legacy local handoff should not appear as shared inbox context.'),
    ).not.toBeInTheDocument();
    expect(
      within(coordinationContext).queryByText('Legacy local note should stay out of shared inbox context.'),
    ).not.toBeInTheDocument();
  });

  it('keeps the message timeline truthful when shared coordination exists', async () => {
    installCommunicationFetchMock({
      coordinationByPatient: {
        'patient-1': createSharedCoordinationRecord('patient-1', {
          currentHandoff: {
            summary: 'Shared coordination belongs in the support block, not the communication timeline.',
            nextStep: 'alerts',
            followUpOwner: { kind: 'custom', label: 'Weekend coverage desk' },
            updatedBy: {
              clinicianId: 'coordination-clinician-1',
              displayName: 'Dr Elena Hall',
            },
            updatedAt: '2026-03-09T11:45:00.000Z',
            linkedTaskId: 'task-support-1',
            linkedTask: {
              id: 'task-support-1',
              title: 'Shared linked task should stay out of the timeline.',
              type: 'follow_up',
              priority: 'medium',
              status: 'open',
              assignedTo: 'clinician-1',
              updatedAt: '2026-03-09T11:45:00.000Z',
            },
          },
          noteHistory: [
            {
              id: 'coord-note-3',
              text: 'This shared note should not appear as a timeline message.',
              createdBy: {
                clinicianId: 'coordination-clinician-1',
                displayName: 'Dr Elena Hall',
              },
              createdAt: '2026-03-09T11:50:00.000Z',
            },
          ],
        }),
      },
    });

    renderCommunicationPage('/communication?patientId=patient-1');

    const coordinationContext = await screen.findByTestId('communication-shared-coordination');
    expect(coordinationContext).toBeInTheDocument();
    expect(
      (
        await within(coordinationContext).findAllByText(
          'This shared note should not appear as a timeline message.',
        )
      ).length,
    ).toBeGreaterThan(0);

    const timeline = screen.getByRole('list', { name: 'Patient communication timeline' });
    expect(within(timeline).getByText('Pain is much worse after exercise today.')).toBeInTheDocument();
    expect(
      within(timeline).queryByText('Shared coordination belongs in the support block, not the communication timeline.'),
    ).not.toBeInTheDocument();
    expect(within(timeline).queryByText('This shared note should not appear as a timeline message.')).not.toBeInTheDocument();
    expect(
      within(timeline).queryByText('Shared linked task should stay out of the timeline.'),
    ).not.toBeInTheDocument();
  });
});
