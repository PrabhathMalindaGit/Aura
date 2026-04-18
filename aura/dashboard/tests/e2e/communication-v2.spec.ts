import { expect, test } from '@playwright/test';
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

  await page.getByTestId('v2-inbox-row-p2').click();
  await expect(page.getByTestId('v2-inbox-workspace')).toContainText('Patient P2');

  await page.getByRole('textbox', { name: 'Personal reply draft' }).fill('Saved locally for follow-up.');
  await page.getByRole('button', { name: 'Save local reply' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('textbox', { name: 'Personal reply draft' })).toHaveValue('');
  await expect(
    page.getByTestId('v2-inbox-workspace').getByText('Saved locally for follow-up.'),
  ).toBeVisible();
  await expect(page.getByText('Shared coordination', { exact: true }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Open patient' }).click();
  await expect(page).toHaveURL(/\/patients\/p2$/);

  await page.goBack();
  await expect(page).toHaveURL(/\/communication/);
  await expect(page.getByTestId('v2-inbox-workspace')).toContainText('Patient P2');
  await expect(
    page.getByTestId('v2-inbox-workspace').getByText('Saved locally for follow-up.'),
  ).toBeVisible();
});
