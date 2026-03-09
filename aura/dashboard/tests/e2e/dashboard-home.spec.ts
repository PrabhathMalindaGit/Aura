import { expect, test } from '@playwright/test';
import { installMockApi } from './helpers/mockApi';

test('dashboard home loads command-center modules and routes into alerts', async ({ page }) => {
  await installMockApi(page);

  await page.goto('/');

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { level: 2, name: 'Dashboard' })).toBeVisible();
  await expect(page.locator('.dashboard-priority-card')).toContainText('Priority queue');
  await expect(page.getByText('Assigned high-risk alert')).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: /Recent safety events/ })).toBeVisible();
  await expect(page.locator('.dashboard-appointments-card')).toContainText("Today's appointments");
  await expect(page.locator('.dashboard-tasks-card')).toContainText('Follow-up tasks');
  await expect(page.locator('.dashboard-communication-card')).toContainText('Communication review');

  const priorityCard = page.locator('.dashboard-priority-card');
  await priorityCard.locator('.card__header').getByRole('button', { name: 'Open alerts' }).click();

  await expect(page).toHaveURL(/\/alerts$/);
});
