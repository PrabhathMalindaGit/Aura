/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PatientExercisePlanPage } from './PatientExercisePlanPage';
import { createJsonResponse } from '../test/mocks';

function renderPage(): void {
  render(
    <MemoryRouter initialEntries={['/patients/p1/plan']}>
      <Routes>
        <Route path="/patients/:patientId/plan" element={<PatientExercisePlanPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PatientExercisePlanPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders a structured plan editor with revision history', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = new URL(String(input), 'http://localhost');

      if (
        url.pathname === '/clinician/patients/p1/exercise-plan' &&
        (init?.method === 'GET' || !init?.method)
      ) {
        return createJsonResponse({
          ok: true,
          patientId: 'p1',
          plan: {
            title: 'Strength Plan',
            timezone: 'Asia/Colombo',
            daysOfWeek: [1, 3, 5],
            version: 3,
            updatedAt: '2026-03-09T10:00:00.000Z',
            updatedBy: {
              clinicianId: 'clinician-1',
              name: 'Clinician One',
            },
            items: [
              {
                key: 'sit-stand',
                name: 'Sit to stand',
                instructions: 'Stand up and sit down with control.',
                order: 1,
              },
            ],
          },
        });
      }

      if (url.pathname === '/clinician/patients/p1/exercise-plan/history') {
        return createJsonResponse({
          ok: true,
          patientId: 'p1',
          items: [
            {
              id: 'rev-3',
              patientId: 'p1',
              version: 3,
              savedAt: '2026-03-09T10:00:00.000Z',
              savedBy: {
                clinicianId: 'clinician-1',
                name: 'Clinician One',
              },
              snapshot: {
                title: 'Strength Plan',
                timezone: 'Asia/Colombo',
                daysOfWeek: [1, 3, 5],
                version: 3,
                updatedAt: '2026-03-09T10:00:00.000Z',
                items: [
                  {
                    key: 'sit-stand',
                    name: 'Sit to stand',
                    instructions: 'Stand up and sit down with control.',
                    order: 1,
                  },
                ],
              },
            },
          ],
        });
      }

      return createJsonResponse({ ok: false, error: 'NOT_FOUND' }, 404);
    });

    renderPage();

    expect(await screen.findByRole('heading', { name: 'Exercise Plan' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Strength Plan')).toBeInTheDocument();
    expect(screen.getByText(/Version 3 · 1 exercises/i)).toBeInTheDocument();
    expect(screen.getByText(/Last saved by Clinician One/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Revision history' })).toBeInTheDocument();
    expect(screen.getByText(/Exercise 1/i)).toBeInTheDocument();
  });

  it('sends expectedVersion when saving the structured editor', async () => {
    const putBodies: unknown[] = [];

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = new URL(String(input), 'http://localhost');

      if (
        url.pathname === '/clinician/patients/p1/exercise-plan' &&
        (init?.method === 'GET' || !init?.method)
      ) {
        return createJsonResponse({
          ok: true,
          patientId: 'p1',
          plan: {
            title: 'Strength Plan',
            timezone: 'Asia/Colombo',
            daysOfWeek: [1, 3, 5],
            version: 3,
            updatedAt: '2026-03-09T10:00:00.000Z',
            items: [
              {
                key: 'sit-stand',
                name: 'Sit to stand',
                instructions: 'Stand up and sit down with control.',
                order: 1,
              },
            ],
          },
        });
      }

      if (url.pathname === '/clinician/patients/p1/exercise-plan/history') {
        return createJsonResponse({
          ok: true,
          patientId: 'p1',
          items: [],
        });
      }

      if (
        url.pathname === '/clinician/patients/p1/exercise-plan' &&
        init?.method === 'PUT'
      ) {
        putBodies.push(JSON.parse(String(init.body)));
        return createJsonResponse({
          ok: true,
          patientId: 'p1',
          plan: {
            title: 'Updated Strength Plan',
            timezone: 'Asia/Colombo',
            daysOfWeek: [1, 3, 5],
            version: 4,
            updatedAt: '2026-03-09T11:00:00.000Z',
            items: [
              {
                key: 'sit-stand',
                name: 'Sit to stand',
                instructions: 'Updated instructions',
                order: 1,
              },
            ],
          },
        });
      }

      return createJsonResponse({ ok: false, error: 'NOT_FOUND' }, 404);
    });

    renderPage();

    const user = userEvent.setup();
    const titleInput = await screen.findByDisplayValue('Strength Plan');
    await user.clear(titleInput);
    await user.type(titleInput, 'Updated Strength Plan');

    const instructions = screen.getByDisplayValue('Stand up and sit down with control.');
    fireEvent.change(instructions, { target: { value: 'Updated instructions' } });

    await user.click(screen.getByRole('button', { name: 'Save plan' }));

    await waitFor(() => {
      expect(putBodies).toHaveLength(1);
    });

    expect(putBodies[0]).toMatchObject({
      title: 'Updated Strength Plan',
      expectedVersion: 3,
    });
  });
});
