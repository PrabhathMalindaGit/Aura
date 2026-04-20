import { expect, test } from '@playwright/test';
import { installMockApi } from './helpers/mockApi';

test('patients v2 keeps roster-to-workspace navigation inside the v2 flow by default', async ({
  page,
}) => {
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

  await page.goto('/patients');
  expect(runtimeIssues, runtimeIssues.join('\n')).toEqual([]);

  await expect(page).toHaveURL(/\/patients$/);
  await expect(page.getByTestId('v2-patients-route')).toBeVisible();
  await expect(page.getByTestId('v2-patients-status-bar')).toContainText('Patients');
  await expect(page.getByRole('table', { name: 'Patients roster results' })).toBeVisible();
  await expect(page.getByText('Freshness & scope')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Context' })).toBeVisible();

  await page.getByRole('button', { name: 'Context' }).click();
  await expect(page.getByText('Freshness & scope')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Open explanation drawer' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByText('Freshness & scope')).toHaveCount(0);

  await page.setViewportSize({ width: 960, height: 900 });
  await page.reload();
  await expect(page.getByTestId('v2-patients-route')).toBeVisible();
  await expect(page.getByRole('table', { name: 'Patients roster results' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Context' })).toBeVisible();

  await page.getByTestId('v2-patients-open-patient-p1').click();
  await expect(page).toHaveURL(/\/patients\/p1$/);
  await expect(page.getByTestId('v2-patient-workspace-route')).toBeVisible();
  await expect(page.getByTestId('v2-patient-return-link')).toContainText('Return to Patients');
  await expect(page.getByText('Opened from Patients roster')).toBeVisible();

  await page.getByTestId('v2-patient-return-link').click();
  await expect(page).toHaveURL(/\/patients$/);
  await expect(page.getByTestId('v2-patients-route')).toBeVisible();

  await page.setViewportSize({ width: 560, height: 900 });
  await page.reload();
  await expect(page.getByTestId('v2-patients-route')).toBeVisible();
  await expect(page.getByTestId('v2-patients-card-p1')).toBeVisible();

  expect(runtimeIssues, runtimeIssues.join('\n')).toEqual([]);
});
