import { expect, test } from '@playwright/test';
import type { DashboardCommunicationOverview } from '../../src/types/models';
import { installMockApi } from './helpers/mockApi';

const PATIENT_WORKSPACE_COMMUNICATION_OVERVIEW: DashboardCommunicationOverview = {
  counts: {
    needsResponseCount: 1,
    flaggedBySafetyCount: 0,
    followUpRequestedCount: 1,
  },
  items: [
    {
      id: 'communication-1',
      patientId: 'p1',
      patientName: 'Patient P1',
      messageId: 'message-1',
      needsResponse: true,
      flaggedBySafety: false,
      followUpRequested: true,
      linkedTaskId: 'task-1',
      messageCreatedAt: '2026-04-17T09:00:00.000Z',
      messagePreview: 'Pain is much worse after exercise today.',
      patientRiskLevel: 'high',
      openAlertCount: 1,
      lastCheckinAt: '2026-04-17T08:30:00.000Z',
      lastPainScore: 8,
      responseState: 'delayed',
      responseDueAt: '2026-04-17T09:30:00.000Z',
      responseDelayed: true,
      responseDelayHours: 8,
      reviewedAfterLatestInbound: false,
    },
  ],
};

test('patient workspace v2 preserves patient context, local quick reply, and shared coordination separation by default', async ({ page }) => {
  const runtimeIssues: string[] = [];

  page.on('pageerror', (error) => {
    runtimeIssues.push(`pageerror: ${error.stack ?? error.message}`);
  });

  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('Failed to load resource')) {
      runtimeIssues.push(`console:${message.type()}: ${message.text()}`);
    }
  });

  const tracker = await installMockApi(page, {
    communicationOverview: PATIENT_WORKSPACE_COMMUNICATION_OVERVIEW,
  });

  await page.addInitScript(() => {
    if (window.location.pathname === '/patients/p1') {
      const currentState =
        window.history.state && typeof window.history.state === 'object' ? window.history.state : {};

      window.history.replaceState(
        {
          ...currentState,
          usr: {
            patientEntryContext: {
              patientId: 'p1',
              source: 'worklist',
              focus: 'workflow',
              returnTo: '/worklist',
            },
          },
        },
        '',
        window.location.href,
      );
    }
  });

  await page.goto('/patients/p1');
  expect(runtimeIssues, runtimeIssues.join('\n')).toEqual([]);

  await expect(page).toHaveURL(/\/patients\/p1$/);
  await expect(page.getByTestId('v2-patient-workspace-route')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Patient P1' })).toBeVisible();
  await expect(page.getByTestId('v2-patient-return-link')).toContainText('Return to Worklist');
  await expect(page.getByText('Opened from Worklist')).toBeVisible();
  await expect(page.getByTestId('v2-patient-governance-rail')).toHaveCount(0);
  await expect(page.getByText('Shared handoff')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Context', exact: true })).toBeVisible();
  await expect(page.locator('.v2-patient-header')).toHaveCSS('position', 'static');
  await expect(page.locator('.v2-patient-route__decision-strip')).toHaveCSS('position', 'static');
  await expect(page.locator('.v2-patient-layout')).toHaveCSS('grid-template-columns', /.+/);

  await page.getByTestId('v2-patient-nav-communications').click();
  await expect(page).toHaveURL(/\/patients\/p1\/communications$/);
  await expect(page.getByTestId('v2-patient-communications-pane')).toBeVisible();
  await expect(page.getByTestId('v2-patient-governance-rail')).toHaveCount(0);
  await expect(page.getByText('Coordination support')).toBeVisible();

  await page.getByRole('textbox', { name: 'Quick reply' }).fill('Saved locally from the patient workspace.');
  await page.getByRole('button', { name: 'Save local reply' }).click();
  await expect(page.getByText('Saved locally from the patient workspace.')).toBeVisible();

  await page.getByRole('button', { name: 'Context', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Care context' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Add shared note' }).fill('Team-visible follow-up note from patient workspace.');
  await page.getByRole('button', { name: 'Add shared note' }).click();
  await expect(page.getByText('Team-visible follow-up note from patient workspace.')).toBeVisible();
  await expect(page.getByText('Saved locally from the patient workspace.')).toBeVisible();
  await page.getByRole('button', { name: 'Close panel' }).click();
  await expect(page.getByRole('heading', { name: 'Care context' })).toBeHidden();

  await page.getByTestId('v2-patient-nav-guidance').click();
  await expect(page).toHaveURL(/\/patients\/p1\/guidance$/);
  await expect(page.getByTestId('v2-patient-guidance-pane')).toBeVisible();
  await expect(page.getByTestId('v2-patient-governance-rail')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Phase, plan, and next save point' })).toBeVisible();

  await page.getByTestId('v2-patient-nav-history').click();
  await expect(page).toHaveURL(/\/patients\/p1\/history$/);
  await expect(page.getByTestId('v2-patient-history-pane')).toBeVisible();
  await expect(page.getByTestId('v2-patient-governance-rail')).toHaveCount(0);
  await expect(page.getByText('Longitudinal patient trajectory')).toBeVisible();
  await expect(page.getByText('No connected wearable source')).toBeVisible();
  await expect(page.getByText('Medication and check-in history remain visible in the main timeline.')).toBeVisible();
  await expect(page.getByText('5 wearable days')).toHaveCount(0);
  expect(tracker.requestLog.some((entry) => entry.pathname.includes('/wearables/'))).toBe(false);
  await expect
    .poll(async () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth))
    .toBe(false);

  await page.setViewportSize({ width: 1180, height: 900 });
  await expect(page.getByRole('button', { name: 'Context', exact: true })).toBeVisible();
  await expect
    .poll(async () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth))
    .toBe(false);
  await page.getByRole('button', { name: 'Context', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Care context' })).toBeVisible();
  await page.getByRole('button', { name: 'Close panel' }).click();
  await expect(page.getByRole('heading', { name: 'Care context' })).toBeHidden();

  await page.setViewportSize({ width: 900, height: 900 });
  await expect(page.getByTestId('v2-patient-history-pane')).toBeVisible();
  await expect
    .poll(async () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth))
    .toBe(false);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId('v2-patient-governance-rail')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Context', exact: true })).toBeVisible();
  await expect
    .poll(async () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth))
    .toBe(false);
  await page.getByRole('button', { name: 'Context', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Care context' })).toBeVisible();
  await page.getByRole('button', { name: 'Close panel' }).click();
  await expect(page.getByRole('heading', { name: 'Care context' })).toBeHidden();

  await page.setViewportSize({ width: 1440, height: 950 });
  await page.evaluate(() => {
    document.documentElement.classList.add('dark');
    document.documentElement.setAttribute('data-theme', 'dark');
  });
  await expect(page.getByTestId('v2-patient-history-pane')).toBeVisible();
  await expect(page.getByTestId('v2-patient-governance-rail')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Context', exact: true })).toBeVisible();

  await page.getByTestId('v2-patient-return-link').click();
  await expect(page).toHaveURL(/\/worklist$/);
  expect(tracker.requestLog.some((entry) => entry.pathname.includes('/wearables/'))).toBe(false);
  expect(runtimeIssues, runtimeIssues.join('\n')).toEqual([]);
});
