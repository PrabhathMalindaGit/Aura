/* @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PatientComparePage } from './PatientComparePage';

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

function renderPatientComparePage(initialEntry: string): void {
  const queryClient = createQueryClient();

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/patients/compare" element={<PatientComparePage />} />
          <Route path="/patients" element={<div>Patients workspace</div>} />
          <Route path="/patients/:patientId" element={<PatientDetailWorkspace />} />
          <Route path="/alerts" element={<AlertsWorkspace />} />
          <Route path="/communication" element={<CommunicationWorkspace />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function PatientDetailWorkspace(): JSX.Element {
  const location = useLocation();

  return <div>{`Patient detail workspace${location.pathname}`}</div>;
}

function AlertsWorkspace(): JSX.Element {
  const location = useLocation();

  return <div>{`Alerts workspace${location.search}`}</div>;
}

function CommunicationWorkspace(): JSX.Element {
  const location = useLocation();

  return <div>{`Communication workspace${location.search}`}</div>;
}

function installCompareFetchMock(): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(String(input), 'https://aura.local');

    if (url.pathname === '/clinician/patients') {
      return createJsonResponse({
        ok: true,
        patients: [
          {
            id: 'a',
            displayName: 'Taylor Moss',
            status: 'active',
            lastCheckinAt: '2026-03-20T08:30:00.000Z',
            openAlertCount: 2,
            lastPain: 6.4,
          },
          {
            id: 'b',
            displayName: 'Jordan Lee',
            status: 'active',
            lastCheckinAt: '2026-03-19T10:00:00.000Z',
            openAlertCount: 0,
            lastPain: 3.1,
          },
          {
            id: 'c',
            displayName: 'Casey Brown',
            status: 'on_hold',
            lastCheckinAt: '2026-03-18T09:15:00.000Z',
            openAlertCount: 1,
            lastPain: 5.2,
          },
          {
            id: 'd',
            displayName: 'Morgan Yu',
            status: 'active',
            lastCheckinAt: '2026-03-16T11:00:00.000Z',
            openAlertCount: 0,
            lastPain: 4.6,
          },
        ],
      });
    }

    if (url.pathname === '/clinician/worklist') {
      return createJsonResponse({
        ok: true,
        total: 4,
        items: [
          {
            patientId: 'a',
            patientName: 'Taylor Moss',
            patientStatus: 'active',
            lastCheckinAt: '2026-03-20T08:30:00.000Z',
            openAlertsCount: 2,
            latestRiskLevel: 'high',
            lastPainScore: 6.8,
            adherenceSummary: {
              exercisesPct: 0.42,
              medicationTaken: true,
            },
            missedCheckins: {
              flag: true,
              count: 2,
            },
            communicationNeedsResponse: true,
            activeTaskCount: 1,
            topIssue: 'Open alert review',
            reviewReason: 'Pain escalation and recent response follow-up need review.',
            updatedAt: '2026-03-20T12:00:00.000Z',
            priorityScore: 92,
          },
          {
            patientId: 'b',
            patientName: 'Jordan Lee',
            patientStatus: 'active',
            lastCheckinAt: '2026-03-19T10:00:00.000Z',
            openAlertsCount: 0,
            latestRiskLevel: 'low',
            lastPainScore: 3.1,
            adherenceSummary: {
              exercisesPct: 0.78,
              medicationTaken: true,
            },
            missedCheckins: {
              flag: false,
              count: 0,
            },
            communicationNeedsResponse: false,
            activeTaskCount: 0,
            topIssue: 'Steady recent activity',
            reviewReason: 'Recent check-ins remain steady.',
            updatedAt: '2026-03-19T11:30:00.000Z',
            priorityScore: 30,
          },
          {
            patientId: 'c',
            patientName: 'Casey Brown',
            patientStatus: 'on_hold',
            lastCheckinAt: '2026-03-18T09:15:00.000Z',
            openAlertsCount: 1,
            latestRiskLevel: 'medium',
            lastPainScore: 5.2,
            adherenceSummary: {
              exercisesPct: 0.55,
              medicationTaken: false,
            },
            missedCheckins: {
              flag: false,
              count: 0,
            },
            communicationNeedsResponse: false,
            activeTaskCount: 0,
            topIssue: 'On-hold monitoring',
            reviewReason: 'One open alert remains in the current view.',
            updatedAt: '2026-03-18T12:00:00.000Z',
            priorityScore: 48,
          },
        ],
      });
    }

    if (url.pathname === '/clinician/dashboard/communication-overview') {
      return createJsonResponse({
        ok: true,
        overview: {
          counts: {
            needsResponseCount: 1,
            flaggedBySafetyCount: 1,
            followUpRequestedCount: 2,
          },
          items: [
            {
              id: 'comm-1',
              patientId: 'a',
              patientName: 'Taylor Moss',
              messageId: 'msg-1',
              needsResponse: true,
              flaggedBySafety: false,
              followUpRequested: true,
              messageCreatedAt: '2026-03-20T12:15:00.000Z',
              messagePreview: 'Pain is still elevated after the last exercise block.',
            },
            {
              id: 'comm-2',
              patientId: 'b',
              patientName: 'Jordan Lee',
              messageId: 'msg-2',
              needsResponse: false,
              flaggedBySafety: false,
              followUpRequested: false,
              messageCreatedAt: '2026-03-19T09:45:00.000Z',
              messagePreview: 'Thanks for the last plan update.',
            },
          ],
        },
      });
    }

    const trendMatch = url.pathname.match(/^\/clinician\/patients\/([^/]+)\/trends$/);
    if (trendMatch) {
      const patientId = decodeURIComponent(trendMatch[1]);

      if (patientId === 'a') {
        return createJsonResponse({
          ok: true,
          trends: [
            { date: '2026-03-14', pain: 7, adherence: { exercises: 0.4, medication: true } },
            { date: '2026-03-17', pain: 6, adherence: { exercises: 0.5, medication: true } },
            { date: '2026-03-20', pain: 8, adherence: { exercises: 0.35, medication: true } },
          ],
        });
      }

      if (patientId === 'b') {
        return createJsonResponse({
          ok: true,
          trends: [],
        });
      }

      if (patientId === 'c') {
        return createJsonResponse({
          ok: true,
          trends: [
            { date: '2026-03-18', pain: 5, adherence: { exercises: 0.55, medication: false } },
          ],
        });
      }

      return createJsonResponse({
        ok: true,
        trends: [],
      });
    }

    return createJsonResponse({ ok: false }, 404);
  });
}

describe('PatientComparePage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    installMatchMediaMock();
    window.localStorage.clear();
    window.sessionStorage.clear();
    installCompareFetchMock();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the 4 grounded compare domains without analytics or handoff content', async () => {
    renderPatientComparePage('/patients/compare?patient=a&patient=b');

    expect(await screen.findByRole('heading', { name: 'Compare patients' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Alerts' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Pain / recent trend' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Adherence / recent activity' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Communication' })).toBeInTheDocument();
    expect(screen.queryByText(/handoff/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/appointment/i)).not.toBeInTheDocument();
    expect(screen.getAllByText('Recent pain snapshot').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Needs response').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Recent communication activity').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Follow-up signal').length).toBeGreaterThan(0);
    expect(screen.queryByText(/message load|conversation volume/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/improving|worsening|stable/i)).not.toBeInTheDocument();
  });

  it('preserves first-seen order after de-duplication and keeps the first 3 valid patients', async () => {
    renderPatientComparePage('/patients/compare?patient=b&patient=a&patient=b&patient=c&patient=d');

    await screen.findByTestId('patient-compare-chip-b');

    const chipButtons = [
      screen.getByTestId('patient-compare-chip-b'),
      screen.getByTestId('patient-compare-chip-a'),
      screen.getByTestId('patient-compare-chip-c'),
    ];

    expect(chipButtons.map((button) => button.textContent?.replace('×', '').trim())).toEqual([
      'Jordan Lee',
      'Taylor Moss',
      'Casey Brown',
    ]);
    expect(
      screen.getByText('Compare mode is showing the first 3 current patients from this request.'),
    ).toBeInTheDocument();
  });

  it('shows an invalid compare state when fewer than 2 valid current patients remain', async () => {
    const user = userEvent.setup();
    renderPatientComparePage('/patients/compare?patient=missing&patient=a');

    expect(await screen.findByText('Compare needs 2–3 current patients')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Return to Patients' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Return to Patients' }));

    await waitFor(() => {
      expect(screen.getByText('Patients workspace')).toBeInTheDocument();
    });
  });

  it('shows conditional Alerts and Communication actions only when the current signal justifies them', async () => {
    renderPatientComparePage('/patients/compare?patient=a&patient=b&patient=c');

    const alertsForA = await screen.findByTestId('patient-compare-alerts-a');
    const alertsForB = screen.getByTestId('patient-compare-alerts-b');
    const communicationForA = screen.getByTestId('patient-compare-communication-a');
    const communicationForC = screen.getByTestId('patient-compare-communication-c');

    expect(within(alertsForA).getByRole('button', { name: 'Open alerts' })).toBeInTheDocument();
    expect(within(alertsForB).queryByRole('button', { name: 'Open alerts' })).not.toBeInTheDocument();
    expect(
      within(communicationForA).getByRole('button', { name: 'Open communication' }),
    ).toBeInTheDocument();
    expect(
      within(communicationForC).queryByRole('button', { name: 'Open communication' }),
    ).not.toBeInTheDocument();
  });

  it('can open patient detail from the compare page and keeps missing trend data honest', async () => {
    const user = userEvent.setup();
    renderPatientComparePage('/patients/compare?patient=a&patient=b');

    const summaryCardB = await screen.findByTestId('patient-compare-summary-b');
    expect(within(summaryCardB).getByText('Jordan Lee')).toBeInTheDocument();
    expect(within(screen.getByTestId('patient-compare-pain-b')).getByText('—')).toBeInTheDocument();

    await user.click(within(summaryCardB).getByRole('button', { name: 'Open review' }));

    await waitFor(() => {
      expect(screen.getByText('Patient detail workspace/patients/b')).toBeInTheDocument();
    });
  });
});
