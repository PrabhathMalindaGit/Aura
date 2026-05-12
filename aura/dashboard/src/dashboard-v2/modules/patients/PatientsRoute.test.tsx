/* @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createJsonResponse,
  installMatchMediaMock,
  installResizeObserverMock,
} from '../../../test/mocks';
import type { PatientSummary } from '../../../types/models';
import { clearClinicianProfileForTests } from '../../../services/clinicianProfile';
import { PatientsRouteFacade } from '../../config/routeFacades';
import {
  getDefaultDashboardV2Gates,
  resetDashboardV2GatesForTests,
  writeDashboardV2Gates,
} from '../../config/migrationGates';

const PATIENTS: PatientSummary[] = [
  {
    id: 'patient-42',
    displayName: 'Taylor Moss',
    status: 'active',
    lastCheckinAt: '2026-04-18T09:00:00.000Z',
    openAlertCount: 3,
    lastPain: 7.2,
  },
  {
    id: 'patient-77',
    displayName: 'Jordan Lee',
    status: 'active',
    lastCheckinAt: '2026-04-17T09:00:00.000Z',
    openAlertCount: 0,
    lastPain: 2.1,
  },
  {
    id: 'patient-88',
    displayName: 'Casey Brown',
    status: 'on_hold',
    lastCheckinAt: '2026-04-18T13:30:00.000Z',
    openAlertCount: 1,
    lastPain: 5.4,
  },
];

const LARGE_PATIENTS: PatientSummary[] = [
  ...PATIENTS,
  {
    id: 'patient-89',
    displayName: 'Devon Reed',
    status: 'active',
    lastCheckinAt: '2026-04-16T09:00:00.000Z',
    openAlertCount: 0,
    lastPain: 4.1,
  },
  {
    id: 'patient-90',
    displayName: 'Riley Chen',
    status: 'active',
    lastCheckinAt: '2026-04-15T09:00:00.000Z',
    openAlertCount: 0,
    lastPain: 3.7,
  },
  {
    id: 'patient-91',
    displayName: 'Avery Patel',
    status: 'active',
    lastCheckinAt: '2026-04-14T09:00:00.000Z',
    openAlertCount: 0,
    lastPain: 3.3,
  },
  {
    id: 'patient-92',
    displayName: 'Morgan Stone',
    status: 'active',
    lastCheckinAt: '2026-04-13T09:00:00.000Z',
    openAlertCount: 0,
    lastPain: 2.9,
  },
  {
    id: 'patient-93',
    displayName: 'Quinn Rivera',
    status: 'active',
    lastCheckinAt: '2026-04-12T09:00:00.000Z',
    openAlertCount: 0,
    lastPain: 2.4,
  },
  {
    id: 'patient-94',
    displayName: 'Samira Holt',
    status: 'active',
    lastCheckinAt: '2026-04-11T09:00:00.000Z',
    openAlertCount: 0,
    lastPain: 2.2,
  },
  {
    id: 'patient-95',
    displayName: 'Noah Park',
    status: 'active',
    lastCheckinAt: '2026-04-10T09:00:00.000Z',
    openAlertCount: 0,
    lastPain: 2,
  },
  {
    id: 'patient-96',
    displayName: 'Iris Lin',
    status: 'active',
    lastCheckinAt: '2026-04-09T09:00:00.000Z',
    openAlertCount: 0,
    lastPain: 1.9,
  },
  {
    id: 'patient-97',
    displayName: 'Mina Brooks',
    status: 'active',
    lastCheckinAt: '2026-04-08T09:00:00.000Z',
    openAlertCount: 0,
    lastPain: 1.8,
  },
  {
    id: 'patient-98',
    displayName: 'Owen Blake',
    status: 'active',
    lastCheckinAt: '2026-04-07T09:00:00.000Z',
    openAlertCount: 0,
    lastPain: 1.7,
  },
];

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function installViewportMock(width: number): void {
  installMatchMediaMock((query) => {
    const maxMatch = query.match(/max-width:\s*(\d+)px/);
    if (maxMatch) {
      return width <= Number(maxMatch[1]);
    }

    const minMatch = query.match(/min-width:\s*(\d+)px/);
    if (minMatch) {
      return width >= Number(minMatch[1]);
    }

    return false;
  });
}

function installPatientsFetchMock(patients: PatientSummary[] = PATIENTS): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(String(input), 'http://localhost');

    if (url.pathname === '/clinician/patients') {
      return createJsonResponse({ ok: true, patients });
    }

    return createJsonResponse({ ok: true });
  });
}

function CompareEcho(): JSX.Element {
  const location = useLocation();
  return <div data-testid="compare-route">{`${location.pathname}${location.search}`}</div>;
}

function LocationEcho(): JSX.Element {
  const location = useLocation();
  return (
    <pre data-testid="route-location">
      {JSON.stringify({ pathname: location.pathname, state: location.state })}
    </pre>
  );
}

function renderPatientsRoute(initialEntry: string = '/patients'): ReturnType<typeof render> {
  const queryClient = createQueryClient();

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/patients" element={<PatientsRouteFacade />} />
          <Route path="/patients/compare" element={<CompareEcho />} />
          <Route path="/patients/:patientId" element={<LocationEcho />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function setPatientsGate(enabled: boolean): void {
  const defaults = getDefaultDashboardV2Gates();

  writeDashboardV2Gates({
    ...defaults,
    routes: {
      ...defaults.routes,
      patients: enabled,
    },
  });
}

describe('PatientsRouteFacade', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    clearClinicianProfileForTests();
    resetDashboardV2GatesForTests();
    installViewportMock(1440);
    installResizeObserverMock();
    window.localStorage.setItem('aura_access_token', 'TEST_TOKEN');
    installPatientsFetchMock();
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    window.sessionStorage.clear();
    clearClinicianProfileForTests();
    resetDashboardV2GatesForTests();
    vi.restoreAllMocks();
  });

  it('keeps the legacy patients roster available when the route is explicitly rolled back', async () => {
    setPatientsGate(false);

    renderPatientsRoute();

    expect(
      await screen.findByText('Find, scan, and open the right patient from the current care roster.'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('v2-patients-route')).not.toBeInTheDocument();
  });

  it('renders the v2 patients route by default', async () => {
    renderPatientsRoute();

    expect(await screen.findByTestId('v2-patients-route')).toBeVisible();
    expect(screen.getByTestId('v2-patients-status-bar')).toHaveTextContent('Patients');
    expect(screen.getByRole('heading', { name: 'Patients', level: 2 })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Patients', level: 1 })).not.toBeInTheDocument();
    expect(screen.getByText('Needs closer review')).toBeInTheDocument();
    expect(screen.queryByText('Closer review')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Search patients')).toBeInTheDocument();
    expect(screen.getByText('Taylor Moss')).toBeInTheDocument();
  });

  it('opens a patient with preserved patients-roster entry context and return target', async () => {
    const user = userEvent.setup();

    renderPatientsRoute('/patients?search=Taylor');

    await user.click(await screen.findByTestId('v2-patients-open-patient-patient-42'));

    await waitFor(() => {
      expect(screen.getByTestId('route-location')).toHaveTextContent('"pathname":"/patients/patient-42"');
    });

    expect(screen.getByTestId('route-location')).toHaveTextContent('"source":"patients"');
    expect(screen.getByTestId('route-location')).toHaveTextContent('"subtype":"roster"');
    expect(screen.getByTestId('route-location')).toHaveTextContent('"focus":"roster"');
    expect(screen.getByTestId('route-location')).toHaveTextContent('"returnTo":"/patients?search=Taylor"');
  });

  it('keeps compare on its explicit route without blocking the v2 roster', async () => {
    const user = userEvent.setup();

    renderPatientsRoute();

    await user.click(await screen.findByRole('checkbox', { name: 'Select Taylor Moss for compare' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Jordan Lee for compare' }));
    await user.click(screen.getByRole('button', { name: 'Compare selected (2)' }));

    await waitFor(() => {
      expect(screen.getByTestId('compare-route')).toHaveTextContent(
        '/patients/compare?patient=patient-42&patient=patient-77',
      );
    });
  });

  it('shows compare state inline in roster results instead of a standalone compare tray card', async () => {
    const user = userEvent.setup();

    renderPatientsRoute();

    await user.click(await screen.findByRole('checkbox', { name: 'Select Taylor Moss for compare' }));

    const resultsSurface = screen.getByTestId('v2-patients-results');

    expect(within(resultsSurface).getByText('1 selected')).toBeInTheDocument();
    expect(within(resultsSurface).getByRole('button', { name: 'Compare selected (1)' })).toBeInTheDocument();
    expect(within(resultsSurface).getByRole('button', { name: 'Clear' })).toBeInTheDocument();
  });

  it('keeps the table dominant through typical narrow laptop widths', async () => {
    installViewportMock(960);

    renderPatientsRoute();

    expect(await screen.findByRole('table', { name: 'Patients roster results' })).toBeInTheDocument();
    expect(screen.queryByTestId('v2-patients-card-patient-42')).not.toBeInTheDocument();
  });

  it('paginates larger roster views and reports the rendered range', async () => {
    const user = userEvent.setup();
    installPatientsFetchMock(LARGE_PATIENTS);

    renderPatientsRoute();

    expect(await screen.findByText('Showing 1-10 of 13 patients')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    expect(screen.getByText('Noah Park')).toBeInTheDocument();
    expect(screen.queryByText('Iris Lin')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next page' }));

    expect(await screen.findByText('Showing 11-13 of 13 patients')).toBeInTheDocument();
    expect(screen.getByText('Iris Lin')).toBeInTheDocument();
    expect(screen.queryByText('Taylor Moss')).not.toBeInTheDocument();
  });

  it('resets pagination to the first page when search narrows the roster', async () => {
    const user = userEvent.setup();
    installPatientsFetchMock(LARGE_PATIENTS);

    renderPatientsRoute();

    await screen.findByText('Showing 1-10 of 13 patients');
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    expect(await screen.findByText('Showing 11-13 of 13 patients')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Search patients'), 'Taylor');

    expect(await screen.findByText('Showing 1-1 of 1 patient')).toBeInTheDocument();
    expect(screen.getByText('Taylor Moss')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();
  });

  it('keeps compare selection clear when selected patients are not on the current page', async () => {
    const user = userEvent.setup();
    installPatientsFetchMock(LARGE_PATIENTS);

    renderPatientsRoute();

    await user.click(await screen.findByRole('checkbox', { name: 'Select Taylor Moss for compare' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Jordan Lee for compare' }));
    await user.click(screen.getByRole('button', { name: 'Next page' }));

    expect(await screen.findByText('Showing 11-13 of 13 patients')).toBeInTheDocument();
    expect(within(screen.getByRole('table', { name: 'Patients roster results' })).queryByText('Taylor Moss')).not.toBeInTheDocument();

    const resultsSurface = screen.getByTestId('v2-patients-results');
    expect(within(resultsSurface).getByText('2 selected')).toBeInTheDocument();
    expect(within(resultsSurface).getByText('Taylor Moss')).toBeInTheDocument();
    expect(within(resultsSurface).getByText('Jordan Lee')).toBeInTheDocument();
    expect(within(resultsSurface).getByRole('button', { name: 'Compare selected (2)' })).toBeEnabled();
  });
});
