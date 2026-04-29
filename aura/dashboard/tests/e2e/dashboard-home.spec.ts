import { expect, test } from '@playwright/test';
import { installMockApi } from './helpers/mockApi';

test('dashboard home loads command-center modules and routes into alerts', async ({ page }) => {
  await installMockApi(page);

  await page.goto('/dashboard');

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId('v2-dashboard-route')).toBeVisible();
  await expect(page.getByTestId('v2-dashboard-attention-panel')).toContainText('Priority now');
  await expect(page.getByTestId('v2-dashboard-summary-strip')).toContainText('Operational summary');
  await expect(page.getByTestId('v2-dashboard-urgent-queue')).toContainText('Assigned high-risk alert');
  await expect(page.getByTestId('v2-dashboard-signals-section')).toBeVisible();
  await expect(page.getByTestId('v2-dashboard-data-context')).toContainText('Review window');

  await page
    .getByTestId('v2-dashboard-attention-panel')
    .getByRole('button', { name: 'Open alerts' })
    .click();

  await expect(page).toHaveURL(/\/alerts$/);
});
