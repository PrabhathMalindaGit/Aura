import { expect, test } from '@playwright/test';
import { installMockApi } from './helpers/mockApi';

test('appointments v2 shows the real-mode cockpit shell when scheduling data is quiet', async ({ page }) => {
  const runtimeIssues: string[] = [];

  page.on('pageerror', (error) => {
    runtimeIssues.push(`pageerror: ${error.stack ?? error.message}`);
  });

  page.on('console', (message) => {
    const text = message.text();
    if (
      message.type() === 'error' &&
      !text.includes('Failed to load resource') &&
      !text.includes('Failed to fetch') &&
      !text.includes('ERR_INTERNET_DISCONNECTED')
    ) {
      runtimeIssues.push(`console:${message.type()}: ${text}`);
    }
  });

  await installMockApi(page, { appointmentRequests: [], appointmentSlots: [] });

  await page.goto('/appointments');
  expect(runtimeIssues, runtimeIssues.join('\n')).toEqual([]);

  await expect(page.getByTestId('v2-appointments-route')).toBeVisible();
  await expect(page.getByTestId('v2-appointments-request-pane')).toContainText('No requests are waiting right now');
  await expect(page.getByTestId('appointments-schedule-week')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No visible capacity in this week' })).toBeVisible();
  await expect(page.getByTestId('v2-appointment-capacity-detail')).toContainText('No open capacity visible');
  await expect(page.getByRole('heading', { name: 'No request selected' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Support context' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Demo data' })).toHaveCount(0);
  await expect(page.getByText('Emily Chen')).toHaveCount(0);

  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(hasHorizontalOverflow).toBe(false);
});

test('appointments v2 preserves request review, publishing context, and responsive scheduling continuity by default', async ({ page }) => {
  const runtimeIssues: string[] = [];

  page.on('pageerror', (error) => {
    runtimeIssues.push(`pageerror: ${error.stack ?? error.message}`);
  });

  page.on('console', (message) => {
    const text = message.text();
    if (
      message.type() === 'error' &&
      !text.includes('Failed to load resource') &&
      !text.includes('Failed to fetch') &&
      !text.includes('ERR_INTERNET_DISCONNECTED')
    ) {
      runtimeIssues.push(`console:${message.type()}: ${text}`);
    }
  });

  await installMockApi(page);

  await page.goto('/appointments');
  expect(runtimeIssues, runtimeIssues.join('\n')).toEqual([]);

  await expect(page).toHaveURL(/\/appointments$/);
  await expect(page.getByTestId('v2-appointments-route')).toBeVisible();
  const plannerWorkspace = page.getByTestId('v2-appointments-planner-workspace');
  await expect(plannerWorkspace).toContainText('Patient P1');

  await plannerWorkspace.getByRole('button', { name: 'Open patient' }).click();
  await expect(page).toHaveURL(/\/patients\/p1$/);

  await page.goBack();
  await expect(page).toHaveURL(/\/appointments$/);
  await expect(plannerWorkspace).toContainText('Patient P1');

  await page.setViewportSize({ width: 900, height: 900 });
  await page.reload();
  await expect(page.getByTestId('v2-appointments-request-pane')).toBeVisible();
  await expect(page.getByTestId('v2-appointments-planner-workspace')).toHaveCount(0);
  await page.getByTestId('v2-appointment-request-row-appointment-request-1').click();
  await expect(page.getByTestId('v2-appointments-planner-workspace')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back to requests' })).toBeVisible();

  await page.setViewportSize({ width: 1180, height: 900 });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Open publishing' })).toBeVisible();
  await page.getByRole('button', { name: 'Open publishing' }).click();
  await expect(page.getByRole('heading', { name: 'Scheduling support context' })).toBeVisible();
  await page.getByLabel('Start (local datetime)').fill('2026-04-20T14:00');
  await page.getByLabel('End (local datetime)').fill('2026-04-20T14:30');
  await page.getByLabel('Meeting link (optional)').fill('https://meet.example.com/follow-up-slot');
  await page.getByRole('button', { name: 'Publish availability' }).click();
  await expect(page.getByText('Availability published')).toBeVisible();

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload();
  await plannerWorkspace.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('Request approved')).toBeVisible();
  await expect(page.getByText(/Booked|Confirmed visit/i)).toHaveCount(0);

  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
  });
  await expect(page.getByTestId('v2-appointments-route')).toBeVisible();

  expect(runtimeIssues, runtimeIssues.join('\n')).toEqual([]);
});
