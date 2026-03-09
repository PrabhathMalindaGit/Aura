import { expect, test } from '@playwright/test';
import { installMockApi } from './helpers/mockApi';

test('worklist page loads operational rows and routes safely into alerts', async ({ page }) => {
  await installMockApi(page);

  await page.goto('/worklist');

  await expect(page).toHaveURL(/\/worklist$/);
  await expect(page.getByRole('heading', { level: 2, name: 'Worklist' })).toBeVisible();
  await expect(page.getByText('High pain escalation')).toBeVisible();
  await expect(page.getByText('Missed daily check-ins')).toBeVisible();

  await page.getByRole('button', { name: 'High risk' }).click();
  await expect(page.getByTestId('worklist-row-p1')).toBeVisible();
  await expect(page.getByTestId('worklist-row-p2')).toHaveCount(0);

  await page.getByTestId('worklist-row-p1').getByRole('button', { name: 'Alerts' }).click();
  await expect(page).toHaveURL(/\/alerts$/);
});
