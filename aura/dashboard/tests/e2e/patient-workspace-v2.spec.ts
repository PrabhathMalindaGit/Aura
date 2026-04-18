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

  await installMockApi(page, {
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

  await page.getByTestId('v2-patient-nav-communications').click();
  await expect(page).toHaveURL(/\/patients\/p1\/communications$/);
  await expect(page.getByTestId('v2-patient-communications-pane')).toBeVisible();

  await page.getByRole('textbox', { name: 'Quick reply' }).fill('Saved locally from the patient workspace.');
  await page.getByRole('button', { name: 'Save local reply' }).click();
  await expect(page.getByText('Saved locally from the patient workspace.')).toBeVisible();

  await page.getByRole('textbox', { name: 'Add shared note' }).fill('Team-visible follow-up note from patient workspace.');
  await page.getByRole('button', { name: 'Add shared note' }).click();
  await expect(page.getByText('Team-visible follow-up note from patient workspace.')).toBeVisible();
  await expect(page.getByText('Saved locally from the patient workspace.')).toBeVisible();

  await page.getByTestId('v2-patient-nav-guidance').click();
  await expect(page).toHaveURL(/\/patients\/p1\/guidance$/);
  await expect(page.getByTestId('v2-patient-guidance-pane')).toBeVisible();

  await page.getByTestId('v2-patient-nav-history').click();
  await expect(page).toHaveURL(/\/patients\/p1\/history$/);
  await expect(page.getByTestId('v2-patient-history-pane')).toBeVisible();

  await page.setViewportSize({ width: 1180, height: 900 });
  await expect(page.getByRole('button', { name: 'Open support' })).toBeVisible();
  await page.getByRole('button', { name: 'Open support' }).click();
  await expect(page.getByRole('heading', { name: 'Patient support context' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Patient support context' })).toBeHidden();

  await page.getByTestId('v2-patient-return-link').click();
  await expect(page).toHaveURL(/\/worklist$/);
  expect(runtimeIssues, runtimeIssues.join('\n')).toEqual([]);
});
