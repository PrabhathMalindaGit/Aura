import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type {
  ClinicianCoordinationRecord,
  DashboardCommunicationOverview,
} from '../../src/types/models';
import { installMockApi } from './helpers/mockApi';

const COMMUNICATION_OVERVIEW: DashboardCommunicationOverview = {
  counts: {
    needsResponseCount: 2,
    flaggedBySafetyCount: 1,
    followUpRequestedCount: 1,
  },
  items: [
    {
      id: 'communication-1',
      patientId: 'p1',
      patientName: 'Patient P1',
      messageId: 'message-1',
      needsResponse: true,
      flaggedBySafety: true,
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
    {
      id: 'communication-2',
      patientId: 'p2',
      patientName: 'Patient P2',
      messageId: 'message-2',
      needsResponse: true,
      flaggedBySafety: false,
      followUpRequested: false,
      messageCreatedAt: '2026-04-17T08:20:00.000Z',
      messagePreview: 'Can we confirm whether tomorrow still works?',
      patientRiskLevel: 'low',
      openAlertCount: 0,
      lastCheckinAt: '2026-04-16T08:00:00.000Z',
      lastPainScore: 3,
      responseState: 'reviewing',
      responseDelayHours: 24,
      reviewedAfterLatestInbound: false,
    },
  ],
};

const COORDINATION_BY_PATIENT: Record<string, ClinicianCoordinationRecord | null> = {
  p1: {
    patientId: 'p1',
    currentHandoff: {
      summary: 'Shared coordination summary for Patient P1.',
      nextStep: 'plan',
      followUpOwner: {
        kind: 'clinician',
        clinicianId: 'clinician-1',
        displayName: 'Clinician One',
      },
      linkedTaskId: 'task-1',
      linkedTask: {
        id: 'task-1',
        title: 'Check medication adherence',
        type: 'follow_up',
        priority: 'high',
        status: 'open',
        dueAt: '2026-04-18T09:00:00.000Z',
        assignedTo: 'clinician-1',
        updatedAt: '2026-04-17T08:45:00.000Z',
      },
      updatedBy: {
        clinicianId: 'clinician-1',
        displayName: 'Clinician One',
      },
      updatedAt: '2026-04-17T08:45:00.000Z',
    },
    noteHistory: [
      {
        id: 'coord-note-1',
        text: 'Shared coordination note for Patient P1.',
        createdBy: {
          clinicianId: 'clinician-1',
          displayName: 'Clinician One',
        },
        createdAt: '2026-04-17T08:46:00.000Z',
      },
    ],
    createdAt: '2026-04-17T08:45:00.000Z',
    updatedAt: '2026-04-17T08:46:00.000Z',
  },
  p2: null,
};

async function expectCommunicationWorkspaceStack(page: Page): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, 0));

  const statusBox = await page.locator('.v2-inbox-status-bar').boundingBox();
  const queueBox = await page.getByTestId('v2-inbox-queue').boundingBox();
  const activeBox = await page.getByTestId('v2-inbox-active-thread').boundingBox();
  const timelineBox = await page.getByTestId('v2-inbox-timeline').boundingBox();
  const draftBox = await page.getByTestId('v2-inbox-local-draft').boundingBox();

  expect(statusBox).not.toBeNull();
  expect(queueBox).not.toBeNull();
  expect(activeBox).not.toBeNull();
  expect(timelineBox).not.toBeNull();
  expect(draftBox).not.toBeNull();

  expect(queueBox!.y).toBeGreaterThan(statusBox!.y);
  expect(activeBox!.y).toBeGreaterThan(queueBox!.y);
  expect(timelineBox!.y).toBeGreaterThan(activeBox!.y);
  expect(draftBox!.y).toBeGreaterThan(timelineBox!.y);

  await expect(page.getByTestId('v2-inbox-queue-lane')).toBeVisible();
  const hasNoPageOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
  );
  expect(hasNoPageOverflow).toBeTruthy();
}

async function expectCommunicationWorkspaceFocus(page: Page): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, 0));

  await expect(page.getByTestId('v2-inbox-queue')).toHaveCount(0);
  await expect(page.getByTestId('v2-inbox-active-thread')).toBeVisible();
  await expect(page.getByTestId('v2-inbox-timeline')).toBeVisible();
  await expect(page.getByTestId('v2-inbox-local-draft')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back to queue' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review queue' })).toBeVisible();

  const activeBox = await page.getByTestId('v2-inbox-active-thread').boundingBox();
  const timelineBox = await page.getByTestId('v2-inbox-timeline').boundingBox();
  const draftBox = await page.getByTestId('v2-inbox-local-draft').boundingBox();

  expect(activeBox).not.toBeNull();
  expect(timelineBox).not.toBeNull();
  expect(draftBox).not.toBeNull();
  expect(timelineBox!.y).toBeGreaterThan(activeBox!.y);
  expect(draftBox!.y).toBeGreaterThan(timelineBox!.y);

  const hasNoPageOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
  );
  expect(hasNoPageOverflow).toBeTruthy();
}

