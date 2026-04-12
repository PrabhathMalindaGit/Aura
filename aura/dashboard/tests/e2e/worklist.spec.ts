import { expect, test } from '@playwright/test';
import { installMockApi } from './helpers/mockApi';

test('worklist page loads operational rows and routes safely into alerts', async ({ page }) => {
  await installMockApi(page);

  await page.goto('/worklist');

  await expect(page).toHaveURL(/\/worklist$/);
  await expect(page.getByText('High pain escalation')).toBeVisible();
  await expect(page.getByText('Missed daily check-ins')).toBeVisible();

  await page.getByRole('button', { name: 'High risk' }).click();
  const prioritizedPatient = page.locator('[data-testid="worklist-row-p1"], [data-testid="worklist-card-p1"]');
  const secondaryPatient = page.locator('[data-testid="worklist-row-p2"], [data-testid="worklist-card-p2"]');
  await expect(prioritizedPatient).toBeVisible();
  await expect(secondaryPatient).toHaveCount(0);

  await prioritizedPatient.getByRole('button', { name: 'Open alerts' }).click();
  await expect(page).toHaveURL(/\/alerts(\?|$)/);
});
