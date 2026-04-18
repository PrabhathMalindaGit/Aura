import { expect, test } from '@playwright/test';
import { installMockApi } from './helpers/mockApi';

test('worklist v2 restores the active case after routing out and back by default', async ({ page }) => {
  const runtimeIssues: string[] = [];

  page.on('pageerror', (error) => {
    runtimeIssues.push(`pageerror: ${error.stack ?? error.message}`);
  });

  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('Failed to load resource')) {
      runtimeIssues.push(`console:${message.type()}: ${message.text()}`);
    }
  });

  await installMockApi(page);

  await page.goto('/worklist');
  expect(runtimeIssues, runtimeIssues.join('\n')).toEqual([]);

  await expect(page).toHaveURL(/\/worklist$/);
  await expect(page.getByTestId('triage-queue-route')).toBeVisible();

  await page.getByTestId('triage-queue-row-p2').click();
  await expect(page.getByTestId('triage-active-workspace')).toContainText('Patient P2');

  await page.getByRole('button', { name: 'Open patient' }).click();
  await expect(page).toHaveURL(/\/patients\/p2$/);

  await page.goBack();
  await expect(page).toHaveURL(/\/worklist$/);
  await expect(page.getByTestId('triage-active-workspace')).toContainText('Patient P2');
});
