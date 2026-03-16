/* @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect, useRef, useState } from 'react';
import type { ComponentProps, RefObject } from 'react';
import type { AlertItem } from '../../types/models';
import { AlertDetailDrawer } from './AlertDetailDrawer';

const baseAlert: AlertItem = {
  _id: 'alt-001',
  patientId: 'patient-42',
  risk: 'high',
  reason: 'Pain increase and missed medication',
  source: { type: 'checkin', sourceId: 'checkin-abc' },
  status: 'open',
  createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  updatedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
};

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

function installAlertContextFallbackFetch(alert: AlertItem = baseAlert): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);

    if (url.includes(`/clinician/alerts/${alert._id}/context`)) {
      return createJsonResponse({ ok: false }, 404);
    }

    if (url.includes('/clinician/alerts?status=open')) {
      return createJsonResponse({ ok: true, alerts: [alert] });
    }

    if (url.includes('/clinician/alerts?status=acknowledged') || url.includes('/clinician/alerts?status=resolved')) {
      return createJsonResponse({ ok: true, alerts: [] });
    }

    return createJsonResponse({ ok: true, alerts: [] });
  });
}

function renderDrawer(props?: Partial<ComponentProps<typeof AlertDetailDrawer>>): void {
  const queryClient = createQueryClient();

  render(
    <QueryClientProvider client={queryClient}>
      <AlertDetailDrawer
        open
        alert={baseAlert}
        mutationPending={false}
        assignmentPending={false}
        overridePending={false}
        clinicianId="clinician-1"
        seen={false}
        onOpenPatient={vi.fn()}
        onClose={vi.fn()}
        onAssignToMe={vi.fn()}
        onTakeOver={vi.fn()}
        onUnassign={vi.fn()}
        onSaveRiskOverride={vi.fn()}
        onClearRiskOverride={vi.fn()}
        onAcknowledge={vi.fn()}
        onResolve={vi.fn()}
        {...props}
      />
    </QueryClientProvider>,
  );
}

function installMatchMediaMock(resolveMatches: (query: string) => boolean = () => false): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: resolveMatches(query),
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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  installMatchMediaMock();
  installAlertContextFallbackFetch();
});

describe('AlertDetailDrawer accessibility and actions', () => {
  it('focus trap keeps tab navigation inside drawer', async () => {
    const user = userEvent.setup();
    renderDrawer();

    const dialog = await screen.findByRole('dialog', { name: 'Alert' });

    for (let index = 0; index < 12; index += 1) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });

  it('escape closes drawer and returns focus to trigger', async () => {
    function Harness(): JSX.Element {
      const [open, setOpen] = useState(true);
      const triggerRef = useRef<HTMLButtonElement | null>(null);

      useEffect(() => {
        triggerRef.current?.focus();
      }, []);

      return (
        <>
          <button ref={triggerRef} type="button">
            Trigger row
          </button>
          <AlertDetailDrawer
            open={open}
            alert={baseAlert}
            mutationPending={false}
            assignmentPending={false}
            overridePending={false}
            clinicianId="clinician-1"
            seen={false}
            returnFocusRef={triggerRef as RefObject<HTMLElement | null>}
            onOpenPatient={vi.fn()}
            onClose={() => setOpen(false)}
            onAssignToMe={vi.fn()}
            onTakeOver={vi.fn()}
            onUnassign={vi.fn()}
            onSaveRiskOverride={vi.fn()}
            onClearRiskOverride={vi.fn()}
            onAcknowledge={vi.fn()}
            onResolve={vi.fn()}
          />
        </>
      );
    }

    const queryClient = createQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <Harness />
      </QueryClientProvider>,
    );

    await screen.findByRole('dialog', { name: 'Alert' });
    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Alert' })).not.toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: 'Trigger row' })).toHaveFocus();
  });

  it('override form requires reason when final risk differs from auto', async () => {
    const user = userEvent.setup();
    renderDrawer();

    await screen.findByRole('dialog', { name: 'Alert' });

    const finalRiskSelect = screen.getByLabelText('Final risk');

    await user.selectOptions(finalRiskSelect, 'low');
    const saveButton = screen.getByRole('button', { name: 'Save override' });
    expect(saveButton).toBeDisabled();

    await user.type(screen.getByLabelText('Override reason'), 'Clinical review completed.');
    expect(saveButton).toBeEnabled();
  }, 10_000);

  it('uses full-screen drawer mode on phone widths', async () => {
    installMatchMediaMock((query) => query.includes('(max-width: 899px)'));
    renderDrawer();

    const dialog = await screen.findByRole('dialog', { name: 'Alert' });
    expect(dialog).toHaveClass('drawer--mobile-fullscreen');
  });
});