test('communication v2 restores the selected thread after routing out and back by default', async ({ page }) => {
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
    communicationOverview: COMMUNICATION_OVERVIEW,
    coordinationByPatient: COORDINATION_BY_PATIENT,
  });

  await page.goto('/communication?view=needs-response');
  expect(runtimeIssues, runtimeIssues.join('\n')).toEqual([]);

  await expect(page).toHaveURL(/\/communication\?view=needs-response$/);
  await expect(page.getByTestId('v2-inbox-route')).toBeVisible();
  await expect(page.getByText('Communication triage')).toBeVisible();
  await expect(page.getByTestId('v2-inbox-queue')).toBeVisible();
  await expect(page.getByTestId('v2-inbox-active-thread')).toBeVisible();
  await expect(page.getByTestId('v2-inbox-timeline')).toBeVisible();
  await expect(page.getByTestId('v2-inbox-local-draft')).toBeVisible();
  await expect(page.getByText('Saving here does not send a patient message or update shared coordination.')).toBeVisible();
  await expect(page.getByRole('button', { name: /send patient message/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open alerts' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open patient' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open structured coordination' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Support context' })).toBeVisible();
  await expectCommunicationWorkspaceStack(page);

  await page.getByTestId('v2-inbox-row-p2').click();
  await expect(page.getByTestId('v2-inbox-workspace')).toContainText('Patient P2');
  await expect(page.getByTestId('v2-inbox-timeline')).toContainText('Can we confirm whether tomorrow still works?');

  await page.getByRole('textbox', { name: 'Personal reply draft' }).fill('Saved locally for follow-up.');
  await page.getByRole('button', { name: 'Save local reply' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('textbox', { name: 'Personal reply draft' })).toHaveValue('');
  await expect(
    page.getByTestId('v2-inbox-workspace').getByText('Saved locally for follow-up.'),
  ).toBeVisible();
  await expect(page.getByLabel('Compact coordination summary')).toContainText('Team context');
  await expect(page.getByTestId('v2-inbox-support-rail')).toHaveCount(0);
  await page.getByRole('button', { name: 'Support context' }).click();
  await expect(page.getByRole('heading', { name: 'Support context' })).toBeVisible();
  await expect(page.getByText('Shared coordination', { exact: true }).first()).toBeVisible();
  await page.keyboard.press('Escape');

  await page.setViewportSize({ width: 1180, height: 900 });
  await expectCommunicationWorkspaceStack(page);

  for (const viewport of [
    { width: 900, height: 900 },
    { width: 390, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await expectCommunicationWorkspaceFocus(page);
  }

  await page.evaluate(() => {
    document.documentElement.classList.add('dark');
    document.documentElement.setAttribute('data-theme', 'dark');
  });
  await expectCommunicationWorkspaceFocus(page);

  await page.getByRole('button', { name: 'Open patient' }).click();
  await expect(page).toHaveURL(/\/patients\/p2$/);

  await page.goBack();
  await expect(page).toHaveURL(/\/communication/);
  await expect(page.getByTestId('v2-inbox-workspace')).toContainText('Patient P2');
  await expect(
    page.getByTestId('v2-inbox-workspace').getByText('Saved locally for follow-up.'),
  ).toBeVisible();
});

test('communication v2 keeps narrow queue and workspace focus separate', async ({ page }) => {
  const runtimeIssues: string[] = [];

  page.on('pageerror', (error) => {
    runtimeIssues.push(`pageerror: ${error.stack ?? error.message}`);
  });

  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('Failed to load resource')) {
      runtimeIssues.push(`console:${message.type()}: ${message.text()}`);
    }
  });

  await page.setViewportSize({ width: 390, height: 900 });
  await installMockApi(page, {
    communicationOverview: COMMUNICATION_OVERVIEW,
    coordinationByPatient: COORDINATION_BY_PATIENT,
  });

  await page.goto('/communication?view=needs-response');
  expect(runtimeIssues, runtimeIssues.join('\n')).toEqual([]);

  await expect(page.getByTestId('v2-inbox-route')).toBeVisible();
  await expect(page.getByTestId('v2-inbox-queue')).toBeVisible();
  await expect(page.getByTestId('v2-inbox-row-p1')).toBeVisible();
  await expect(page.getByTestId('v2-inbox-active-thread')).toHaveCount(0);
  await expect(page.getByTestId('v2-inbox-local-draft')).toHaveCount(0);

  await page.getByTestId('v2-inbox-row-p1').click();
  await expect(page.getByTestId('v2-inbox-workspace')).toContainText('Patient P1');
  await expectCommunicationWorkspaceFocus(page);
  await expect(page.getByRole('button', { name: /send patient message/i })).toHaveCount(0);

  await page.getByRole('textbox', { name: 'Personal reply draft' }).fill('Narrow local draft.');
  await page.getByRole('button', { name: 'Back to queue' }).click();

  await expect(page.getByTestId('v2-inbox-queue')).toBeVisible();
  await expect(page.getByTestId('v2-inbox-active-thread')).toHaveCount(0);

  await page.getByTestId('v2-inbox-row-p1').click();
  await expect(page.getByRole('textbox', { name: 'Personal reply draft' })).toHaveValue('Narrow local draft.');

  await page.getByRole('button', { name: 'Review queue' }).click();
  const queueDialog = page.getByRole('dialog', { name: 'Message queue' });
  await expect(queueDialog).toBeVisible();
  await queueDialog.getByTestId('v2-inbox-row-p2').click();

  await expect(queueDialog).toHaveCount(0);
  await expect(page.getByTestId('v2-inbox-workspace')).toContainText('Patient P2');
  await expectCommunicationWorkspaceFocus(page);

  expect(runtimeIssues, runtimeIssues.join('\n')).toEqual([]);
});
