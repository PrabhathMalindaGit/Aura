import { expect, test } from '@playwright/test';
import { installMockApi } from './helpers/mockApi';

test('dashboard home loads command-center modules and routes into alerts', async ({ page }) => {
  await installMockApi(page);

  await page.goto('/dashboard');

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText('Open next')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Due today' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Inbox needing response' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Keep the day moving' })).toBeVisible();
  await expect(page.getByText('Assigned high-risk alert')).toBeVisible();
  await expect(page.getByText('Operational context')).toBeVisible();

  await page.getByRole('button', { name: 'Open alerts' }).first().click();

  await expect(page).toHaveURL(/\/alerts$/);
});
