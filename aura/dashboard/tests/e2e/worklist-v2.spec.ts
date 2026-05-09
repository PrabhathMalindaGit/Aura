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
  await expect(page.locator('.triage-workspace__header')).toHaveCSS('position', 'static');
  await expect(page.locator('.triage-workspace .v2-sticky-patient-header')).toHaveCSS('position', 'static');
  await expect(page.getByTestId('triage-status-strip')).toBeVisible();
  await expect(page.getByTestId('triage-status-strip').getByRole('heading')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Supporting context' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Governance' })).toBeVisible();
  await expect(page.getByTestId('triage-queue-row-p1')).toContainText('Selected');
  await expect(page.getByTestId('triage-queue-row-p1')).toHaveAttribute('aria-pressed', 'true');

  await page.getByTestId('triage-queue-row-p2').click();
  await expect(page.getByTestId('triage-active-workspace')).toContainText('Patient P2');
  await expect(page.getByTestId('triage-queue-row-p2')).toContainText('Selected');
  await expect(page.getByTestId('triage-queue-row-p2')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('triage-queue-row-p1')).not.toContainText('Selected');
  await page.getByRole('button', { name: 'Governance' }).click();
  await expect(page.getByRole('heading', { name: 'Governance' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Governance' })).toBeHidden();

  await page.getByRole('button', { name: 'Open patient' }).click();
  await expect(page).toHaveURL(/\/patients\/p2$/);

  await page.goBack();
  await expect(page).toHaveURL(/\/worklist$/);
  await expect(page.getByTestId('triage-active-workspace')).toContainText('Patient P2');
});
