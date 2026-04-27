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
  await expect(page.getByText('Selected request context')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Support context' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Load presentation data' })).toBeVisible();
  await expect(page.getByText('Emily Chen')).toHaveCount(0);

  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(hasHorizontalOverflow).toBe(false);
});

test('appointments presentation data stays local across planner controls and publish', async ({ page }) => {
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

  const tracker = await installMockApi(page, { appointmentRequests: [], appointmentSlots: [] });

  await page.goto('/appointments');
  await page.getByRole('button', { name: 'Load presentation data' }).click();

  await expect(page).toHaveURL(/\/appointments$/);
  await expect(page.getByRole('button', { name: 'Presentation data loaded' })).toBeVisible();
  await expect(page.getByTestId('v2-appointments-planner-workspace')).toContainText('Emily Chen');
  await expect(page.getByTestId('v2-appointments-request-pane')).toContainText('Emily Chen');
  await expect(page.getByTestId('v2-appointment-request-row-presentation-request-emily-chen')).toContainText('Reason');
  await expect(page.getByTestId('v2-appointment-request-row-presentation-request-emily-chen')).toContainText('Constraints');
  await expect(page.getByText('Selected request context')).toHaveCount(0);
  const presentationOnlyButton = page.getByRole('button', {
    name: 'Presentation only. Patient workspace unavailable for presentation data.',
  });
  await expect(presentationOnlyButton).toBeVisible();
  await expect(presentationOnlyButton).toBeDisabled();
  await expect(page.getByText('Presentation only')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open patient' })).toHaveCount(0);
  expect(tracker.requestLog.some((entry) => entry.pathname.includes('presentation-emily-chen'))).toBe(false);

  await page.getByRole('button', { name: 'Day', exact: true }).click();
  await expect(page.getByText('Presentation range locked')).toBeVisible();
  await expect(page.getByText('Emily Chen').first()).toBeVisible();

  await page.getByRole('button', { name: 'Previous' }).click();
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Week' }).click();
  await expect(page.getByText('Emily Chen').first()).toBeVisible();

  const requestLogLengthBeforeReview = tracker.requestLog.length;

  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.getByText('Presentation request updated locally. No backend records were changed.')).toBeVisible();
  await expect(page.getByTestId('v2-appointment-request-row-presentation-request-emily-chen')).toHaveCount(0);

  await page.getByRole('button', { name: 'Reject', exact: true }).click();
  await expect(page.getByText('Presentation request updated locally. No backend records were changed.')).toBeVisible();
  await expect(page.getByTestId('v2-appointment-request-row-presentation-request-robert-jackson')).toHaveCount(0);

  expect(
    tracker.requestLog
      .slice(requestLogLengthBeforeReview)
      .some(
        (entry) =>
          entry.pathname.startsWith('/clinician/appointments/requests/') &&
          ['PATCH', 'POST', 'PUT'].includes(entry.method),
      ),
  ).toBe(false);

  await page.getByRole('button', { name: 'Publish availability' }).click();
  await expect(page.getByText('Availability added to presentation view')).toBeVisible();
  await expect(page.getByText(/No backend records were written/i)).toBeVisible();
  expect(
    tracker.requestLog.some(
      (entry) => entry.pathname === '/clinician/appointments/slots' && entry.method === 'POST',
    ),
  ).toBe(false);

  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(hasHorizontalOverflow).toBe(false);
  expect(runtimeIssues, runtimeIssues.join('\n')).toEqual([]);
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
  await expect(plannerWorkspace).toContainText('Planner');
  await expect(page.getByRole('heading', { name: 'Patient P1' })).toBeVisible();

  await page.getByRole('button', { name: 'Open patient' }).click();
  await expect(page).toHaveURL(/\/patients\/p1$/);

  await page.goBack();
  await expect(page).toHaveURL(/\/appointments$/);
  await expect(page.getByRole('heading', { name: 'Patient P1' })).toBeVisible();

  await page.setViewportSize({ width: 900, height: 900 });
  await page.reload();
  await expect(page.getByTestId('v2-appointments-request-pane')).toBeVisible();
  await expect(page.getByTestId('v2-appointments-planner-workspace')).toBeVisible();
  await page.getByTestId('v2-appointment-request-row-appointment-request-1').click();
  await expect(page.getByTestId('v2-appointments-planner-workspace')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back to requests' })).toHaveCount(0);

  await page.setViewportSize({ width: 1180, height: 900 });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Open only the time still needed' })).toBeVisible();
  await page.getByLabel('Start (local datetime)').fill('2026-04-20T14:00');
  await page.getByLabel('End (local datetime)').fill('2026-04-20T14:30');
  await page.getByLabel('Meeting link (optional)').fill('https://meet.example.com/follow-up-slot');
  await page.getByRole('button', { name: 'Publish availability' }).click();
  await expect(page.getByText('Availability published')).toBeVisible();

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload();
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.getByText('Request approved')).toBeVisible();
  await expect(page.getByText(/Booked|Confirmed visit/i)).toHaveCount(0);

  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
  });
  await expect(page.getByTestId('v2-appointments-route')).toBeVisible();

  expect(runtimeIssues, runtimeIssues.join('\n')).toEqual([]);
});
